/**
 * Browser-compatible WasmVM runtime driver.
 *
 * Discovers commands from a JSON manifest fetched over the network.
 * WASM binaries are fetched on demand and compiled via
 * WebAssembly.compileStreaming() for streaming compilation.
 * Compiled modules are cached in memory for fast re-instantiation.
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
// Options
// ---------------------------------------------------------------------------

export interface BrowserWasmVmRuntimeOptions {
  /** URL to the command manifest JSON. */
  registryUrl: string;
  /** Optional custom fetch function (for testing). */
  fetch?: typeof globalThis.fetch;
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

  // Module cache: command name → compiled WebAssembly.Module
  private _moduleCache = new Map<string, WebAssembly.Module>();
  // Dedup concurrent fetches/compilations
  private _pending = new Map<string, Promise<WebAssembly.Module>>();

  private _registryUrl: string;
  private _fetch: typeof globalThis.fetch;

  get commands(): string[] {
    return this._commands;
  }

  constructor(options: BrowserWasmVmRuntimeOptions) {
    this._registryUrl = options.registryUrl;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async init(kernel: KernelInterface): Promise<void> {
    this._kernel = kernel;

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
    // Cache hit
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

    const url = this._manifest.baseUrl + command;
    const resp = this._fetch(url);

    // Use compileStreaming for streaming compilation (compiles while downloading)
    return WebAssembly.compileStreaming(resp);
  }
}
