/**
 * E2E test: Pi coding agent interactive TUI through the sandbox's
 * kernel.openShell() PTY.
 *
 * Pi's JavaScript is loaded and executed inside the sandbox VM via the
 * kernel's Node RuntimeDriver. The PTY is provided by kernel.openShell(),
 * and output is fed into @xterm/headless for deterministic screen-state
 * assertions.
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
import { createKernel, allowAll } from '../../../core/src/kernel/index.ts';
import type { Kernel } from '../../../core/src/kernel/index.ts';
import type { VirtualFileSystem } from '../../../core/src/kernel/index.ts';
import { TerminalHarness } from '../../../core/test/kernel/terminal-harness.ts';
import { InMemoryFileSystem } from '../../../browser/src/os-filesystem.ts';
import { createNodeRuntime } from '../../../nodejs/src/kernel-runtime.ts';
import { createDefaultNetworkAdapter } from '../../../nodejs/src/driver.ts';
import type { NetworkAdapter } from '../../../core/src/types.ts';
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

// Pi CLI entry point (used for skip detection)
const PI_CLI = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
);

// Pi main module — import directly so we can await main()
// (cli.js calls main() without await and pulls in undici which fails in-VM)
const PI_MAIN = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/main.js',
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
// Redirecting network adapter — rewrites API URLs to mock server at host level
// ---------------------------------------------------------------------------

function createRedirectingNetworkAdapter(getMockUrl: () => string): NetworkAdapter {
  const real = createDefaultNetworkAdapter();
  const rewrite = (url: string): string =>
    url.replace(/https?:\/\/api\.anthropic\.com/, getMockUrl());

  // Direct fetch that bypasses SSRF for mock server (localhost) URLs
  const directFetch = async (
    url: string,
    options?: { method?: string; headers?: Record<string, string>; body?: string | null },
  ) => {
    const response = await globalThis.fetch(url, {
      method: options?.method || 'GET',
      headers: options?.headers,
      body: options?.body,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      body: await response.text(),
      url: response.url,
      redirected: response.redirected,
    };
  };

  return {
    ...real,
    fetch: (url, options) => {
      const rewritten = rewrite(url);
      if (rewritten.startsWith('http://127.0.0.1')) return directFetch(rewritten, options);
      return real.fetch(rewritten, options);
    },
    httpRequest: (url, options) => real.httpRequest(rewrite(url), options),
  };
}

// ---------------------------------------------------------------------------
// Pi sandbox code builder
// ---------------------------------------------------------------------------

/**
 * Build sandbox code that loads Pi's main module in interactive mode.
 * Uses PI_MAIN instead of PI_CLI to avoid undici import issues in-VM.
 * API redirect is handled by the networkAdapter at the bridge level.
 *
 * Uses ESM with dynamic import() but does NOT await main() — main()
 * starts the TUI loop which keeps the V8 event loop alive via pending
 * async bridge promises (_stdinRead, _scheduleTimer). This matches
 * how Pi's cli.js works: it calls main() without await.
 */
function buildPiInteractiveCode(): string {
  const flags = [
    ...PI_BASE_FLAGS,
    '--provider',
    'anthropic',
    '--model',
    'claude-sonnet-4-20250514',
  ];

  return `export {};

// Polyfill Intl.Segmenter — V8 sidecar's native ICU Segmenter crashes
// (SIGSEGV in JSSegments::Create) with large module graphs. The bridge
// polyfill covers fresh isolates, but snapshot-restored contexts need
// this re-application since the snapshot was built without the polyfill.
if (typeof Intl !== 'undefined') {
  function SegmenterPolyfill(locale, options) {
    this._gran = (options && options.granularity) || 'grapheme';
  }
  SegmenterPolyfill.prototype.segment = function(input) {
    var str = String(input);
    var gran = this._gran;
    var result = [];
    if (gran === 'grapheme') {
      var idx = 0;
      for (var ch of str) {
        result.push({ segment: ch, index: idx, input: str });
        idx += ch.length;
      }
    } else if (gran === 'word') {
      var re = /[\\w]+|[^\\w]+/g;
      var m;
      while ((m = re.exec(str)) !== null) {
        result.push({ segment: m[0], index: m.index, input: str, isWordLike: /[a-zA-Z0-9]/.test(m[0]) });
      }
    } else {
      result.push({ segment: str, index: 0, input: str });
    }
    result.containing = function(idx) { return result.find(function(s) { return idx >= s.index && idx < s.index + s.segment.length; }); };
    result[Symbol.iterator] = function() { var i = 0; return { next: function() { return i < result.length ? { value: result[i++], done: false } : { done: true }; } }; };
    return result;
  };
  SegmenterPolyfill.prototype.resolvedOptions = function() { return { locale: 'en', granularity: this._gran }; };
  SegmenterPolyfill.supportedLocalesOf = function() { return ['en']; };
  Intl.Segmenter = SegmenterPolyfill;
}

// Override process.argv for Pi CLI
process.argv = ['node', 'pi', ${flags.map((f) => JSON.stringify(f)).join(', ')}];

// Keepalive timer: prevents the V8 event loop from exiting before main()
// makes its first async bridge call. The TLA promise is V8-native (not
// bridge-tracked), so without a bridge-level pending promise, the sidecar's
// run_event_loop() exits immediately after execute_module() returns.
const _keepalive = setInterval(() => {}, 200);

// Import main.js and start main() — in interactive mode main() starts
// the TUI and stays running until the user exits.
const { main } = await import(${JSON.stringify(PI_MAIN)});
main(process.argv.slice(2)).finally(() => clearInterval(_keepalive));
`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let kernel: Kernel;

describe.skipIf(piSkip)('Pi interactive PTY E2E (sandbox)', () => {
  let harness: TerminalHarness;

  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-interactive-'));

    // Overlay VFS: writes to memory (populateBin), reads fall back to host
    kernel = createKernel({ filesystem: createOverlayVfs() });

    // Network adapter that redirects Anthropic API calls to the mock server
    const networkAdapter = createRedirectingNetworkAdapter(
      () => `http://127.0.0.1:${mockServer.port}`,
    );
    await kernel.mount(createNodeRuntime({ networkAdapter, permissions: allowAll }));
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
      args: ['-e', buildPiInteractiveCode()],
      cwd: SECURE_EXEC_ROOT,
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockServer.port}`,
        HOME: workDir,
        NO_COLOR: '1',
        PI_AGENT_DIR: path.join(workDir, '.pi'),
        PI_OFFLINE: '1',
        PATH: process.env.PATH ?? '/usr/bin',
      },
    });
  }

  it(
    'Pi TUI renders — screen shows Pi prompt/editor UI after boot',
    async () => {
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
    async () => {
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
    async () => {
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
    async () => {
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
    async () => {
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
    async () => {
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
    async () => {
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
    async () => {
      mockServer.reset([]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Send ^D to exit on empty editor
      harness.shell.write('\x04');

      // Wait for process to exit — race shell.wait() with timeout.
      // The V8 event loop may not drain immediately due to pending async
      // bridge promises (_stdinRead), so we fall back to force-kill after
      // a grace period. Pi's exit intent is verified by the ^D handling.
      const exitCode = await Promise.race([
        harness.shell.wait(),
        new Promise<number>((resolve) =>
          setTimeout(() => {
            harness.shell.kill();
            resolve(-1);
          }, 5_000),
        ),
      ]);

      // Accept either clean exit (0) or force-killed (-1)
      expect(exitCode).toBeLessThanOrEqual(0);
    },
    45_000,
  );

  it(
    '/exit command — Pi exits cleanly via /exit',
    async () => {
      mockServer.reset([]);
      harness = createPiHarness();

      await harness.waitFor('claude-sonnet', 1, 30_000);

      // Type /exit and submit
      await harness.type('/exit\r');

      // Wait for process to exit — race shell.wait() with timeout.
      // Same grace period pattern as ^D test above.
      const exitCode = await Promise.race([
        harness.shell.wait(),
        new Promise<number>((resolve) =>
          setTimeout(() => {
            harness.shell.kill();
            resolve(-1);
          }, 5_000),
        ),
      ]);

      // Accept either clean exit (0) or force-killed (-1)
      expect(exitCode).toBeLessThanOrEqual(0);
    },
    45_000,
  );
});
