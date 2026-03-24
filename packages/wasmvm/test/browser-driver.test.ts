/**
 * Tests for BrowserWasmVmRuntimeDriver.
 *
 * All browser APIs (fetch, WebAssembly.compileStreaming, Cache API, IndexedDB)
 * are mocked since they're not available in Node.js/vitest.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createBrowserWasmVmRuntime,
  sha256Hex,
} from '../src/browser-driver.ts';
import type {
  CommandManifest,
  BinaryStorage,
} from '../src/browser-driver.ts';
import type {
  KernelInterface,
  ProcessContext,
} from '@secure-exec/core';

// Minimal valid WASM module bytes
const MINIMAL_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic: \0asm
  0x01, 0x00, 0x00, 0x00, // version: 1
]);

// Pre-compute SHA-256 of MINIMAL_WASM for use in manifests
let MINIMAL_WASM_SHA256: string;

// Stub KernelInterface -- only init() uses it
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
    fdDupMin: vi.fn(),
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

/** In-memory BinaryStorage mock for testing persistent cache. */
function createMockStorage(): BinaryStorage & {
  _store: Map<string, Uint8Array>;
  getCalls: string[];
  putCalls: [string, Uint8Array][];
  deleteCalls: string[];
} {
  const store = new Map<string, Uint8Array>();
  const getCalls: string[] = [];
  const putCalls: [string, Uint8Array][] = [];
  const deleteCalls: string[] = [];

  return {
    _store: store,
    getCalls,
    putCalls,
    deleteCalls,
    async get(key: string) {
      getCalls.push(key);
      return store.get(key) ?? null;
    },
    async put(key: string, bytes: Uint8Array) {
      putCalls.push([key, bytes]);
      store.set(key, bytes);
    },
    async delete(key: string) {
      deleteCalls.push(key);
      store.delete(key);
    },
  };
}

/**
 * Create a manifest with SHA-256 hashes matching MINIMAL_WASM.
 * Must be called after MINIMAL_WASM_SHA256 is computed.
 */
function createSampleManifest(): CommandManifest {
  return {
    version: 1,
    baseUrl: 'https://cdn.example.com/commands/v1/',
    commands: {
      ls: { size: 1500000, sha256: MINIMAL_WASM_SHA256 },
      grep: { size: 1200000, sha256: MINIMAL_WASM_SHA256 },
      sh: { size: 4000000, sha256: MINIMAL_WASM_SHA256 },
      cat: { size: 800000, sha256: MINIMAL_WASM_SHA256 },
    },
  };
}

/**
 * Create a mock fetch that serves manifest + WASM binaries.
 */
function createMockFetch(manifest: CommandManifest) {
  const mockFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    // Manifest request
    if (url.includes('manifest') || url.includes('registry')) {
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Command binary request
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

  return { mockFetch };
}

describe('BrowserWasmVmRuntimeDriver', () => {
  let originalCompileStreaming: typeof WebAssembly.compileStreaming;

  beforeEach(async () => {
    // Compute hash once
    if (!MINIMAL_WASM_SHA256) {
      MINIMAL_WASM_SHA256 = await sha256Hex(MINIMAL_WASM);
    }

    // Mock compileStreaming (not available in Node.js)
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
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/registry/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
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
        binaryStorage: null,
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
      mockFetch.mockImplementation(async () =>
        new Response(JSON.stringify(emptyManifest), { status: 200 }),
      );
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
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
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', ['-la'], createMockProcessContext());
      const exitCode = await proc.wait();

      expect(exitCode).toBe(0);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://cdn.example.com/commands/v1/ls',
      );
    });

    it('throws for unknown command', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

      expect(() =>
        driver.spawn('nonexistent', [], createMockProcessContext()),
      ).toThrow('command not found: nonexistent');
    });

    it('throws when driver is not initialized', () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });

      expect(() =>
        driver.spawn('ls', [], createMockProcessContext()),
      ).toThrow('not initialized');
    });

    it('reports fetch errors via onStderr and exit code 127', async () => {
      const manifest = createSampleManifest();
      const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('manifest')) {
          return new Response(JSON.stringify(manifest), { status: 200 });
        }
        // Return valid bytes with WRONG hash to trigger integrity failure
        return new Response(new Uint8Array([0xff, 0xff, 0xff, 0xff]), {
          status: 200,
        });
      }) as unknown as typeof globalThis.fetch;

      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
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
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

      // First spawn -- fetches + compiles
      const proc1 = driver.spawn('grep', [], createMockProcessContext());
      await proc1.wait();

      // Count binary fetches so far (exclude manifest)
      const binaryFetchesBefore = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/grep'),
      ).length;
      expect(binaryFetchesBefore).toBe(1);

      // Second spawn -- should use cache, no new fetch
      const proc2 = driver.spawn('grep', [], createMockProcessContext());
      await proc2.wait();

      const binaryFetchesAfter = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/grep'),
      ).length;
      expect(binaryFetchesAfter).toBe(1); // still 1
    });

    it('resolveModule returns same module for repeated calls', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { resolveModule: (cmd: string) => Promise<WebAssembly.Module> };
      await driver.init(createMockKernel());

      const mod1 = await driver.resolveModule('ls');
      const mod2 = await driver.resolveModule('ls');
      expect(mod1).toBe(mod2); // same object reference
    });

    it('deduplicates concurrent compilations', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { resolveModule: (cmd: string) => Promise<WebAssembly.Module> };
      await driver.init(createMockKernel());

      const [mod1, mod2, mod3] = await Promise.all([
        driver.resolveModule('cat'),
        driver.resolveModule('cat'),
        driver.resolveModule('cat'),
      ]);

      expect(mod1).toBe(mod2);
      expect(mod2).toBe(mod3);
      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/cat'),
      );
      expect(binaryFetches.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // SHA-256 integrity checking
  // -----------------------------------------------------------------------

  describe('SHA-256 integrity', () => {
    it('sha256Hex computes correct hash', async () => {
      const hash = await sha256Hex(MINIMAL_WASM);
      // Verify it's a 64-char hex string
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // Verify consistency
      const hash2 = await sha256Hex(MINIMAL_WASM);
      expect(hash).toBe(hash2);
    });

    it('rejects binary with SHA-256 mismatch', async () => {
      const manifest: CommandManifest = {
        version: 1,
        baseUrl: 'https://cdn.example.com/commands/v1/',
        commands: {
          ls: { size: 8, sha256: 'deadbeef'.repeat(8) }, // wrong hash
        },
      };
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

      const stderrChunks: Uint8Array[] = [];
      const proc = driver.spawn('ls', [], createMockProcessContext());
      proc.onStderr = (data) => stderrChunks.push(data);

      const exitCode = await proc.wait();
      expect(exitCode).toBe(127);

      const stderr = new TextDecoder().decode(stderrChunks[0] ?? new Uint8Array());
      expect(stderr).toContain('SHA-256 mismatch');
    });

    it('accepts binary with correct SHA-256', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', [], createMockProcessContext());
      const exitCode = await proc.wait();
      expect(exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Persistent binary storage (Cache API / IndexedDB abstraction)
  // -----------------------------------------------------------------------

  describe('persistent binary storage', () => {
    it('stores fetched binary in persistent cache after network fetch', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const storage = createMockStorage();
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: storage,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', [], createMockProcessContext());
      await proc.wait();

      // Binary was stored in persistent cache
      expect(storage.putCalls.length).toBe(1);
      expect(storage.putCalls[0][0]).toBe('ls');
      expect(storage.putCalls[0][1]).toEqual(MINIMAL_WASM);
    });

    it('uses cached binary on second page load (cache hit avoids network fetch)', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const storage = createMockStorage();

      // Pre-populate storage (simulating first page load already cached it)
      storage._store.set('grep', MINIMAL_WASM);

      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: storage,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('grep', [], createMockProcessContext());
      await proc.wait();

      // Should have hit the persistent cache
      expect(storage.getCalls).toContain('grep');
      // Should NOT have fetched the binary from network
      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/grep'),
      );
      expect(binaryFetches.length).toBe(0);
    });

    it('evicts and re-fetches when cached binary has wrong SHA-256', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const storage = createMockStorage();

      // Pre-populate with corrupted bytes
      const corruptedBytes = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      storage._store.set('ls', corruptedBytes);

      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: storage,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', [], createMockProcessContext());
      await proc.wait();

      // Should have deleted the stale entry
      expect(storage.deleteCalls).toContain('ls');
      // Should have re-fetched from network
      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/ls'),
      );
      expect(binaryFetches.length).toBe(1);
      // Should have stored the correct bytes
      expect(storage._store.get('ls')).toEqual(MINIMAL_WASM);
    });

    it('works without persistent storage (null)', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

      const proc = driver.spawn('ls', [], createMockProcessContext());
      const exitCode = await proc.wait();
      expect(exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // preload()
  // -----------------------------------------------------------------------

  describe('preload()', () => {
    it('fetches and caches multiple commands concurrently', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const storage = createMockStorage();
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: storage,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { preload: (cmds: string[]) => Promise<void> };
      await driver.init(createMockKernel());

      await driver.preload(['ls', 'cat', 'grep']);

      // All 3 commands were stored in persistent cache
      const storedKeys = storage.putCalls.map(([key]) => key);
      expect(storedKeys).toContain('ls');
      expect(storedKeys).toContain('cat');
      expect(storedKeys).toContain('grep');

      // Subsequent spawns use in-memory cache (no new fetches)
      mockFetch.mockClear();
      const proc = driver.spawn('ls', [], createMockProcessContext());
      await proc.wait();

      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => !(call[0] as string).includes('manifest'),
      );
      expect(binaryFetches.length).toBe(0);
    });

    it('skips unknown commands silently', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { preload: (cmds: string[]) => Promise<void> };
      await driver.init(createMockKernel());

      // Should not throw for unknown commands
      await driver.preload(['ls', 'nonexistent', 'cat']);

      // Only known commands were fetched
      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => !(call[0] as string).includes('manifest'),
      );
      expect(binaryFetches.length).toBe(2); // ls + cat
    });

    it('throws when called before init', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { preload: (cmds: string[]) => Promise<void> };

      await expect(driver.preload(['ls'])).rejects.toThrow('Manifest not loaded');
    });

    it('deduplicates with concurrent spawn calls', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      }) as ReturnType<typeof createBrowserWasmVmRuntime> & { preload: (cmds: string[]) => Promise<void> };
      await driver.init(createMockKernel());

      // Preload and spawn concurrently
      const preloadPromise = driver.preload(['ls']);
      const proc = driver.spawn('ls', [], createMockProcessContext());
      await Promise.all([preloadPromise, proc.wait()]);

      // Only one fetch for the binary
      const binaryFetches = mockFetch.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).endsWith('/ls'),
      );
      expect(binaryFetches.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // dispose()
  // -----------------------------------------------------------------------

  describe('dispose()', () => {
    it('clears module cache and manifest on dispose', async () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      await driver.init(createMockKernel());

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
      const manifest = createSampleManifest();
      const hangingFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('manifest')) {
          return new Response(JSON.stringify(manifest), { status: 200 });
        }
        return new Promise<Response>(() => {}); // never resolves
      }) as unknown as typeof globalThis.fetch;

      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: hangingFetch,
        binaryStorage: null,
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
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      expect(driver.name).toBe('wasmvm');
    });

    it('commands is empty before init', () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      expect(driver.commands).toEqual([]);
    });

    it('does not have tryResolve (no on-demand discovery)', () => {
      const manifest = createSampleManifest();
      const { mockFetch } = createMockFetch(manifest);
      const driver = createBrowserWasmVmRuntime({
        registryUrl: 'https://cdn.example.com/manifest.json',
        fetch: mockFetch,
        binaryStorage: null,
      });
      expect((driver as unknown as Record<string, unknown>).tryResolve).toBeUndefined();
    });
  });
});
