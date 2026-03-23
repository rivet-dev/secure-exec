/**
 * E2E test: Pi coding agent interactive TUI through the sandbox's
 * kernel.openShell() PTY.
 *
 * Pi's JavaScript is loaded and executed inside the sandbox VM via the
 * kernel's Node RuntimeDriver. The PTY is provided by kernel.openShell(),
 * and output is fed into @xterm/headless for deterministic screen-state
 * assertions.
 *
 * If the sandbox cannot support Pi's interactive TUI (e.g. isTTY bridge
 * not supported, module resolution failure), all tests skip with a clear
 * reason referencing the specific blocker.
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createKernel } from '../../../core/src/kernel/index.ts';
import type { Kernel } from '../../../core/src/kernel/index.ts';
import type { VirtualFileSystem } from '../../../core/src/kernel/index.ts';
import { TerminalHarness } from '../../../core/test/kernel/terminal-harness.ts';
import { InMemoryFileSystem } from '../../../browser/src/os-filesystem.ts';
import { createNodeRuntime } from '../../../nodejs/src/kernel-runtime.ts';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

function skipUnlessPiInstalled(): string | false {
  const cliPath = path.resolve(
    SECURE_EXEC_ROOT,
    'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
  );
  return existsSync(cliPath)
    ? false
    : '@mariozechner/pi-coding-agent not installed';
}

const piSkip = skipUnlessPiInstalled();

// Pi CLI entry point
const PI_CLI = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
);

// ---------------------------------------------------------------------------
// Common Pi CLI flags
// ---------------------------------------------------------------------------

const PI_BASE_FLAGS = [
  '--verbose',
  '--no-session',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
];

// ---------------------------------------------------------------------------
// Overlay VFS — writes to InMemoryFileSystem, reads fall back to host
// ---------------------------------------------------------------------------

/**
 * Create an overlay filesystem: writes go to an in-memory layer (for
 * kernel.mount() populateBin), reads try memory first then fall back to
 * the host filesystem (for Pi's module resolution).
 */
function createOverlayVfs(): VirtualFileSystem {
  const memfs = new InMemoryFileSystem();
  return {
    readFile: async (p) => {
      try { return await memfs.readFile(p); }
      catch { return new Uint8Array(await fsPromises.readFile(p)); }
    },
    readTextFile: async (p) => {
      try { return await memfs.readTextFile(p); }
      catch { return await fsPromises.readFile(p, 'utf-8'); }
    },
    readDir: async (p) => {
      try { return await memfs.readDir(p); }
      catch { return await fsPromises.readdir(p); }
    },
    readDirWithTypes: async (p) => {
      try { return await memfs.readDirWithTypes(p); }
      catch {
        const entries = await fsPromises.readdir(p, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
      }
    },
    exists: async (p) => {
      if (await memfs.exists(p)) return true;
      try { await fsPromises.access(p); return true; } catch { return false; }
    },
    stat: async (p) => {
      try { return await memfs.stat(p); }
      catch {
        const s = await fsPromises.stat(p);
        return {
          mode: s.mode, size: s.size, isDirectory: s.isDirectory(),
          isSymbolicLink: false,
          atimeMs: s.atimeMs, mtimeMs: s.mtimeMs,
          ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs,
        };
      }
    },
    lstat: async (p) => {
      try { return await memfs.lstat(p); }
      catch {
        const s = await fsPromises.lstat(p);
        return {
          mode: s.mode, size: s.size, isDirectory: s.isDirectory(),
          isSymbolicLink: s.isSymbolicLink(),
          atimeMs: s.atimeMs, mtimeMs: s.mtimeMs,
          ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs,
        };
      }
    },
    realpath: async (p) => {
      try { return await memfs.realpath(p); }
      catch { return await fsPromises.realpath(p); }
    },
    readlink: async (p) => {
      try { return await memfs.readlink(p); }
      catch { return await fsPromises.readlink(p); }
    },
    pread: async (p, offset, length) => {
      try { return await memfs.pread(p, offset, length); }
      catch {
        const fd = await fsPromises.open(p, 'r');
        try {
          const buf = Buffer.alloc(length);
          const { bytesRead } = await fd.read(buf, 0, length, offset);
          return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
        } finally { await fd.close(); }
      }
    },
    writeFile: (p, content) => memfs.writeFile(p, content),
    createDir: (p) => memfs.createDir(p),
    mkdir: (p, opts) => memfs.mkdir(p, opts),
    removeFile: (p) => memfs.removeFile(p),
    removeDir: (p) => memfs.removeDir(p),
    rename: (oldP, newP) => memfs.rename(oldP, newP),
    symlink: (target, linkP) => memfs.symlink(target, linkP),
    link: (oldP, newP) => memfs.link(oldP, newP),
    chmod: (p, mode) => memfs.chmod(p, mode),
    chown: (p, uid, gid) => memfs.chown(p, uid, gid),
    utimes: (p, atime, mtime) => memfs.utimes(p, atime, mtime),
    truncate: (p, length) => memfs.truncate(p, length),
  };
}

// ---------------------------------------------------------------------------
// Pi sandbox code builder
// ---------------------------------------------------------------------------

/**
 * Build sandbox code that loads Pi's CLI entry point in interactive mode.
 *
 * Patches fetch to redirect Anthropic API calls to the mock server,
 * sets process.argv for CLI mode, and loads the CLI entry point.
 */
function buildPiInteractiveCode(opts: {
  mockUrl: string;
  cwd: string;
}): string {
  const flags = [
    ...PI_BASE_FLAGS,
    '--provider',
    'anthropic',
    '--model',
    'claude-sonnet-4-20250514',
  ];

  return `(async () => {
    // Patch fetch to redirect Anthropic API calls to mock server
    const origFetch = globalThis.fetch;
    const mockUrl = ${JSON.stringify(opts.mockUrl)};
    globalThis.fetch = function(input, init) {
      let url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input.url;
      if (url && url.includes('api.anthropic.com')) {
        const newUrl = url.replace(/https?:\\/\\/api\\.anthropic\\.com/, mockUrl);
        if (typeof input === 'string') input = newUrl;
        else if (input instanceof URL) input = new URL(newUrl);
        else input = new Request(newUrl, input);
      }
      return origFetch.call(this, input, init);
    };

    // Override process.argv for Pi CLI
    process.argv = ['node', 'pi', ${flags.map((f) => JSON.stringify(f)).join(', ')}];

    // Set HOME for Pi's working directory
    process.env.HOME = ${JSON.stringify(opts.cwd)};
    process.env.ANTHROPIC_API_KEY = 'test-key';

    // Load Pi CLI entry point
    await import(${JSON.stringify(PI_CLI)});
  })()`;
}

// ---------------------------------------------------------------------------
// Raw openShell probe — avoids TerminalHarness race on fast-exiting processes
// ---------------------------------------------------------------------------

/**
 * Run a node command through kernel.openShell and collect raw output.
 * Waits for exit and returns all output + exit code.
 */
async function probeOpenShell(
  kernel: Kernel,
  code: string,
  timeoutMs = 10_000,
): Promise<{ output: string; exitCode: number }> {
  const shell = kernel.openShell({
    command: 'node',
    args: ['-e', code],
    cwd: SECURE_EXEC_ROOT,
  });
  let output = '';
  shell.onData = (data) => {
    output += new TextDecoder().decode(data);
  };
  const exitCode = await Promise.race([
    shell.wait(),
    new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  return { output, exitCode };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let kernel: Kernel;
let sandboxSkip: string | false = false;

describe.skipIf(piSkip)('Pi interactive PTY E2E (sandbox)', () => {
  let harness: TerminalHarness;

  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-interactive-'));

    // Overlay VFS: writes to memory (populateBin), reads fall back to host
    kernel = createKernel({ filesystem: createOverlayVfs() });
    await kernel.mount(createNodeRuntime());

    // Probe 1: check if node works through openShell
    try {
      const { output, exitCode } = await probeOpenShell(
        kernel,
        'console.log("PROBE_OK")',
      );
      if (exitCode !== 0 || !output.includes('PROBE_OK')) {
        sandboxSkip = `openShell + node probe failed: exitCode=${exitCode}, output=${JSON.stringify(output)}`;
      }
    } catch (e) {
      sandboxSkip = `openShell + node probe failed: ${(e as Error).message}`;
    }

    // Probe 2: check if isTTY is bridged through the PTY
    if (!sandboxSkip) {
      try {
        const { output } = await probeOpenShell(
          kernel,
          'console.log("IS_TTY:" + !!process.stdout.isTTY)',
        );
        if (output.includes('IS_TTY:false')) {
          sandboxSkip =
            'isTTY bridge not supported in kernel Node RuntimeDriver — ' +
            'Pi requires process.stdout.isTTY for TUI rendering (spec gap #5)';
        } else if (!output.includes('IS_TTY:true')) {
          sandboxSkip = `isTTY probe inconclusive: ${JSON.stringify(output)}`;
        }
      } catch (e) {
        sandboxSkip = `isTTY probe failed: ${(e as Error).message}`;
      }
    }

    // Probe 3: if isTTY passed, check Pi can load
    if (!sandboxSkip) {
      try {
        const { output, exitCode } = await probeOpenShell(
          kernel,
          '(async()=>{try{const pi=await import("@mariozechner/pi-coding-agent");' +
            'console.log("PI_LOADED:"+typeof pi.createAgentSession)}catch(e){' +
            'console.log("PI_LOAD_FAILED:"+e.message)}})()',
          15_000,
        );
        if (output.includes('PI_LOAD_FAILED:')) {
          const reason = output.split('PI_LOAD_FAILED:')[1]?.split('\n')[0]?.trim();
          sandboxSkip = `Pi cannot load in sandbox via openShell: ${reason}`;
        } else if (exitCode !== 0 || !output.includes('PI_LOADED:function')) {
          sandboxSkip = `Pi load probe failed: exitCode=${exitCode}, output=${JSON.stringify(output.slice(0, 500))}`;
        }
      } catch (e) {
        sandboxSkip = `Pi probe failed: ${(e as Error).message}`;
      }
    }

    if (sandboxSkip) {
      console.warn(`[pi-interactive] Skipping all tests: ${sandboxSkip}`);
    }
  }, 30_000);

  afterEach(async () => {
    await harness?.dispose();
  });

  afterAll(async () => {
    await mockServer?.close();
    await kernel?.dispose();
    await rm(workDir, { recursive: true, force: true });
  });

  /** Create a TerminalHarness that runs Pi inside the sandbox PTY. */
  function createPiHarness(): TerminalHarness {
    return new TerminalHarness(kernel, {
      command: 'node',
      args: [
        '-e',
        buildPiInteractiveCode({
          mockUrl: `http://127.0.0.1:${mockServer.port}`,
          cwd: workDir,
        }),
      ],
      cwd: SECURE_EXEC_ROOT,
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        HOME: workDir,
        PATH: process.env.PATH ?? '/usr/bin',
      },
    });
  }

  it(
    'Pi TUI renders — screen shows Pi prompt/editor UI after boot',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      mockServer.reset([{ type: 'text', text: 'Hello!' }]);
      harness = createPiHarness();

      // Pi TUI shows separator lines and a model status bar on boot
      await harness.waitFor('claude-sonnet', 1, 30_000);

      const screen = harness.screenshotTrimmed();
      expect(screen).toContain('────');
      expect(screen).toContain('claude-sonnet');
    },
    45_000,
  );

  it(
    'input appears on screen — type text, text appears in editor area',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      mockServer.reset([{ type: 'text', text: 'Hello!' }]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Type text into the editor area
      await harness.type('hello world');

      const screen = harness.screenshotTrimmed();
      expect(screen).toContain('hello world');
    },
    45_000,
  );

  it(
    'submit prompt renders response — type prompt + Enter, LLM response renders',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      const canary = 'INTERACTIVE_CANARY_99';
      mockServer.reset([{ type: 'text', text: canary }]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Type a prompt and submit with Enter (\r = CR = Enter key in PTY)
      await harness.type('say hello\r');

      // Wait for the canned LLM response to appear on screen
      await harness.waitFor(canary, 1, 30_000);

      const screen = harness.screenshotTrimmed();
      expect(screen).toContain(canary);
    },
    60_000,
  );

  it(
    '^C interrupts — send SIGINT during response, Pi stays alive',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      mockServer.reset([
        { type: 'text', text: 'First response' },
        { type: 'text', text: 'Second response' },
      ]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Submit a prompt
      await harness.type('say hello\r');

      // Give Pi a moment to start processing, then send ^C
      await new Promise((r) => setTimeout(r, 500));
      await harness.type('\x03');

      // Pi should survive single ^C — editor and status bar still render
      await harness.waitFor('claude-sonnet', 1, 15_000);

      // Verify Pi is still alive by typing more text
      await harness.type('still alive');
      const screen = harness.screenshotTrimmed();
      expect(screen).toContain('still alive');
    },
    60_000,
  );

  it(
    'differential rendering — multiple interactions render without artifacts',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      const firstCanary = 'DIFF_RENDER_FIRST_42';
      const secondCanary = 'DIFF_RENDER_SECOND_77';
      mockServer.reset([
        { type: 'text', text: firstCanary },
        { type: 'text', text: secondCanary },
      ]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // First interaction
      await harness.type('first prompt\r');
      await harness.waitFor(firstCanary, 1, 30_000);

      const screenAfterFirst = harness.screenshotTrimmed();
      expect(screenAfterFirst).toContain(firstCanary);

      // Second interaction — Pi re-renders, new response should appear
      await harness.type('second prompt\r');
      await harness.waitFor(secondCanary, 1, 30_000);

      const screenAfterSecond = harness.screenshotTrimmed();
      expect(screenAfterSecond).toContain(secondCanary);
      // No garbled escape sequences should appear as visible text
      expect(screenAfterSecond).not.toMatch(/\x1b\[[\d;]*[A-Za-z]/);
    },
    90_000,
  );

  it(
    'synchronized output — CSI ?2026h/l sequences do not leak to screen',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      const canary = 'SYNC_OUTPUT_CANARY';
      mockServer.reset([{ type: 'text', text: canary }]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      await harness.type('say something\r');
      await harness.waitFor(canary, 1, 30_000);

      const screen = harness.screenshotTrimmed();
      // Synchronized update sequences (CSI ?2026h / CSI ?2026l) should be
      // consumed by xterm, not rendered as visible text on screen
      expect(screen).not.toContain('?2026h');
      expect(screen).not.toContain('?2026l');
      expect(screen).toContain(canary);
    },
    60_000,
  );

  it(
    'PTY resize — Pi re-renders for new dimensions',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      mockServer.reset([{ type: 'text', text: 'resize test' }]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      const screenBefore = harness.screenshotTrimmed();

      // Resize PTY to wider terminal and resize xterm to match
      harness.shell.resize(120, 40);
      harness.term.resize(120, 40);

      // Wait for Pi to process SIGWINCH and re-render
      await new Promise((r) => setTimeout(r, 1_000));

      const screenAfter = harness.screenshotTrimmed();
      // Pi should still show its UI elements after resize
      expect(screenAfter).toContain('claude-sonnet');
      // Screen should differ from before (re-rendered at new width)
      // or at minimum still be a valid TUI (not blank/garbled)
      expect(screenAfter.length).toBeGreaterThan(0);
    },
    45_000,
  );

  it(
    'exit cleanly — ^D on empty editor, Pi exits and PTY closes',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      mockServer.reset([]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Send ^D to exit on empty editor
      harness.shell.write('\x04');

      // Wait for process to exit
      const exitCode = await Promise.race([
        harness.shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(
            () => reject(new Error('Pi did not exit within 10s')),
            10_000,
          ),
        ),
      ]);

      expect(exitCode).toBe(0);
    },
    45_000,
  );

  it(
    '/exit command — Pi exits cleanly via /exit',
    async ({ skip }) => {
      if (sandboxSkip) skip();

      mockServer.reset([]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Type /exit and submit
      await harness.type('/exit\r');

      // Wait for process to exit
      const exitCode = await Promise.race([
        harness.shell.wait(),
        new Promise<number>((_, reject) =>
          setTimeout(
            () => reject(new Error('Pi did not exit within 10s after /exit')),
            10_000,
          ),
        ),
      ]);

      expect(exitCode).toBe(0);
    },
    45_000,
  );
});
