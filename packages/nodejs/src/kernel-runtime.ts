/**
 * Node.js runtime driver for kernel integration.
 *
 * Wraps the existing NodeExecutionDriver behind the kernel RuntimeDriver
 * interface. Each spawn() creates a fresh V8 isolate via NodeExecutionDriver
 * and executes the target script. The bridge child_process.spawn routes
 * through KernelInterface.spawn() so shell commands dispatch to WasmVM
 * or other mounted runtimes.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type {
  KernelRuntimeDriver as RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
  Permissions,
  VirtualFileSystem,
} from '@secure-exec/core';
import { NodeExecutionDriver } from './execution-driver.js';
import { createNodeDriver } from './driver.js';
import type { BindingTree } from './bindings.js';
import {
  allowAllChildProcess,
  allowAllFs,
} from '@secure-exec/core';
import type {
  CommandExecutor,
} from '@secure-exec/core';

export interface NodeRuntimeOptions {
  /** Memory limit in MB for each V8 isolate (default: 128). */
  memoryLimit?: number;
  /**
   * Host filesystem paths that the isolate may read for module resolution
   * (e.g. npm's own install directory). By default, the driver discovers
   * the host npm location automatically.
   */
  moduleAccessPaths?: string[];
  /**
   * Bridge permissions for isolate processes. Defaults to allowAllChildProcess
   * (fs/network/env deny-by-default). Use allowAll for full sandbox access.
   */
  permissions?: Partial<Permissions>;
  /**
   * Host-side functions exposed to sandbox code via SecureExec.bindings.
   * Nested objects become dot-separated paths (max depth 4, max 64 leaves).
   */
  bindings?: BindingTree;
}

/**
 * Create a Node.js RuntimeDriver that can be mounted into the kernel.
 */
export function createNodeRuntime(options?: NodeRuntimeOptions): RuntimeDriver {
  return new NodeRuntimeDriver(options);
}

// ---------------------------------------------------------------------------
// npm/npx host entry-point resolution
// ---------------------------------------------------------------------------

/** Cached result of npm entry script resolution. */
let _npmEntryCache: string | null = null;

/**
 * Resolve the npm CLI entry script on the host filesystem.
 * Walks up from `process.execPath` (the Node binary) to find the npm
 * package, then returns the path to `npm-cli.js`.
 */
function resolveNpmEntry(): string {
  if (_npmEntryCache) return _npmEntryCache;

  // Strategy 1: resolve from node's prefix (works for most installs)
  const nodeDir = dirname(process.execPath);
  const candidates = [
    // nvm / standard installs: <prefix>/lib/node_modules/npm/bin/npm-cli.js
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // Homebrew / some Linux layouts
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.cjs'),
    // Windows
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) {
      _npmEntryCache = resolved;
      return resolved;
    }
  }

  // Strategy 2: require.resolve from the host
  try {
    const npmPkg = require.resolve('npm/package.json', { paths: [nodeDir] });
    const entry = join(dirname(npmPkg), 'bin', 'npm-cli.js');
    if (existsSync(entry)) {
      _npmEntryCache = entry;
      return entry;
    }
  } catch {
    // fall through
  }

  throw new Error(
    'Could not resolve npm CLI entry script. Searched:\n' +
    candidates.map(c => `  - ${resolve(c)}`).join('\n'),
  );
}

/** Cached result of npx entry script resolution. */
let _npxEntryCache: string | null = null;

function resolveNpxEntry(): string {
  if (_npxEntryCache) return _npxEntryCache;

  const npmEntry = resolveNpmEntry();
  const npmBinDir = dirname(npmEntry);
  const candidates = [
    join(npmBinDir, 'npx-cli.js'),
    join(npmBinDir, 'npx-cli.cjs'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      _npxEntryCache = candidate;
      return candidate;
    }
  }

  throw new Error(
    'Could not resolve npx CLI entry script. Searched:\n' +
    candidates.map(c => `  - ${c}`).join('\n'),
  );
}

// ---------------------------------------------------------------------------
// KernelCommandExecutor — routes child_process.spawn through the kernel
// ---------------------------------------------------------------------------

/**
 * CommandExecutor adapter that wraps KernelInterface.spawn().
 * This is the critical integration point: when code inside the V8 isolate
 * calls child_process.spawn('sh', ['-c', 'echo hello']), the bridge
 * delegates here, which calls kernel.spawn() to route 'sh' to WasmVM.
 */
export function createKernelCommandExecutor(kernel: KernelInterface, parentPid: number): CommandExecutor {
  return {
    spawn(
      command: string,
      args: string[],
      options: {
        cwd?: string;
        env?: Record<string, string>;
        onStdout?: (data: Uint8Array) => void;
        onStderr?: (data: Uint8Array) => void;
      },
    ) {
      // Route through kernel — this dispatches to WasmVM for shell commands,
      // other Node instances for node commands, etc.
      const managed = kernel.spawn(command, args, {
        ppid: parentPid,
        env: options.env ?? {},
        cwd: options.cwd ?? kernel.getcwd(parentPid),
        onStdout: options.onStdout,
        onStderr: options.onStderr,
      });

      return {
        writeStdin(data: Uint8Array | string): void {
          managed.writeStdin(data);
        },
        closeStdin(): void {
          managed.closeStdin();
        },
        kill(signal?: number): void {
          managed.kill(signal);
        },
        wait(): Promise<number> {
          return managed.wait();
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Kernel VFS adapter — adapts kernel VFS to secure-exec VirtualFileSystem
// ---------------------------------------------------------------------------

/**
 * Thin adapter from kernel VFS to secure-exec VFS interface.
 * The kernel VFS is a superset, so this just narrows the type.
 */
export function createKernelVfsAdapter(kernelVfs: KernelInterface['vfs']): VirtualFileSystem {
  return {
    readFile: (path) => kernelVfs.readFile(path),
    readTextFile: (path) => kernelVfs.readTextFile(path),
    readDir: (path) => kernelVfs.readDir(path),
    readDirWithTypes: (path) => kernelVfs.readDirWithTypes(path),
    writeFile: (path, content) => kernelVfs.writeFile(path, content),
    createDir: (path) => kernelVfs.createDir(path),
    mkdir: (path, options?) => kernelVfs.mkdir(path, options),
    exists: (path) => kernelVfs.exists(path),
    stat: (path) => kernelVfs.stat(path),
    removeFile: (path) => kernelVfs.removeFile(path),
    removeDir: (path) => kernelVfs.removeDir(path),
    rename: (oldPath, newPath) => kernelVfs.rename(oldPath, newPath),
    symlink: (target, linkPath) => kernelVfs.symlink(target, linkPath),
    readlink: (path) => kernelVfs.readlink(path),
    lstat: (path) => kernelVfs.lstat(path),
    link: (oldPath, newPath) => kernelVfs.link(oldPath, newPath),
    chmod: (path, mode) => kernelVfs.chmod(path, mode),
    chown: (path, uid, gid) => kernelVfs.chown(path, uid, gid),
    utimes: (path, atime, mtime) => kernelVfs.utimes(path, atime, mtime),
    truncate: (path, length) => kernelVfs.truncate(path, length),
    realpath: (path) => kernelVfs.realpath(path),
    pread: (path, offset, length) => kernelVfs.pread(path, offset, length),
  };
}

// ---------------------------------------------------------------------------
// Host filesystem fallback — npm/npx module resolution
// ---------------------------------------------------------------------------

/**
 * Wrap a VFS with host filesystem fallback for read operations.
 *
 * When npm/npx runs inside the V8 isolate, require() must resolve npm's own
 * internal modules (e.g. '../lib/cli/entry'). These live on the host
 * filesystem, not in the kernel VFS. This wrapper tries the kernel VFS first
 * and falls back to the host filesystem for reads. Writes always go to the
 * kernel VFS.
 */
export function createHostFallbackVfs(base: VirtualFileSystem): VirtualFileSystem {
  return {
    readFile: async (path) => {
      try { return await base.readFile(path); }
      catch { return new Uint8Array(await fsPromises.readFile(path)); }
    },
    readTextFile: async (path) => {
      try { return await base.readTextFile(path); }
      catch { return await fsPromises.readFile(path, 'utf-8'); }
    },
    readDir: async (path) => {
      try { return await base.readDir(path); }
      catch { return await fsPromises.readdir(path); }
    },
    readDirWithTypes: async (path) => {
      try { return await base.readDirWithTypes(path); }
      catch {
        const entries = await fsPromises.readdir(path, { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
      }
    },
    exists: async (path) => {
      if (await base.exists(path)) return true;
      try { await fsPromises.access(path); return true; } catch { return false; }
    },
    stat: async (path) => {
      try { return await base.stat(path); }
      catch {
        const s = await fsPromises.stat(path);
        return {
          mode: s.mode,
          size: s.size,
          isDirectory: s.isDirectory(),
          isSymbolicLink: false,
          atimeMs: s.atimeMs,
          mtimeMs: s.mtimeMs,
          ctimeMs: s.ctimeMs,
          birthtimeMs: s.birthtimeMs,
          ino: s.ino,
          nlink: s.nlink,
          uid: s.uid,
          gid: s.gid,
        };
      }
    },
    writeFile: (path, content) => base.writeFile(path, content),
    createDir: (path) => base.createDir(path),
    mkdir: (path, options?) => base.mkdir(path, options),
    removeFile: (path) => base.removeFile(path),
    removeDir: (path) => base.removeDir(path),
    rename: (oldPath, newPath) => base.rename(oldPath, newPath),
    symlink: (target, linkPath) => base.symlink(target, linkPath),
    readlink: (path) => base.readlink(path),
    lstat: (path) => base.lstat(path),
    link: (oldPath, newPath) => base.link(oldPath, newPath),
    chmod: (path, mode) => base.chmod(path, mode),
    chown: (path, uid, gid) => base.chown(path, uid, gid),
    utimes: (path, atime, mtime) => base.utimes(path, atime, mtime),
    truncate: (path, length) => base.truncate(path, length),
    realpath: async (path) => {
      try { return await base.realpath(path); }
      catch { return await fsPromises.realpath(path); }
    },
    pread: async (path, offset, length) => {
      try { return await base.pread(path, offset, length); }
      catch {
        const handle = await fsPromises.open(path, 'r');
        try {
          const buf = new Uint8Array(length);
          const { bytesRead } = await handle.read(buf, 0, length, offset);
          return buf.slice(0, bytesRead);
        } finally {
          await handle.close();
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Node RuntimeDriver
// ---------------------------------------------------------------------------

class NodeRuntimeDriver implements RuntimeDriver {
  readonly name = 'node';
  readonly commands: string[] = ['node', 'npm', 'npx'];

  private _kernel: KernelInterface | null = null;
  private _memoryLimit: number;
  private _permissions: Partial<Permissions>;
  private _bindings?: BindingTree;
  private _activeDrivers = new Map<number, NodeExecutionDriver>();

  constructor(options?: NodeRuntimeOptions) {
    this._memoryLimit = options?.memoryLimit ?? 128;
    this._permissions = options?.permissions ?? { ...allowAllChildProcess };
    this._bindings = options?.bindings;
  }

  async init(kernel: KernelInterface): Promise<void> {
    this._kernel = kernel;
  }

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const kernel = this._kernel;
    if (!kernel) throw new Error('Node driver not initialized');

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

    // Stdin buffering — writeStdin collects data, closeStdin resolves the promise
    const stdinChunks: Uint8Array[] = [];
    let stdinResolve: ((data: string | undefined) => void) | null = null;
    const stdinPromise = new Promise<string | undefined>((resolve) => {
      stdinResolve = resolve;
      // Auto-resolve on next microtask if nobody calls writeStdin
      queueMicrotask(() => {
        if (stdinChunks.length === 0 && stdinResolve) {
          stdinResolve = null;
          resolve(undefined);
        }
      });
    });

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: (data: Uint8Array) => {
        stdinChunks.push(data);
      },
      closeStdin: () => {
        if (stdinResolve) {
          if (stdinChunks.length === 0) {
            // No data written — pass undefined (no stdin), not empty string
            stdinResolve(undefined);
          } else {
            // Concatenate buffered chunks and decode to string for exec()
            const totalLen = stdinChunks.reduce((sum, c) => sum + c.length, 0);
            const merged = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of stdinChunks) { merged.set(chunk, offset); offset += chunk.length; }
            stdinResolve(new TextDecoder().decode(merged));
          }
          stdinResolve = null;
        }
      },
      kill: (_signal: number) => {
        const driver = this._activeDrivers.get(ctx.pid);
        if (driver) {
          driver.dispose();
          this._activeDrivers.delete(ctx.pid);
        }
      },
      wait: () => exitPromise,
    };

    // Launch async — spawn() returns synchronously per RuntimeDriver contract
    this._executeAsync(command, args, ctx, proc, resolveExit, stdinPromise);

    return proc;
  }

  async dispose(): Promise<void> {
    for (const driver of this._activeDrivers.values()) {
      try { driver.dispose(); } catch { /* best effort */ }
    }
    this._activeDrivers.clear();
    this._kernel = null;
  }

  // -------------------------------------------------------------------------
  // Async execution
  // -------------------------------------------------------------------------

  private async _executeAsync(
    command: string,
    args: string[],
    ctx: ProcessContext,
    proc: DriverProcess,
    resolveExit: (code: number) => void,
    stdinPromise: Promise<string | undefined>,
  ): Promise<void> {
    const kernel = this._kernel!;

    try {
      // Resolve the code to execute
      const { code, filePath } = await this._resolveEntry(command, args, kernel);

      // Wait for stdin data (resolves immediately if no writeStdin called)
      const stdinData = await stdinPromise;

      // Build kernel-backed system driver
      const commandExecutor = createKernelCommandExecutor(kernel, ctx.pid);
      let filesystem: VirtualFileSystem = createKernelVfsAdapter(kernel.vfs);

      // npm/npx need host filesystem fallback and fs permissions for module resolution
      let permissions: Partial<Permissions> = { ...this._permissions };
      if (command === 'npm' || command === 'npx') {
        filesystem = createHostFallbackVfs(filesystem);
        permissions = { ...permissions, ...allowAllFs };
      }

      // Detect PTY on stdio FDs
      const stdinIsTTY = ctx.stdinIsTTY ?? false;
      const stdoutIsTTY = ctx.stdoutIsTTY ?? false;
      const stderrIsTTY = ctx.stderrIsTTY ?? false;

      const systemDriver = createNodeDriver({
        filesystem,
        commandExecutor,
        permissions,
        processConfig: {
          cwd: ctx.cwd,
          env: ctx.env,
          argv: [process.execPath, filePath ?? command, ...args],
          stdinIsTTY,
          stdoutIsTTY,
          stderrIsTTY,
        },
      });

      // Wire PTY raw mode callback when stdin is a terminal
      const onPtySetRawMode = stdinIsTTY
        ? (mode: boolean) => {
            kernel.ptySetDiscipline(ctx.pid, 0, {
              canonical: !mode,
              echo: !mode,
            });
          }
        : undefined;

      // Create a per-process isolate
      const executionDriver = new NodeExecutionDriver({
        system: systemDriver,
        runtime: systemDriver.runtime,
        memoryLimit: this._memoryLimit,
        bindings: this._bindings,
        onPtySetRawMode,
      });
      this._activeDrivers.set(ctx.pid, executionDriver);

      // Execute with stdout/stderr capture and stdin data
      const result = await executionDriver.exec(code, {
        filePath,
        env: ctx.env,
        cwd: ctx.cwd,
        stdin: stdinData,
        onStdio: (event) => {
          const data = new TextEncoder().encode(event.message + '\n');
          if (event.channel === 'stdout') {
            ctx.onStdout?.(data);
            proc.onStdout?.(data);
          } else {
            ctx.onStderr?.(data);
            proc.onStderr?.(data);
          }
        },
      });

      // Emit errorMessage as stderr (covers ReferenceError, SyntaxError, throw)
      if (result.errorMessage) {
        const errBytes = new TextEncoder().encode(result.errorMessage + '\n');
        ctx.onStderr?.(errBytes);
        proc.onStderr?.(errBytes);
      }

      // Cleanup isolate
      executionDriver.dispose();
      this._activeDrivers.delete(ctx.pid);

      resolveExit(result.code);
      proc.onExit?.(result.code);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errBytes = new TextEncoder().encode(`node: ${errMsg}\n`);
      ctx.onStderr?.(errBytes);
      proc.onStderr?.(errBytes);

      // Cleanup on error
      const driver = this._activeDrivers.get(ctx.pid);
      if (driver) {
        try { driver.dispose(); } catch { /* best effort */ }
        this._activeDrivers.delete(ctx.pid);
      }

      resolveExit(1);
      proc.onExit?.(1);
    }
  }

  // -------------------------------------------------------------------------
  // Entry point resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the entry code and filePath for a given command.
   * - 'node script.js' → read script from VFS
   * - 'node -e "code"' → inline code
   * - 'npm ...' → host npm CLI entry script
   * - 'npx ...' → host npx CLI entry script
   */
  private async _resolveEntry(
    command: string,
    args: string[],
    kernel: KernelInterface,
  ): Promise<{ code: string; filePath?: string }> {
    if (command === 'npm') {
      const entry = resolveNpmEntry();
      return { code: readFileSync(entry, 'utf-8'), filePath: entry };
    }

    if (command === 'npx') {
      const entry = resolveNpxEntry();
      return { code: readFileSync(entry, 'utf-8'), filePath: entry };
    }

    // 'node' command — parse args to find code/script
    return this._resolveNodeArgs(args, kernel);
  }

  /**
   * Parse Node CLI args to extract the code to execute.
   * Supports: node script.js, node -e "code", node --eval "code",
   * node -p "expr", node --print "expr"
   */
  private async _resolveNodeArgs(
    args: string[],
    kernel: KernelInterface,
  ): Promise<{ code: string; filePath?: string }> {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // -e / --eval: next arg is code
      if ((arg === '-e' || arg === '--eval') && i + 1 < args.length) {
        return { code: args[i + 1] };
      }

      // -p / --print: wrap in console.log
      if ((arg === '-p' || arg === '--print') && i + 1 < args.length) {
        return { code: `console.log(${args[i + 1]})` };
      }

      // Skip flags
      if (arg.startsWith('-')) continue;

      // First non-flag arg is the script path
      const scriptPath = arg;
      try {
        const content = await kernel.vfs.readTextFile(scriptPath);
        return { code: content, filePath: scriptPath };
      } catch {
        throw new Error(`Cannot find module '${scriptPath}'`);
      }
    }

    // No script or -e flag — read from stdin (not supported yet)
    throw new Error('node: missing script argument (stdin mode not supported)');
  }
}
