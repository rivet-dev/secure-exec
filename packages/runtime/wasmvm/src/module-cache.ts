/**
 * Module cache for compiled WebAssembly modules.
 *
 * Compiles WASM binaries to WebAssembly.Module on first use and caches them
 * for fast re-instantiation. Concurrent compilations of the same binary are
 * deduplicated — only one compile runs, all callers await the same promise.
 */

import { readFile } from 'node:fs/promises';

export class ModuleCache {
  private _cache = new Map<string, WebAssembly.Module>();
  private _pending = new Map<string, Promise<WebAssembly.Module>>();

  /** Resolve a binary path to a compiled WebAssembly.Module, using cache. */
  async resolve(binaryPath: string): Promise<WebAssembly.Module> {
    // Fast path: already compiled
    const cached = this._cache.get(binaryPath);
    if (cached) return cached;

    // Dedup: if another caller is already compiling this binary, await it
    const inflight = this._pending.get(binaryPath);
    if (inflight) return inflight;

    // Compile and cache
    const promise = this._compile(binaryPath);
    this._pending.set(binaryPath, promise);
    try {
      const module = await promise;
      this._cache.set(binaryPath, module);
      return module;
    } finally {
      this._pending.delete(binaryPath);
    }
  }

  /** Remove a specific entry from the cache. */
  invalidate(binaryPath: string): void {
    this._cache.delete(binaryPath);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this._cache.clear();
  }

  /** Number of cached modules. */
  get size(): number {
    return this._cache.size;
  }

  private async _compile(binaryPath: string): Promise<WebAssembly.Module> {
    const bytes = await readFile(binaryPath);
    return WebAssembly.compile(bytes);
  }
}
