/**
 * Browser-compatible WasmVM runtime driver.
 *
 * Discovers commands from a JSON manifest fetched over the network.
 * WASM binaries are fetched on demand and compiled via
 * WebAssembly.compileStreaming() for streaming compilation.
 * Compiled modules are cached in memory for fast re-instantiation.
 * Persistent caching via Cache API (or IndexedDB fallback) stores
 * binaries across page loads. SHA-256 integrity is verified from the
 * manifest before any cached or fetched binary is used.
 */

import type {
  RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
} from '@secure-exec/kernel';

// ---------------------------------------------------------------------------
// Command manifest types
// ---------------------------------------------------------------------------

/** Metadata for a single command in the manifest. */
export interface CommandManifestEntry {
  /** Binary size in bytes. */
  size: number;
  /** SHA-256 hex digest of the binary. */
  sha256: string;
}

/** JSON manifest mapping command names to binary metadata. */
export interface CommandManifest {
  /** Manifest schema version. */
  version: number;
  /** Base URL for fetching command binaries (trailing slash included). */
  baseUrl: string;
  /** Map of command name to metadata. */
  commands: Record<string, CommandManifestEntry>;
}

// ---------------------------------------------------------------------------
// Binary storage abstraction (Cache API / IndexedDB)
// ---------------------------------------------------------------------------

/** Persistent storage for WASM binary bytes across page loads. */
export interface BinaryStorage {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cache API-backed storage. */
export class CacheApiBinaryStorage implements BinaryStorage {
  private _cacheName: string;

  constructor(cacheName = 'wasmvm-binaries') {
    this._cacheName = cacheName;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const cache = await caches.open(this._cacheName);
    const resp = await cache.match(key);
    if (!resp) return null;
    return new Uint8Array(await resp.arrayBuffer());
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const cache = await caches.open(this._cacheName);
    await cache.put(key, new Response(bytes as unknown as BodyInit));
  }

  async delete(key: string): Promise<void> {
    const cache = await caches.open(this._cacheName);
    await cache.delete(key);
  }
}

/** IndexedDB-backed storage (fallback when Cache API is unavailable). */
export class IndexedDbBinaryStorage implements BinaryStorage {
  private _dbName: string;
  private _storeName = 'binaries';

  constructor(dbName = 'wasmvm-binaries') {
    this._dbName = dbName;
  }

  private _open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this._storeName)) {
          db.createObjectStore(this._storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._storeName, 'readonly');
      const store = tx.objectStore(this._storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._storeName, 'readwrite');
      const store = tx.objectStore(this._storeName);
      const req = store.put(bytes.buffer.slice(0), key);
      req.onsuccess = () => {
        db.close();
        resolve();
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._storeName, 'readwrite');
      const store = tx.objectStore(this._storeName);
      const req = store.delete(key);
      req.onsuccess = () => {
        db.close();
        resolve();
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }
}

// ---------------------------------------------------------------------------
// SHA-256 utility
// ---------------------------------------------------------------------------

/** Compute SHA-256 hex digest of binary data using Web Crypto API. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BrowserWasmVmRuntimeOptions {
  /** URL to the command manifest JSON. */
  registryUrl: string;
  /** Optional custom fetch function (for testing). */
  fetch?: typeof globalThis.fetch;
  /** Optional persistent binary storage (auto-detected if omitted). */
  binaryStorage?: BinaryStorage | null;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Create a browser-compatible WasmVM RuntimeDriver that fetches commands
 * from a CDN using a JSON manifest.
 */
export function createBrowserWasmVmRuntime(
  options: BrowserWasmVmRuntimeOptions,
): RuntimeDriver {
  return new BrowserWasmVmRuntimeDriver(options);
}

class BrowserWasmVmRuntimeDriver implements RuntimeDriver {
  readonly name = 'wasmvm';

  private _commands: string[] = [];
  private _manifest: CommandManifest | null = null;
  private _kernel: KernelInterface | null = null;

  // Module cache: command name -> compiled WebAssembly.Module
  private _moduleCache = new Map<string, WebAssembly.Module>();
  // Dedup concurrent fetches/compilations
  private _pending = new Map<string, Promise<WebAssembly.Module>>();

  private _registryUrl: string;
  private _fetch: typeof globalThis.fetch;
  private _binaryStorage: BinaryStorage | null;

  get commands(): string[] {
    return this._commands;
  }

  constructor(options: BrowserWasmVmRuntimeOptions) {
    this._registryUrl = options.registryUrl;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    // Explicit null = no storage; undefined = auto-detect
    this._binaryStorage =
      options.binaryStorage !== undefined ? options.binaryStorage : null;
  }

  async init(kernel: KernelInterface): Promise<void> {
    this._kernel = kernel;

    // Auto-detect persistent storage if not explicitly provided
    if (this._binaryStorage === null && typeof caches !== 'undefined') {
      this._binaryStorage = new CacheApiBinaryStorage();
    } else if (this._binaryStorage === null && typeof indexedDB !== 'undefined') {
      this._binaryStorage = new IndexedDbBinaryStorage();
    }

    // Fetch manifest to discover available commands
    const resp = await this._fetch(this._registryUrl);
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch command manifest from ${this._registryUrl}: ${resp.status} ${resp.statusText}`,
      );
    }
    this._manifest = (await resp.json()) as CommandManifest;
    this._commands = Object.keys(this._manifest.commands);
  }

  spawn(command: string, _args: string[], _ctx: ProcessContext): DriverProcess {
    if (!this._kernel) throw new Error('Browser WasmVM driver not initialized');
    if (!this._manifest) throw new Error('Manifest not loaded');

    const entry = this._manifest.commands[command];
    if (!entry) {
      throw new Error(`command not found: ${command}`);
    }

    // Exit plumbing
    let resolveExit!: (code: number) => void;
    let exitResolved = false;
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = (code: number) => {
        if (exitResolved) return;
        exitResolved = true;
        resolve(code);
      };
    });

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: () => {
        // Browser worker stdin not wired in this story
      },
      closeStdin: () => {},
      kill: () => {
        // Terminate would go here when workers are wired
        resolveExit(137);
      },
      wait: () => exitPromise,
    };

    // Fetch, compile, and eventually launch worker (async)
    this._resolveModule(command).then(
      (_module) => {
        // Module compiled successfully — actual worker launch is
        // environment-specific and deferred to future integration.
        // For now, signal successful compilation.
        resolveExit(0);
        proc.onExit?.(0);
      },
      (err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errBytes = new TextEncoder().encode(`wasmvm: ${errMsg}\n`);
        proc.onStderr?.(errBytes);
        resolveExit(127);
        proc.onExit?.(127);
      },
    );

    return proc;
  }

  /**
   * Preload multiple commands concurrently during idle time.
   * Fetches, verifies, caches, and compiles each command.
   */
  async preload(commands: string[]): Promise<void> {
    if (!this._manifest) throw new Error('Manifest not loaded');
    const valid = commands.filter((cmd) => this._manifest!.commands[cmd]);
    await Promise.all(valid.map((cmd) => this._resolveModule(cmd)));
  }

  async dispose(): Promise<void> {
    this._moduleCache.clear();
    this._pending.clear();
    this._manifest = null;
    this._kernel = null;
    this._commands = [];
  }

  // -------------------------------------------------------------------------
  // Module resolution with concurrent-compile deduplication
  // -------------------------------------------------------------------------

  /**
   * Resolve a command to a compiled WebAssembly.Module.
   * Uses in-memory cache and deduplicates concurrent fetches.
   */
  async resolveModule(command: string): Promise<WebAssembly.Module> {
    return this._resolveModule(command);
  }

  private async _resolveModule(
    command: string,
  ): Promise<WebAssembly.Module> {
    // In-memory cache hit
    const cached = this._moduleCache.get(command);
    if (cached) return cached;

    // Dedup concurrent fetches
    const inflight = this._pending.get(command);
    if (inflight) return inflight;

    const promise = this._fetchAndCompile(command);
    this._pending.set(command, promise);
    try {
      const module = await promise;
      this._moduleCache.set(command, module);
      return module;
    } finally {
      this._pending.delete(command);
    }
  }

  private async _fetchAndCompile(
    command: string,
  ): Promise<WebAssembly.Module> {
    if (!this._manifest) throw new Error('Manifest not loaded');

    const entry = this._manifest.commands[command];
    const url = this._manifest.baseUrl + command;

    // Check persistent cache
    if (this._binaryStorage) {
      const cachedBytes = await this._binaryStorage.get(command);
      if (cachedBytes) {
        const hash = await sha256Hex(cachedBytes);
        if (hash === entry.sha256) {
          return WebAssembly.compile(cachedBytes as BufferSource);
        }
        // Hash mismatch — evict stale entry and re-fetch
        await this._binaryStorage.delete(command);
      }
    }

    // Fetch from network
    const resp = await this._fetch(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());

    // SHA-256 integrity check
    const hash = await sha256Hex(bytes);
    if (hash !== entry.sha256) {
      throw new Error(
        `SHA-256 mismatch for ${command}: expected ${entry.sha256}, got ${hash}`,
      );
    }

    // Store in persistent cache
    if (this._binaryStorage) {
      await this._binaryStorage.put(command, bytes);
    }

    // Compile module
    return WebAssembly.compile(bytes);
  }
}
