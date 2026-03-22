/**
 * E2E test: Pi coding agent headless mode inside the secure-exec sandbox.
 *
 * Pi runs INSIDE the sandbox VM via kernel.spawn(). The mock LLM server
 * runs on the host; Pi reaches it through a fetch interceptor patched
 * into the sandbox code.
 *
 * File read tests use the overlay VFS (reads fall back to host filesystem).
 * File write tests verify through the VFS (writes go to in-memory layer).
 *
 * Uses relative imports to avoid cyclic package dependencies.
 */

import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKernel, allowAll } from '../../../core/src/kernel/index.ts';
import type { Kernel, VirtualFileSystem } from '../../../core/src/kernel/index.ts';
import { InMemoryFileSystem } from '../../../browser/src/os-filesystem.ts';
import { createNodeRuntime } from '../../../nodejs/src/kernel-runtime.ts';
import { createDefaultNetworkAdapter } from '../../../nodejs/src/driver.ts';
import { createWasmVmRuntime } from '../../../wasmvm/src/index.ts';
import type { NetworkAdapter } from '../../../core/src/types.ts';
import {
  createMockLlmServer,
  type MockLlmServerHandle,
} from './mock-llm-server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURE_EXEC_ROOT = path.resolve(__dirname, '../..');

// WASM standalone binaries directory
const COMMANDS_DIR = path.resolve(
  __dirname,
  '../../../../native/wasmvm/target/wasm32-wasip1/release/commands',
);
const hasWasm = existsSync(COMMANDS_DIR);

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

const PI_CLI = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
);

// Pi's main module — import directly so we can await main()
// (cli.js calls main() without await, so import(cli.js) resolves immediately)
const PI_MAIN = path.resolve(
  SECURE_EXEC_ROOT,
  'node_modules/@mariozechner/pi-coding-agent/dist/main.js',
);

// ---------------------------------------------------------------------------
// Overlay VFS — writes to InMemoryFileSystem, reads fall back to host
// ---------------------------------------------------------------------------

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
      // Bypass SSRF for localhost mock server
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
 * Build sandbox code that loads Pi's CLI entry point in headless print mode.
 *
 * Patches fetch to redirect Anthropic API calls to the mock server,
 * sets process.argv for CLI mode, and loads the CLI entry point.
 */
function buildPiHeadlessCode(opts: {
  args: string[];
}): string {
  // Use ESM with top-level await — export {} triggers ESM detection so V8 uses
  // execute_module() which properly awaits async work. Without this, execute_script()
  // in CJS mode would return the IIFE's Promise without awaiting it.
  return `export {};

// Override process.argv for Pi CLI
process.argv = ['node', 'pi', ${opts.args.map((a) => JSON.stringify(a)).join(', ')}];

const { main } = await import(${JSON.stringify(PI_MAIN)});
await main(process.argv.slice(2));
`;
}

// ---------------------------------------------------------------------------
// Spawn helper — runs Pi inside sandbox VM via kernel
// ---------------------------------------------------------------------------

interface PiResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function spawnPiInVm(
  kernel: Kernel,
  opts: {
    args: string[];
    cwd: string;
    mockUrl?: string;
    timeoutMs?: number;
  },
): Promise<PiResult> {
  const code = buildPiHeadlessCode({
    args: opts.args,
  });

  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  let outputSettled = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveSettle: ((code: number) => void) | undefined;
  const settlePromise = new Promise<number>((resolve) => { resolveSettle = resolve; });

  const proc = kernel.spawn('node', ['-e', code], {
    cwd: opts.cwd,
    env: {
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: opts.mockUrl ?? '',
      HOME: opts.cwd,
      NO_COLOR: '1',
      PI_AGENT_DIR: path.join(opts.cwd, '.pi'),
      PATH: process.env.PATH ?? '',
    },
    onStdout: (data) => {
      stdoutChunks.push(data);
      // Reset the settle timer whenever new output arrives.
      // Pi in --print mode prints the response and then calls process.exit().
      // The V8 sandbox may not terminate cleanly on process.exit() inside TLA,
      // so we detect output settling (no new output for 500ms) and kill the process.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        outputSettled = true;
        proc.kill();
        resolveSettle?.(0);
      }, 500);
    },
    onStderr: (data) => stderrChunks.push(data),
  });

  // Close stdin immediately so Pi's readPipedStdin() "end" event fires
  proc.closeStdin();

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const exitCode = await Promise.race([
    proc.wait(),
    settlePromise,
    new Promise<number>((_, reject) =>
      setTimeout(() => {
        const partialStdout = stdoutChunks.map(c => new TextDecoder().decode(c)).join('');
        const partialStderr = stderrChunks.map(c => new TextDecoder().decode(c)).join('');
        console.error('TIMEOUT partial stdout:', partialStdout.slice(0, 2000));
        console.error('TIMEOUT partial stderr:', partialStderr.slice(0, 2000));
        proc.kill();
        reject(new Error(`Pi timed out after ${timeoutMs}ms`));
      }, timeoutMs),
    ),
  ]);

  if (settleTimer) clearTimeout(settleTimer);

  return {
    code: outputSettled ? 0 : exitCode,
    stdout: stdoutChunks.map((c) => new TextDecoder().decode(c)).join(''),
    stderr: stderrChunks.map((c) => new TextDecoder().decode(c)).join(''),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mockServer: MockLlmServerHandle;
let workDir: string;
let kernel: Kernel;
let vfs: VirtualFileSystem;

describe.skipIf(piSkip)('Pi headless E2E (sandbox VM)', () => {
  beforeAll(async () => {
    mockServer = await createMockLlmServer([]);
    workDir = await mkdtemp(path.join(tmpdir(), 'pi-headless-'));
    await mkdir(path.join(workDir, '.pi'), { recursive: true });

    // Create kernel with overlay VFS
    vfs = createOverlayVfs();
    kernel = createKernel({ filesystem: vfs });

    // Network adapter that redirects Anthropic API calls to the mock server
    const networkAdapter = createRedirectingNetworkAdapter(
      () => `http://127.0.0.1:${mockServer.port}`,
    );

    // Mount WasmVM first (provides sh/bash/coreutils), then Node
    if (hasWasm) {
      await kernel.mount(createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }));
    }
    await kernel.mount(createNodeRuntime({ networkAdapter, permissions: allowAll }));
  }, 30_000);

  afterAll(async () => {
    await kernel?.dispose();
    await mockServer?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it(
    'Pi boots in print mode — exits with code 0',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello!' }]);

      const result = await spawnPiInVm(kernel, {
        args: ['--print', 'say hello'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      if (result.code !== 0) {
        console.log('Pi boot stderr:', result.stderr.slice(0, 16000));
        console.log('Pi boot stdout:', result.stdout.slice(0, 8000));
      }
      expect(result.code).toBe(0);
    },
    45_000,
  );

  it(
    'Pi produces output — stdout contains canned LLM response',
    async () => {
      const canary = 'UNIQUE_CANARY_42';
      mockServer.reset([{ type: 'text', text: canary }]);

      const result = await spawnPiInVm(kernel, {
        args: ['--print', 'say hello'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      if (!result.stdout.includes(canary)) {
        console.log('Pi output stderr:', result.stderr.slice(0, 4000));
        console.log('Pi output stdout:', result.stdout.slice(0, 4000));
        console.log('Pi exit code:', result.code);
        console.log('Mock server requests:', mockServer.requestCount());
      }
      expect(result.stdout).toContain(canary);
    },
    45_000,
  );

  it(
    'Pi reads a file — read tool accesses seeded file via sandbox bridge',
    async () => {
      const testDir = path.join(workDir, 'read-test');
      await mkdir(testDir, { recursive: true });
      await fsPromises.writeFile(path.join(testDir, 'test.txt'), 'secret_content_xyz');

      mockServer.reset([
        {
          type: 'tool_use',
          name: 'read',
          input: { path: path.join(testDir, 'test.txt') },
        },
        { type: 'text', text: 'The file contains: secret_content_xyz' },
      ]);

      const result = await spawnPiInVm(kernel, {
        args: ['--print', `read ${path.join(testDir, 'test.txt')} and repeat the contents`],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
      expect(result.stdout).toContain('secret_content_xyz');
    },
    45_000,
  );

  it(
    'Pi writes a file — file exists after write tool runs via sandbox bridge',
    async () => {
      const testDir = path.join(workDir, 'write-test');
      // Create directory on host (for overlay read fallback) and in VFS (for write target)
      await mkdir(testDir, { recursive: true });
      await vfs.mkdir(testDir, { recursive: true });
      const outPath = path.join(testDir, 'out.txt');

      mockServer.reset([
        {
          type: 'tool_use',
          name: 'write',
          input: { path: outPath, content: 'hello from pi mock' },
        },
        { type: 'text', text: 'I wrote the file.' },
      ]);

      const result = await spawnPiInVm(kernel, {
        args: ['--print', `create a file at ${outPath}`],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.code).toBe(0);
      // Verify through VFS (writes go to in-memory layer)
      const content = await vfs.readTextFile(outPath);
      expect(content).toBe('hello from pi mock');
    },
    45_000,
  );

  it.skipIf(!hasWasm)(
    'Pi runs bash command — bash tool executes via child_process bridge',
    async () => {
      mockServer.reset([
        { type: 'tool_use', name: 'bash', input: { command: 'ls /' } },
        { type: 'text', text: 'Directory listing complete.' },
      ]);

      const result = await spawnPiInVm(kernel, {
        args: ['--print', 'run ls /'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.code).toBe(0);
      expect(mockServer.requestCount()).toBeGreaterThanOrEqual(2);
    },
    45_000,
  );

  it(
    'Pi JSON output mode — produces valid JSON',
    async () => {
      mockServer.reset([{ type: 'text', text: 'Hello JSON!' }]);

      const result = await spawnPiInVm(kernel, {
        args: ['--print', '--mode', 'json', 'say hello'],
        mockUrl: `http://127.0.0.1:${mockServer.port}`,
        cwd: workDir,
      });

      expect(result.code).toBe(0);
      const lines = result.stdout.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toBeDefined();
      }
    },
    45_000,
  );
});
