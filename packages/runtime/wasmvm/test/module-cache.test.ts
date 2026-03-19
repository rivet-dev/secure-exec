import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModuleCache } from '../src/module-cache.ts';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Minimal valid WASM module: magic + version header only (empty module)
// \0asm followed by version 1 (little-endian u32)
const MINIMAL_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic: \0asm
  0x01, 0x00, 0x00, 0x00, // version: 1
]);

describe('ModuleCache', () => {
  let cache: ModuleCache;
  let tempDir: string;
  let wasmPath: string;
  let wasmPath2: string;

  beforeEach(async () => {
    cache = new ModuleCache();
    tempDir = join(tmpdir(), `module-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    wasmPath = join(tempDir, 'test');
    wasmPath2 = join(tempDir, 'test2');
    await writeFile(wasmPath, MINIMAL_WASM);
    await writeFile(wasmPath2, MINIMAL_WASM);
  });

  afterEach(async () => {
    cache.clear();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('compiles and returns a WebAssembly.Module on cache miss', async () => {
    const mod = await cache.resolve(wasmPath);
    expect(mod).toBeInstanceOf(WebAssembly.Module);
    expect(cache.size).toBe(1);
  });

  it('returns cached module on cache hit', async () => {
    const mod1 = await cache.resolve(wasmPath);
    const mod2 = await cache.resolve(wasmPath);
    expect(mod1).toBe(mod2); // exact same object reference
    expect(cache.size).toBe(1);
  });

  it('caches different modules for different paths', async () => {
    const mod1 = await cache.resolve(wasmPath);
    const mod2 = await cache.resolve(wasmPath2);
    expect(mod1).not.toBe(mod2);
    expect(cache.size).toBe(2);
  });

  it('deduplicates concurrent compilations of the same binary', async () => {
    // Launch two resolves concurrently — only one compile should happen
    const [mod1, mod2] = await Promise.all([
      cache.resolve(wasmPath),
      cache.resolve(wasmPath),
    ]);
    expect(mod1).toBe(mod2);
    expect(cache.size).toBe(1);
  });

  it('handles many concurrent resolves for the same binary', async () => {
    const promises = Array.from({ length: 10 }, () => cache.resolve(wasmPath));
    const modules = await Promise.all(promises);
    // All should be the same module
    for (const mod of modules) {
      expect(mod).toBe(modules[0]);
    }
    expect(cache.size).toBe(1);
  });

  it('invalidate() removes a specific entry', async () => {
    await cache.resolve(wasmPath);
    await cache.resolve(wasmPath2);
    expect(cache.size).toBe(2);

    cache.invalidate(wasmPath);
    expect(cache.size).toBe(1);

    // Re-resolve recompiles (new object)
    const mod = await cache.resolve(wasmPath);
    expect(mod).toBeInstanceOf(WebAssembly.Module);
    expect(cache.size).toBe(2);
  });

  it('invalidate() is no-op for missing key', () => {
    cache.invalidate('/nonexistent');
    expect(cache.size).toBe(0);
  });

  it('clear() removes all entries', async () => {
    await cache.resolve(wasmPath);
    await cache.resolve(wasmPath2);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('throws on invalid binary path', async () => {
    await expect(cache.resolve('/nonexistent/binary')).rejects.toThrow();
    expect(cache.size).toBe(0);
  });

  it('does not cache failed compilations', async () => {
    // Write an invalid WASM binary
    const badPath = join(tempDir, 'bad');
    await writeFile(badPath, new Uint8Array([0x00, 0x00, 0x00, 0x00]));

    await expect(cache.resolve(badPath)).rejects.toThrow();
    expect(cache.size).toBe(0);

    // Pending map is cleaned up — a second attempt also fails (no stale promise)
    await expect(cache.resolve(badPath)).rejects.toThrow();
  });

  it('concurrent resolves where compilation fails all reject', async () => {
    const badPath = join(tempDir, 'bad2');
    await writeFile(badPath, new Uint8Array([0xff, 0xff, 0xff, 0xff]));

    const results = await Promise.allSettled([
      cache.resolve(badPath),
      cache.resolve(badPath),
      cache.resolve(badPath),
    ]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
    }
    expect(cache.size).toBe(0);
  });
});
