/**
 * Tests for BrowserWasmVmRuntimeDriver.
 *
 * All browser APIs (fetch, WebAssembly.compileStreaming) are mocked
 * since they're not available in Node.js/vitest.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createBrowserWasmVmRuntime,
} from '../src/browser-driver.ts';
import type {
  CommandManifest,
  BrowserWasmVmRuntimeOptions,
} from '../src/browser-driver.ts';
import type {
  RuntimeDriver,
  KernelInterface,
  ProcessContext,
} from '@secure-exec/kernel';

// Minimal valid WASM module bytes
const MINIMAL_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic: \0asm
  0x01, 0x00, 0x00, 0x00, // version: 1
]);

// Sample manifest
const SAMPLE_MANIFEST: CommandManifest = {
  version: 1,
  baseUrl: 'https://cdn.example.com/commands/v1/',
  commands: {
    ls: { size: 1500000, sha256: 'abc123' },
    grep: { size: 1200000, sha256: 'def456' },
    sh: { size: 4000000, sha256: '789abc' },
    cat: { size: 800000, sha256: 'aaa111' },
  },
};

// Stub KernelInterface — only init() uses it
function createMockKernel(): KernelInterface {
  return {
    vfs: {} as KernelInterface['vfs'],
    fdOpen: vi.fn(),
    fdRead: vi.fn(),
    fdWrite: vi.fn(),
    fdClose: vi.fn(),
    fdSeek: vi.fn(),
    fdPread: vi.fn(),
    fdPwrite: vi.fn(),
    fdDup: vi.fn(),
    fdDup2: vi.fn(),
    fdStat: vi.fn(),
    spawn: vi.fn(),
    waitpid: vi.fn(),
    kill: vi.fn(),
    pipe: vi.fn(),
    isatty: vi.fn(),
  } as unknown as KernelInterface;
}

function createMockProcessContext(overrides?: Partial<ProcessContext>): ProcessContext {
  return {
    pid: 1,
    ppid: 0,
    env: {},
    cwd: '/',
    fds: { stdin: 0, stdout: 1, stderr: 2 },
    ...overrides,
  };
}

/**
 * Create a mock fetch that serves manifest + WASM binaries.
 * Manifest is served for the registryUrl, WASM bytes for command URLs.
 */
function createMockFetch(manifest: CommandManifest) {
  // Compile a real module so compileStreaming/compile succeeds
  const wasmModule = new WebAssembly.Module(MINIMAL_WASM);

  const mockFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    // Manifest request
    if (url.includes('manifest') || url.includes('registry')) {
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Command binary request — check if it matches a known command
    for (const cmd of Object.keys(manifest.commands)) {
      if (url.endsWith(`/${cmd}`)) {
        return new Response(MINIMAL_WASM, {
          status: 200,
          headers: { 'Content-Type': 'application/wasm' },
        });
      }
    }

    // Unknown URL
    return new Response('Not Found', { status: 404 });
  });

  return { mockFetch, wasmModule };
}

describe('BrowserWasmVmRuntimeDriver', () => {
  let originalCompileStreaming: typeof WebAssembly.compileStreaming;

  beforeEach(() => {
    // Save original and mock compileStreaming (not available in Node.js)
    originalCompileStreaming = WebAssembly.compileStreaming;
    WebAssembly.compileStreaming = vi.fn(async (source: Response | PromiseLike<Response>) => {
      const resp = await source;
      const bytes = new Uint8Array(await resp.arrayBuffer());
      return WebAssembly.compile(bytes);
    });
  });

  afterEach(() => {
    WebAssembly.compileStreaming = originalCompileStreaming;
  });

  // -----------------------------------------------------------------------
  // init()
  // -----------------------------------------------------------------------

  describe('init()', () => {
    it('fetches manifest and populates commands list', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/registry/manifest.json',
        fetch: mockFetch,
      });

      await driver.init(createMockKernel());

      expect(driver.commands).toEqual(['ls', 'grep', 'sh', 'cat']);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://cdn.example.com/registry/manifest.json',
      );
    });

    it('throws on manifest fetch failure', async () => {
      const mockFetch = vi.fn(async () => new Response('Server Error', { status: 500 }));
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });

      await expect(driver.init(createMockKernel())).rejects.toThrow(
        /Failed to fetch command manifest/,
      );
    });

    it('handles empty command manifest', async () => {
      const emptyManifest: CommandManifest = {
        version: 1,
        baseUrl: 'https://cdn.example.com/',
        commands: {},
      };
      const { mockFetch } = createMockFetch(emptyManifest);
      // Override to serve the empty manifest
      mockFetch.mockImplementation(async () =>
        new Response(JSON.stringify(emptyManifest), { status: 200 }),
      );
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });

      await driver.init(createMockKernel());
      expect(driver.commands).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // spawn()
  // -----------------------------------------------------------------------

  describe('spawn()', () => {
    it('fetches and compiles WASM binary on first spawn', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', ['-la'], createMockProcessContext());
      const exitCode = await proc.wait();

      expect(exitCode).toBe(0);
      // Verify fetch was called for the command binary
      expect(mockFetch).toHaveBeenCalledWith(
        'https://cdn.example.com/commands/v1/ls',
      );
      // Verify compileStreaming was used
      expect(WebAssembly.compileStreaming).toHaveBeenCalled();
    });

    it('throws for unknown command', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      await driver.init(createMockKernel());

      expect(() =>
        driver.spawn('nonexistent', [], createMockProcessContext()),
      ).toThrow('command not found: nonexistent');
    });

    it('throws when driver is not initialized', () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });

      expect(() =>
        driver.spawn('ls', [], createMockProcessContext()),
      ).toThrow('not initialized');
    });

    it('reports fetch errors via onStderr and exit code 127', async () => {
      const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('manifest')) {
          return new Response(JSON.stringify(SAMPLE_MANIFEST), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      }) as unknown as typeof globalThis.fetch;
      // Make compileStreaming throw on 404 response
      (WebAssembly.compileStreaming as ReturnType<typeof vi.fn>).mockImplementation(
        async (source: Response | PromiseLike<Response>) => {
          const resp = await source;
          if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
          const bytes = new Uint8Array(await resp.arrayBuffer());
          return WebAssembly.compile(bytes);
        },
      );

      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      await driver.init(createMockKernel());

      const stderrChunks: Uint8Array[] = [];
      const proc = driver.spawn('ls', [], createMockProcessContext());
      proc.onStderr = (data) => stderrChunks.push(data);

      const exitCode = await proc.wait();
      expect(exitCode).toBe(127);
    });
  });

  // -----------------------------------------------------------------------
  // Module cache
  // -----------------------------------------------------------------------

  describe('module cache', () => {
    it('caches compiled module for reuse across spawns', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      await driver.init(createMockKernel());

      // First spawn — compiles
      const proc1 = driver.spawn('grep', [], createMockProcessContext());
      await proc1.wait();

      // Reset compileStreaming call count
      (WebAssembly.compileStreaming as ReturnType<typeof vi.fn>).mockClear();

      // Second spawn — should use cache, no new compile
      const proc2 = driver.spawn('grep', [], createMockProcessContext());
      await proc2.wait();

      // compileStreaming should NOT be called again
      expect(WebAssembly.compileStreaming).not.toHaveBeenCalled();
    });

    it('resolveModule returns same module for repeated calls', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { resolveModule: (cmd: string) => Promise<WebAssembly.Module> };
      await driver.init(createMockKernel());

      const mod1 = await driver.resolveModule('ls');
      const mod2 = await driver.resolveModule('ls');
      expect(mod1).toBe(mod2); // same object reference
    });

    it('deduplicates concurrent compilations', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { resolveModule: (cmd: string) => Promise<WebAssembly.Module> };
      await driver.init(createMockKernel());

      // Launch multiple concurrent resolves
      const [mod1, mod2, mod3] = await Promise.all([
        driver.resolveModule('cat'),
        driver.resolveModule('cat'),
        driver.resolveModule('cat'),
      ]);

      expect(mod1).toBe(mod2);
      expect(mod2).toBe(mod3);
      // Only one fetch should have been made for the binary
      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/cat'),
      );
      expect(binaryFetches.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // dispose()
  // -----------------------------------------------------------------------

  describe('dispose()', () => {
    it('clears module cache and manifest on dispose', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      await driver.init(createMockKernel());

      // Populate cache
      const proc = driver.spawn('ls', [], createMockProcessContext());
      await proc.wait();

      expect(driver.commands.length).toBe(4);

      await driver.dispose();

      expect(driver.commands).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // kill()
  // -----------------------------------------------------------------------

  describe('kill()', () => {
    it('kill resolves exit promise with code 137', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      // Make fetch hang to simulate an in-progress spawn
      let fetchResolve: (v: Response) => void;
      const hangingFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('manifest')) {
          return new Response(JSON.stringify(SAMPLE_MANIFEST), { status: 200 });
        }
        return new Promise<Response>((resolve) => {
          fetchResolve = resolve;
        });
      }) as unknown as typeof globalThis.fetch;
      // Also make compileStreaming hang
      (WebAssembly.compileStreaming as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: hangingFetch,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', [], createMockProcessContext());
      proc.kill(9);

      const exitCode = await proc.wait();
      expect(exitCode).toBe(137);
    });
  });

  // -----------------------------------------------------------------------
  // Driver interface compliance
  // -----------------------------------------------------------------------

  describe('interface compliance', () => {
    it('has name "wasmvm"', () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      expect(driver.name).toBe('wasmvm');
    });

    it('commands is empty before init', () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      expect(driver.commands).toEqual([]);
    });

    it('does not have tryResolve (no on-demand discovery)', () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      // Browser driver doesn't need tryResolve — all commands known from manifest
      expect((driver as unknown as Record<string, unknown>).tryResolve).toBeUndefined();
    });

    it('compileStreaming is used for streaming compilation', async () => {
      const { mockFetch } = createMockFetch(SAMPLE_MANIFEST);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('sh', [], createMockProcessContext());
      await proc.wait();

      expect(WebAssembly.compileStreaming).toHaveBeenCalled();
    });
  });
});
