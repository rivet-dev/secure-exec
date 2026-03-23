/**
 * WasmVM runtime driver for kernel integration.
 *
 * Discovers WASM command binaries from filesystem directories (commandDirs),
 * validates them by WASM magic bytes, and loads them on demand. Each spawn()
 * creates a Worker thread that loads the per-command binary and communicates
 * with the main thread via SharedArrayBuffer-based RPC for synchronous
 * WASI syscalls.
 *
 * proc_spawn from brush-shell routes through KernelInterface.spawn()
 * so pipeline stages can dispatch to any runtime (WasmVM, Node, Python).
 */

import type {
  KernelRuntimeDriver as RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
} from '@secure-exec/core';
import type { WorkerHandle } from './worker-adapter.js';
import { WorkerAdapter } from './worker-adapter.js';
import {
  SIGNAL_BUFFER_BYTES,
  DATA_BUFFER_BYTES,
  SIG_IDX_STATE,
  SIG_IDX_ERRNO,
  SIG_IDX_INT_RESULT,
  SIG_IDX_DATA_LEN,
  SIG_STATE_IDLE,
  SIG_STATE_READY,
  type WorkerMessage,
  type SyscallRequest,
  type WorkerInitData,
  type PermissionTier,
} from './syscall-rpc.js';
import { ERRNO_MAP, ERRNO_EIO } from './wasi-constants.js';
import { isWasmBinary, isWasmBinarySync } from './wasm-magic.js';
import { resolvePermissionTier } from './permission-check.js';
import { ModuleCache } from './module-cache.js';
import { readdir, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { connect as tcpConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { lookup } from 'node:dns/promises';

function getKernelWorkerUrl(): URL {
  const siblingWorkerUrl = new URL('./kernel-worker.js', import.meta.url);
  if (existsSync(siblingWorkerUrl)) {
    return siblingWorkerUrl;
  }
  return new URL('../dist/kernel-worker.js', import.meta.url);
}

/**
 * All commands available in the WasmVM runtime.
 * Used as fallback when no commandDirs are configured (legacy mode).
 * @deprecated Use commandDirs option instead — commands are discovered from filesystem.
 */
export const WASMVM_COMMANDS: readonly string[] = [
  // Shell
  'sh', 'bash',
  // Text processing
  'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'jq', 'yq',
  // Find
  'find', 'fd',
  // Built-in implementations
  'cat', 'chmod', 'column', 'cp', 'dd', 'diff', 'du', 'expr', 'file', 'head',
  'ln', 'logname', 'ls', 'mkdir', 'mktemp', 'mv', 'pathchk', 'rev', 'rm',
  'sleep', 'sort', 'split', 'stat', 'strings', 'tac', 'tail', 'test',
  '[', 'touch', 'tree', 'tsort', 'whoami',
  // Compression & Archiving
  'gzip', 'gunzip', 'zcat', 'tar', 'zip', 'unzip',
  // Data Processing (C programs)
  'sqlite3',
  // Network (C programs)
  'curl', 'wget',
  // Build tools (C programs)
  'make',
  // Version control (C programs)
  'git', 'git-remote-http', 'git-remote-https',
  // Shim commands
  'env', 'envsubst', 'nice', 'nohup', 'stdbuf', 'timeout', 'xargs',
  // uutils: text/encoding
  'base32', 'base64', 'basenc', 'basename', 'comm', 'cut',
  'dircolors', 'dirname', 'echo', 'expand', 'factor', 'false',
  'fmt', 'fold', 'join', 'nl', 'numfmt', 'od', 'paste',
  'printenv', 'printf', 'ptx', 'seq', 'shuf', 'tr', 'true',
  'unexpand', 'uniq', 'wc', 'yes',
  // uutils: checksums
  'b2sum', 'cksum', 'md5sum', 'sha1sum', 'sha224sum', 'sha256sum',
  'sha384sum', 'sha512sum', 'sum',
  // uutils: file operations
  'link', 'pwd', 'readlink', 'realpath', 'rmdir', 'shred', 'tee',
  'truncate', 'unlink',
  // uutils: system info
  'arch', 'date', 'nproc', 'uname',
  // uutils: ls variants
  'dir', 'vdir',
  // Stubbed commands
  'hostname', 'hostid', 'more', 'sync', 'tty',
  'chcon', 'runcon',
  'chgrp', 'chown',
  'chroot',
  'df',
  'groups', 'id',
  'install',
  'kill',
  'mkfifo', 'mknod',
  'pinky', 'who', 'users', 'uptime',
  'stty',
  // Codex CLI (host_process spawn via wasi-spawn)
  'codex',
  // Codex headless agent (non-TUI entry point)
  'codex-exec',
  // Internal test: WasiChild host_process spawn validation
  'spawn-test-host',
  // Internal test: wasi-http HTTP client validation via host_net
  'http-test',
] as const;
Object.freeze(WASMVM_COMMANDS);

/**
 * Default permission tiers for known first-party commands.
 * User-provided permissions override these defaults.
 */
export const DEFAULT_FIRST_PARTY_TIERS: Readonly<Record<string, PermissionTier>> = {
  // Shell — needs proc_spawn for pipelines and subcommands
  'sh': 'full',
  'bash': 'full',
  // Shims — spawn child processes as their core function
  'env': 'full',
  'timeout': 'full',
  'xargs': 'full',
  'nice': 'full',
  'nohup': 'full',
  'stdbuf': 'full',
  // Build tools — spawns child processes to run recipes
  'make': 'full',
  // Codex CLI — spawns child processes via wasi-spawn
  'codex': 'full',
  // Codex headless agent — spawns processes + uses network
  'codex-exec': 'full',
  // Internal test — exercises WasiChild host_process spawn
  'spawn-test-host': 'full',
  // Internal test — exercises wasi-http HTTP client via host_net
  'http-test': 'full',
  // Version control — reads/writes .git objects, remote operations use network
  'git': 'full',
  'git-remote-http': 'full',
  'git-remote-https': 'full',
  // Read-only tools — never need to write files
  'grep': 'read-only',
  'egrep': 'read-only',
  'fgrep': 'read-only',
  'rg': 'read-only',
  'cat': 'read-only',
  'head': 'read-only',
  'tail': 'read-only',
  'wc': 'read-only',
  'sort': 'read-only',
  'uniq': 'read-only',
  'diff': 'read-only',
  'find': 'read-only',
  'fd': 'read-only',
  'tree': 'read-only',
  'file': 'read-only',
  'du': 'read-only',
  'ls': 'read-only',
  'dir': 'read-only',
  'vdir': 'read-only',
  'strings': 'read-only',
  'stat': 'read-only',
  'rev': 'read-only',
  'column': 'read-only',
  'cut': 'read-only',
  'tr': 'read-only',
  'paste': 'read-only',
  'join': 'read-only',
  'fold': 'read-only',
  'expand': 'read-only',
  'nl': 'read-only',
  'od': 'read-only',
  'comm': 'read-only',
  'basename': 'read-only',
  'dirname': 'read-only',
  'realpath': 'read-only',
  'readlink': 'read-only',
  'pwd': 'read-only',
  'echo': 'read-only',
  'envsubst': 'read-only',
  'printf': 'read-only',
  'true': 'read-only',
  'false': 'read-only',
  'yes': 'read-only',
  'seq': 'read-only',
  'test': 'read-only',
  '[': 'read-only',
  'expr': 'read-only',
  'factor': 'read-only',
  'date': 'read-only',
  'uname': 'read-only',
  'nproc': 'read-only',
  'whoami': 'read-only',
  'id': 'read-only',
  'groups': 'read-only',
  'base64': 'read-only',
  'md5sum': 'read-only',
  'sha256sum': 'read-only',
  'tac': 'read-only',
  'tsort': 'read-only',
  // Network — needs socket access for HTTP, can write with -o/-O
  'curl': 'full',
  'wget': 'full',
  // Data processing — need write for file-based databases
  'sqlite3': 'read-write',
};

export interface WasmVmRuntimeOptions {
  /**
   * Path to a compiled WASM binary (legacy single-binary mode).
   * @deprecated Use commandDirs instead. Triggers legacy mode.
   */
  wasmBinaryPath?: string;
  /** Directories to scan for WASM command binaries, searched in order (PATH semantics). */
  commandDirs?: string[];
  /** Per-command permission tiers. Keys are command names, '*' sets the default. */
  permissions?: Record<string, PermissionTier>;
}

/**
 * Create a WasmVM RuntimeDriver that can be mounted into the kernel.
 */
export function createWasmVmRuntime(options?: WasmVmRuntimeOptions): RuntimeDriver {
  return new WasmVmRuntimeDriver(options);
}

class WasmVmRuntimeDriver implements RuntimeDriver {
  readonly name = 'wasmvm';

  // Dynamic commands list — populated from filesystem scan or legacy WASMVM_COMMANDS
  private _commands: string[] = [];
  // Command name → binary path map (commandDirs mode only)
  private _commandPaths = new Map<string, string>();
  private _commandDirs: string[];
  // Legacy mode: single binary path
  private _wasmBinaryPath: string;
  private _legacyMode: boolean;
  // Per-command permission tiers
  private _permissions: Record<string, PermissionTier>;

  private _kernel: KernelInterface | null = null;
  private _activeWorkers = new Map<number, WorkerHandle>();
  private _workerAdapter = new WorkerAdapter();
  private _moduleCache = new ModuleCache();
  // Socket table: socketId → Node.js Socket (per-driver, not per-process)
  private _sockets = new Map<number, Socket>();
  private _nextSocketId = 1;

  get commands(): string[] { return this._commands; }

  constructor(options?: WasmVmRuntimeOptions) {
    this._commandDirs = options?.commandDirs ?? [];
    this._wasmBinaryPath = options?.wasmBinaryPath ?? '';
    this._permissions = options?.permissions ?? {};

    // Legacy mode when wasmBinaryPath is set and commandDirs is not
    this._legacyMode = !options?.commandDirs && !!options?.wasmBinaryPath;

    if (this._legacyMode) {
      // Deprecated path — use static command list
      this._commands = [...WASMVM_COMMANDS];
    }

    // Emit deprecation warning for wasmBinaryPath
    if (options?.wasmBinaryPath && options?.commandDirs) {
      console.warn(
        'WasmVmRuntime: wasmBinaryPath is deprecated and ignored when commandDirs is set. ' +
        'Use commandDirs only.',
      );
    } else if (options?.wasmBinaryPath) {
      console.warn(
        'WasmVmRuntime: wasmBinaryPath is deprecated. Use commandDirs instead.',
      );
    }
  }

  async init(kernel: KernelInterface): Promise<void> {
    this._kernel = kernel;

    // Scan commandDirs for WASM binaries (skip in legacy mode)
    if (!this._legacyMode && this._commandDirs.length > 0) {
      await this._scanCommandDirs();
    }
  }

  /**
   * On-demand discovery: synchronously check commandDirs for a binary.
   * Called by the kernel when CommandRegistry.resolve() returns null.
   */
  tryResolve(command: string): boolean {
    // Not applicable in legacy mode
    if (this._legacyMode) return false;
    // Already known
    if (this._commandPaths.has(command)) return true;

    for (const dir of this._commandDirs) {
      const fullPath = join(dir, command);
      try {
        if (!existsSync(fullPath)) continue;
        // Skip directories
        const st = statSync(fullPath);
        if (st.isDirectory()) continue;
      } catch {
        continue;
      }

      // Sync 4-byte WASM magic check
      if (!isWasmBinarySync(fullPath)) continue;

      this._commandPaths.set(command, fullPath);
      if (!this._commands.includes(command)) this._commands.push(command);
      return true;
    }
    return false;
  }

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const kernel = this._kernel;
    if (!kernel) throw new Error('WasmVM driver not initialized');

    // Resolve binary path for this command
    const binaryPath = this._resolveBinaryPath(command);

    // Exit plumbing — resolved once, either on success or error
    let resolveExit!: (code: number) => void;
    let exitResolved = false;
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = (code: number) => {
        if (exitResolved) return;
        exitResolved = true;
        resolve(code);
      };
    });

    // Set up stdin pipe for writeStdin/closeStdin — skip if FD 0 is already
    // a PTY slave, pipe, or file (shell redirect/pipe wiring must be preserved)
    const stdinIsPty = kernel.isatty(ctx.pid, 0);
    const stdinAlreadyRouted = stdinIsPty || this._isFdKernelRouted(ctx.pid, 0) || this._isFdRegularFile(ctx.pid, 0);
    let stdinWriteFd: number | undefined;
    if (!stdinAlreadyRouted) {
      const stdinPipe = kernel.pipe(ctx.pid);
      kernel.fdDup2(ctx.pid, stdinPipe.readFd, 0);
      kernel.fdClose(ctx.pid, stdinPipe.readFd);
      stdinWriteFd = stdinPipe.writeFd;
    }

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: (data: Uint8Array) => {
        if (stdinWriteFd !== undefined) kernel.fdWrite(ctx.pid, stdinWriteFd, data);
      },
      closeStdin: () => {
        if (stdinWriteFd !== undefined) {
          try { kernel.fdClose(ctx.pid, stdinWriteFd); } catch { /* already closed */ }
        }
      },
      kill: (signal: number) => {
        const worker = this._activeWorkers.get(ctx.pid);
        if (worker) {
          worker.terminate();
          this._activeWorkers.delete(ctx.pid);
        }
        // Encode signal-killed exit status (POSIX: low 7 bits = signal number)
        const signalStatus = signal & 0x7f;
        resolveExit(signalStatus);
        proc.onExit?.(signalStatus);
      },
      wait: () => exitPromise,
    };

    // Launch worker asynchronously — spawn() returns synchronously per contract
    this._launchWorker(command, args, ctx, proc, resolveExit, binaryPath).catch((err) => {
      const errBytes = new TextEncoder().encode(`${err instanceof Error ? err.message : String(err)}\n`);
      ctx.onStderr?.(errBytes);
      proc.onStderr?.(errBytes);
      resolveExit(1);
      proc.onExit?.(1);
    });

    return proc;
  }

  async dispose(): Promise<void> {
    for (const worker of this._activeWorkers.values()) {
      try { await worker.terminate(); } catch { /* best effort */ }
    }
    this._activeWorkers.clear();
    // Clean up open sockets
    for (const sock of this._sockets.values()) {
      try { sock.destroy(); } catch { /* best effort */ }
    }
    this._sockets.clear();
    this._moduleCache.clear();
    this._kernel = null;
  }

  // -------------------------------------------------------------------------
  // Command discovery
  // -------------------------------------------------------------------------

  /** Scan all command directories, validating WASM magic bytes. */
  private async _scanCommandDirs(): Promise<void> {
    this._commandPaths.clear();
    this._commands = [];

    for (const dir of this._commandDirs) {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        // Directory doesn't exist or isn't readable — skip
        continue;
      }

      for (const entry of entries) {
        // Skip dotfiles
        if (entry.startsWith('.')) continue;

        const fullPath = join(dir, entry);

        // Skip directories
        try {
          const st = await stat(fullPath);
          if (st.isDirectory()) continue;
        } catch {
          continue;
        }

        // Validate WASM magic bytes
        if (!(await isWasmBinary(fullPath))) continue;

        // First directory containing the command wins (PATH semantics)
        if (!this._commandPaths.has(entry)) {
          this._commandPaths.set(entry, fullPath);
          this._commands.push(entry);
        }
      }
    }
  }

  /** Resolve permission tier for a command with wildcard and default tier support. */
  _resolvePermissionTier(command: string): PermissionTier {
    // No permissions config → fully unrestricted (backward compatible)
    if (Object.keys(this._permissions).length === 0) return 'full';
    // User config checked first (exact, glob, *), defaults as fallback layer
    return resolvePermissionTier(command, this._permissions, DEFAULT_FIRST_PARTY_TIERS);
  }

  /** Resolve binary path for a command. */
  private _resolveBinaryPath(command: string): string {
    // commandDirs mode: look up per-command binary path
    const perCommand = this._commandPaths.get(command);
    if (perCommand) return perCommand;

    // Legacy mode: all commands use a single binary
    if (this._legacyMode) return this._wasmBinaryPath;

    // Fallback to wasmBinaryPath if set (shouldn't reach here normally)
    return this._wasmBinaryPath;
  }

  // -------------------------------------------------------------------------
  // FD helpers
  // -------------------------------------------------------------------------

  /** Check if a process's FD is routed through kernel (pipe or PTY). */
  private _isFdKernelRouted(pid: number, fd: number): boolean {
    if (!this._kernel) return false;
    try {
      const stat = this._kernel.fdStat(pid, fd);
      if (stat.filetype === 6) return true; // FILETYPE_PIPE
      return this._kernel.isatty(pid, fd); // PTY slave
    } catch {
      return false;
    }
  }

  /** Check if a process's FD points to a regular file (e.g. shell < redirect). */
  private _isFdRegularFile(pid: number, fd: number): boolean {
    if (!this._kernel) return false;
    try {
      const stat = this._kernel.fdStat(pid, fd);
      return stat.filetype === 4; // FILETYPE_REGULAR_FILE
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Worker lifecycle
  // -------------------------------------------------------------------------

  private async _launchWorker(
    command: string,
    args: string[],
    ctx: ProcessContext,
    proc: DriverProcess,
    resolveExit: (code: number) => void,
    binaryPath: string,
  ): Promise<void> {
    const kernel = this._kernel!;

    // Pre-compile module via cache for fast re-instantiation on subsequent spawns
    let wasmModule: WebAssembly.Module | undefined;
    try {
      wasmModule = await this._moduleCache.resolve(binaryPath);
    } catch (err) {
      // Fail fast with a clear error — don't launch a worker with an undefined module
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`wasmvm: failed to compile module for '${command}' at ${binaryPath}: ${msg}`);
    }

    // Create shared buffers for RPC
    const signalBuf = new SharedArrayBuffer(SIGNAL_BUFFER_BYTES);
    const dataBuf = new SharedArrayBuffer(DATA_BUFFER_BYTES);

    // Check if stdio FDs are kernel-routed (pipe, PTY, or regular file redirect)
    const stdinPiped = this._isFdKernelRouted(ctx.pid, 0);
    const stdinIsFile = this._isFdRegularFile(ctx.pid, 0);
    const stdoutPiped = this._isFdKernelRouted(ctx.pid, 1);
    const stdoutIsFile = this._isFdRegularFile(ctx.pid, 1);
    const stderrPiped = this._isFdKernelRouted(ctx.pid, 2);
    const stderrIsFile = this._isFdRegularFile(ctx.pid, 2);

    // Detect which FDs are TTYs (PTY slaves) for brush-shell interactive mode
    const ttyFds: number[] = [];
    for (const fd of [0, 1, 2]) {
      if (kernel.isatty(ctx.pid, fd)) ttyFds.push(fd);
    }

    const permissionTier = this._resolvePermissionTier(command);

    const workerData: WorkerInitData = {
      wasmBinaryPath: binaryPath,
      command,
      args,
      pid: ctx.pid,
      ppid: ctx.ppid,
      env: ctx.env,
      cwd: ctx.cwd,
      signalBuf,
      dataBuf,
      // Tell worker which stdio channels are kernel-routed (pipe, PTY, or file redirect)
      stdinFd: (stdinPiped || stdinIsFile) ? 99 : undefined,
      stdoutFd: (stdoutPiped || stdoutIsFile) ? 99 : undefined,
      stderrFd: (stderrPiped || stderrIsFile) ? 99 : undefined,
      ttyFds: ttyFds.length > 0 ? ttyFds : undefined,
      wasmModule,
      permissionTier,
    };

    const workerUrl = getKernelWorkerUrl();

    this._workerAdapter.spawn(workerUrl, { workerData }).then(
      (worker) => {
        this._activeWorkers.set(ctx.pid, worker);

        worker.onMessage((raw: unknown) => {
          const msg = raw as WorkerMessage;
          this._handleWorkerMessage(msg, ctx, kernel, signalBuf, dataBuf, proc, resolveExit);
        });

        worker.onError((err: Error) => {
          const errBytes = new TextEncoder().encode(`wasmvm: ${err.message}\n`);
          ctx.onStderr?.(errBytes);
          proc.onStderr?.(errBytes);
          this._activeWorkers.delete(ctx.pid);
          resolveExit(1);
          proc.onExit?.(1);
        });

        worker.onExit((_code: number) => {
          this._activeWorkers.delete(ctx.pid);
        });
      },
      (err: unknown) => {
        // Worker creation failed (binary not found, etc.)
        const errMsg = err instanceof Error ? err.message : String(err);
        const errBytes = new TextEncoder().encode(`wasmvm: ${errMsg}\n`);
        ctx.onStderr?.(errBytes);
        proc.onStderr?.(errBytes);
        resolveExit(127);
        proc.onExit?.(127);
      },
    );
  }

  // -------------------------------------------------------------------------
  // Worker message handling
  // -------------------------------------------------------------------------

  private _handleWorkerMessage(
    msg: WorkerMessage,
    ctx: ProcessContext,
    kernel: KernelInterface,
    signalBuf: SharedArrayBuffer,
    dataBuf: SharedArrayBuffer,
    proc: DriverProcess,
    resolveExit: (code: number) => void,
  ): void {
    switch (msg.type) {
      case 'stdout':
        ctx.onStdout?.(msg.data);
        proc.onStdout?.(msg.data);
        break;
      case 'stderr':
        ctx.onStderr?.(msg.data);
        proc.onStderr?.(msg.data);
        break;
      case 'exit':
        this._activeWorkers.delete(ctx.pid);
        resolveExit(msg.code);
        proc.onExit?.(msg.code);
        break;
      case 'syscall':
        this._handleSyscall(msg, ctx.pid, kernel, signalBuf, dataBuf);
        break;
      case 'ready':
        // Worker is ready — could be used for stdin/lifecycle signaling
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Syscall RPC handler — dispatches worker requests to KernelInterface
  // -------------------------------------------------------------------------

  private async _handleSyscall(
    msg: SyscallRequest,
    pid: number,
    kernel: KernelInterface,
    signalBuf: SharedArrayBuffer,
    dataBuf: SharedArrayBuffer,
  ): Promise<void> {
    const signal = new Int32Array(signalBuf);
    const data = new Uint8Array(dataBuf);

    let errno = 0;
    let intResult = 0;
    let responseData: Uint8Array | null = null;

    try {
      switch (msg.call) {
        case 'fdRead': {
          const result = await kernel.fdRead(pid, msg.args.fd as number, msg.args.length as number);
          if (result.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(result, 0);
          responseData = result;
          break;
        }
        case 'fdWrite': {
          intResult = await kernel.fdWrite(pid, msg.args.fd as number, new Uint8Array(msg.args.data as ArrayBuffer));
          break;
        }
        case 'fdPread': {
          const result = await kernel.fdPread(pid, msg.args.fd as number, msg.args.length as number, BigInt(msg.args.offset as string));
          if (result.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(result, 0);
          responseData = result;
          break;
        }
        case 'fdPwrite': {
          intResult = await kernel.fdPwrite(pid, msg.args.fd as number, new Uint8Array(msg.args.data as ArrayBuffer), BigInt(msg.args.offset as string));
          break;
        }
        case 'fdOpen': {
          intResult = kernel.fdOpen(pid, msg.args.path as string, msg.args.flags as number, msg.args.mode as number);
          break;
        }
        case 'fdSeek': {
          const offset = await kernel.fdSeek(pid, msg.args.fd as number, BigInt(msg.args.offset as string), msg.args.whence as number);
          intResult = Number(offset);
          break;
        }
        case 'fdClose': {
          kernel.fdClose(pid, msg.args.fd as number);
          break;
        }
        case 'fdStat': {
          const stat = kernel.fdStat(pid, msg.args.fd as number);
          // Pack stat into data buffer: filetype(i32) + flags(i32) + rights(f64 for bigint)
          const view = new DataView(dataBuf);
          view.setInt32(0, stat.filetype, true);
          view.setInt32(4, stat.flags, true);
          view.setFloat64(8, Number(stat.rights), true);
          responseData = new Uint8Array(0); // signal data-in-buffer
          Atomics.store(signal, SIG_IDX_DATA_LEN, 16);
          break;
        }
        case 'spawn': {
          // proc_spawn → kernel.spawn() — the critical cross-runtime routing
          // Includes FD overrides for pipe wiring (brush-shell pipeline stages)
          const spawnCtx: Record<string, unknown> = {
            env: msg.args.env as Record<string, string>,
            cwd: msg.args.cwd as string,
            ppid: pid,
          };
          // Forward FD overrides — only pass non-default values
          const stdinFd = msg.args.stdinFd as number | undefined;
          const stdoutFd = msg.args.stdoutFd as number | undefined;
          const stderrFd = msg.args.stderrFd as number | undefined;
          if (stdinFd !== undefined && stdinFd !== 0) spawnCtx.stdinFd = stdinFd;
          if (stdoutFd !== undefined && stdoutFd !== 1) spawnCtx.stdoutFd = stdoutFd;
          if (stderrFd !== undefined && stderrFd !== 2) spawnCtx.stderrFd = stderrFd;

          const managed = kernel.spawn(
            msg.args.command as string,
            msg.args.spawnArgs as string[],
            spawnCtx as Parameters<typeof kernel.spawn>[2],
          );
          intResult = managed.pid;
          // Exit code is delivered via the waitpid RPC — no async write needed
          break;
        }
        case 'waitpid': {
          const result = await kernel.waitpid(msg.args.pid as number, msg.args.options as number | undefined);
          // WNOHANG returns null if process is still running (encode as -1 for WASM side)
          intResult = result ? result.status : -1;
          break;
        }
        case 'kill': {
          kernel.kill(msg.args.pid as number, msg.args.signal as number);
          break;
        }
        case 'pipe': {
          // fd_pipe → create kernel pipe in this process's FD table
          const pipeFds = kernel.pipe(pid);
          // Pack read + write FDs: low 16 bits = readFd, high 16 bits = writeFd
          intResult = (pipeFds.readFd & 0xFFFF) | ((pipeFds.writeFd & 0xFFFF) << 16);
          break;
        }
        case 'openpty': {
          // pty_open → allocate PTY master/slave pair in this process's FD table
          const ptyFds = kernel.openpty(pid);
          // Pack master + slave FDs: low 16 bits = masterFd, high 16 bits = slaveFd
          intResult = (ptyFds.masterFd & 0xFFFF) | ((ptyFds.slaveFd & 0xFFFF) << 16);
          break;
        }
        case 'fdDup': {
          intResult = kernel.fdDup(pid, msg.args.fd as number);
          break;
        }
        case 'fdDup2': {
          kernel.fdDup2(pid, msg.args.oldFd as number, msg.args.newFd as number);
          break;
        }
        case 'vfsStat':
        case 'vfsLstat': {
          const stat = msg.call === 'vfsLstat'
            ? await kernel.vfs.lstat(msg.args.path as string)
            : await kernel.vfs.stat(msg.args.path as string);
          const enc = new TextEncoder();
          const json = JSON.stringify({
            ino: stat.ino,
            type: stat.isDirectory ? 'dir' : stat.isSymbolicLink ? 'symlink' : 'file',
            mode: stat.mode,
            uid: stat.uid,
            gid: stat.gid,
            nlink: stat.nlink,
            size: stat.size,
            atime: stat.atimeMs,
            mtime: stat.mtimeMs,
            ctime: stat.ctimeMs,
          });
          const bytes = enc.encode(json);
          if (bytes.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(bytes, 0);
          responseData = bytes;
          break;
        }
        case 'vfsReaddir': {
          const entries = await kernel.vfs.readDir(msg.args.path as string);
          const bytes = new TextEncoder().encode(JSON.stringify(entries));
          if (bytes.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(bytes, 0);
          responseData = bytes;
          break;
        }
        case 'vfsMkdir': {
          await kernel.vfs.mkdir(msg.args.path as string);
          break;
        }
        case 'vfsUnlink': {
          await kernel.vfs.removeFile(msg.args.path as string);
          break;
        }
        case 'vfsRmdir': {
          await kernel.vfs.removeDir(msg.args.path as string);
          break;
        }
        case 'vfsRename': {
          await kernel.vfs.rename(msg.args.oldPath as string, msg.args.newPath as string);
          break;
        }
        case 'vfsSymlink': {
          await kernel.vfs.symlink(msg.args.target as string, msg.args.linkPath as string);
          break;
        }
        case 'vfsReadlink': {
          const target = await kernel.vfs.readlink(msg.args.path as string);
          const bytes = new TextEncoder().encode(target);
          if (bytes.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(bytes, 0);
          responseData = bytes;
          break;
        }
        case 'vfsReadFile': {
          const content = await kernel.vfs.readFile(msg.args.path as string);
          if (content.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(content, 0);
          responseData = content;
          break;
        }
        case 'vfsWriteFile': {
          await kernel.vfs.writeFile(msg.args.path as string, new Uint8Array(msg.args.data as ArrayBuffer));
          break;
        }
        case 'vfsExists': {
          const exists = await kernel.vfs.exists(msg.args.path as string);
          intResult = exists ? 1 : 0;
          break;
        }
        case 'vfsRealpath': {
          const resolved = await kernel.vfs.realpath(msg.args.path as string);
          const bytes = new TextEncoder().encode(resolved);
          if (bytes.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds SAB capacity
            break;
          }
          data.set(bytes, 0);
          responseData = bytes;
          break;
        }
        // ----- Networking (TCP sockets) -----
        case 'netSocket': {
          const socketId = this._nextSocketId++;
          // Allocate slot — actual connection is deferred to netConnect
          this._sockets.set(socketId, null as unknown as Socket);
          intResult = socketId;
          break;
        }
        case 'netConnect': {
          const socketId = msg.args.fd as number;
          if (!this._sockets.has(socketId)) {
            errno = ERRNO_MAP.EBADF;
            break;
          }

          const addr = msg.args.addr as string;
          // Parse "host:port" format
          const lastColon = addr.lastIndexOf(':');
          if (lastColon === -1) {
            errno = ERRNO_MAP.EINVAL;
            break;
          }
          const host = addr.slice(0, lastColon);
          const port = parseInt(addr.slice(lastColon + 1), 10);
          if (isNaN(port)) {
            errno = ERRNO_MAP.EINVAL;
            break;
          }

          // Connect synchronously from the worker's perspective (blocking via Atomics)
          try {
            const sock = await new Promise<Socket>((resolve, reject) => {
              const s = tcpConnect({ host, port }, () => resolve(s));
              s.on('error', reject);
            });
            this._sockets.set(socketId, sock);
          } catch (err) {
            errno = ERRNO_MAP.ECONNREFUSED;
          }
          break;
        }
        case 'netSend': {
          const socketId = msg.args.fd as number;
          const sock = this._sockets.get(socketId);
          if (!sock) {
            errno = ERRNO_MAP.EBADF;
            break;
          }

          const sendData = Buffer.from(msg.args.data as number[]);
          const written = await new Promise<number>((resolve, reject) => {
            sock.write(sendData, (err) => {
              if (err) reject(err);
              else resolve(sendData.length);
            });
          });
          intResult = written;
          break;
        }
        case 'netRecv': {
          const socketId = msg.args.fd as number;
          const sock = this._sockets.get(socketId);
          if (!sock) {
            errno = ERRNO_MAP.EBADF;
            break;
          }

          const maxLen = msg.args.length as number;
          // Wait for data via 'data' event, or EOF via 'end'
          const recvData = await new Promise<Uint8Array>((resolve) => {
            const onData = (chunk: Buffer) => {
              cleanup();
              // Return at most maxLen bytes, push remainder back
              if (chunk.length > maxLen) {
                sock.unshift(chunk.subarray(maxLen));
                resolve(new Uint8Array(chunk.subarray(0, maxLen)));
              } else {
                resolve(new Uint8Array(chunk));
              }
            };
            const onEnd = () => {
              cleanup();
              resolve(new Uint8Array(0));
            };
            const onError = () => {
              cleanup();
              resolve(new Uint8Array(0));
            };
            const cleanup = () => {
              sock.removeListener('data', onData);
              sock.removeListener('end', onEnd);
              sock.removeListener('error', onError);
            };
            sock.once('data', onData);
            sock.once('end', onEnd);
            sock.once('error', onError);
          });

          if (recvData.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO
            break;
          }
          if (recvData.length > 0) {
            data.set(recvData, 0);
          }
          responseData = recvData;
          intResult = recvData.length;
          break;
        }
        case 'netTlsConnect': {
          const socketId = msg.args.fd as number;
          const sock = this._sockets.get(socketId);
          if (!sock) {
            errno = ERRNO_MAP.EBADF;
            break;
          }

          const hostname = msg.args.hostname as string;
          // Only override rejectUnauthorized when explicitly provided
          const tlsOpts: Record<string, unknown> = {
            socket: sock,
            servername: hostname, // SNI
          };
          if (msg.args.verifyPeer === false) {
            tlsOpts.rejectUnauthorized = false;
          }
          try {
            // Upgrade existing TCP socket to TLS
            const tlsSock = await new Promise<TLSSocket>((resolve, reject) => {
              const s = tlsConnect(tlsOpts as any, () => resolve(s));
              s.on('error', reject);
            });
            // Replace plain socket with TLS socket — send/recv transparently use it
            this._sockets.set(socketId, tlsSock as unknown as Socket);
          } catch {
            errno = ERRNO_MAP.ECONNREFUSED;
          }
          break;
        }
        case 'netGetaddrinfo': {
          const host = msg.args.host as string;
          const port = msg.args.port as string;
          try {
            // Resolve all addresses (IPv4 + IPv6)
            const result = await lookup(host, { all: true });
            const addresses = result.map((r) => ({
              addr: r.address,
              family: r.family,
            }));
            const json = JSON.stringify(addresses);
            const bytes = new TextEncoder().encode(json);
            if (bytes.length > DATA_BUFFER_BYTES) {
              errno = 76; // EIO — response exceeds SAB capacity
              break;
            }
            data.set(bytes, 0);
            responseData = bytes;
            intResult = bytes.length;
          } catch (err) {
            // dns.lookup returns ENOTFOUND for unknown hosts
            const code = (err as { code?: string }).code;
            if (code === 'ENOTFOUND' || code === 'EAI_NONAME' || code === 'ENODATA') {
              errno = ERRNO_MAP.ENOENT;
            } else {
              errno = ERRNO_MAP.EINVAL;
            }
          }
          break;
        }
        case 'netPoll': {
          const fds = msg.args.fds as Array<{ fd: number; events: number }>;
          const timeout = msg.args.timeout as number;

          const revents: number[] = [];
          let ready = 0;

          // WASI poll constants
          const POLLIN = 0x1;
          const POLLOUT = 0x2;
          const POLLERR = 0x1000;
          const POLLHUP = 0x2000;
          const POLLNVAL = 0x4000;

          // Check each FD for readiness (sockets via _sockets map, pipes via kernel)
          for (const entry of fds) {
            const sock = this._sockets.get(entry.fd);
            if (sock) {
              let rev = 0;
              if ((entry.events & POLLIN) && sock.readableLength > 0) {
                rev |= POLLIN;
              }
              if ((entry.events & POLLOUT) && sock.writable) {
                rev |= POLLOUT;
              }
              if (sock.destroyed) {
                rev |= POLLHUP;
              }
              if (rev !== 0) ready++;
              revents.push(rev);
              continue;
            }

            // Not a socket — check kernel for pipe/file FDs
            if (kernel) {
              try {
                const ps = kernel.fdPoll(pid, entry.fd);
                if (ps.invalid) {
                  revents.push(POLLNVAL);
                  ready++;
                  continue;
                }
                let rev = 0;
                if ((entry.events & POLLIN) && ps.readable) rev |= POLLIN;
                if ((entry.events & POLLOUT) && ps.writable) rev |= POLLOUT;
                if (ps.hangup) rev |= POLLHUP;
                if (rev !== 0) ready++;
                revents.push(rev);
                continue;
              } catch {
                // Fall through to POLLNVAL
              }
            }

            revents.push(POLLNVAL);
            ready++;
          }

          // If no FDs ready and timeout != 0, wait for data on any socket
          if (ready === 0 && timeout !== 0) {
            const waitMs = timeout < 0 ? 30000 : timeout; // Cap indefinite waits
            const waitResult = await new Promise<{ index: number; event: string }>((resolve) => {
              const timer = setTimeout(() => {
                cleanup();
                resolve({ index: -1, event: 'timeout' });
              }, waitMs);
              const cleanups: (() => void)[] = [];

              const cleanup = () => {
                clearTimeout(timer);
                for (const fn of cleanups) fn();
              };

              for (let i = 0; i < fds.length; i++) {
                const sock = this._sockets.get(fds[i].fd);
                if (!sock) continue;

                if (fds[i].events & POLLIN) {
                  const onData = () => { cleanup(); resolve({ index: i, event: 'data' }); };
                  const onEnd = () => { cleanup(); resolve({ index: i, event: 'end' }); };
                  sock.once('readable', onData);
                  sock.once('end', onEnd);
                  cleanups.push(() => {
                    sock.removeListener('readable', onData);
                    sock.removeListener('end', onEnd);
                  });
                }
              }
            });

            // Re-check all FDs after wait (same logic as initial check)
            if (waitResult.event !== 'timeout') {
              ready = 0;
              for (let i = 0; i < fds.length; i++) {
                const sock = this._sockets.get(fds[i].fd);
                if (sock) {
                  let rev = 0;
                  if ((fds[i].events & POLLIN) && sock.readableLength > 0) rev |= POLLIN;
                  if ((fds[i].events & POLLOUT) && sock.writable) rev |= POLLOUT;
                  if (sock.destroyed) rev |= POLLHUP;
                  revents[i] = rev;
                  if (rev !== 0) ready++;
                } else if (kernel) {
                  try {
                    const ps = kernel.fdPoll(pid, fds[i].fd);
                    if (ps.invalid) { revents[i] = POLLNVAL; ready++; continue; }
                    let rev = 0;
                    if ((fds[i].events & POLLIN) && ps.readable) rev |= POLLIN;
                    if ((fds[i].events & POLLOUT) && ps.writable) rev |= POLLOUT;
                    if (ps.hangup) rev |= POLLHUP;
                    revents[i] = rev;
                    if (rev !== 0) ready++;
                  } catch {
                    revents[i] = POLLNVAL;
                    ready++;
                  }
                } else {
                  revents[i] = POLLNVAL;
                  ready++;
                }
              }
            }
          }

          // Encode revents as JSON
          const pollJson = JSON.stringify(revents);
          const pollBytes = new TextEncoder().encode(pollJson);
          if (pollBytes.length > DATA_BUFFER_BYTES) {
            errno = ERRNO_EIO;
            break;
          }
          data.set(pollBytes, 0);
          responseData = pollBytes;
          intResult = ready;
          break;
        }
        case 'netClose': {
          const socketId = msg.args.fd as number;
          const sock = this._sockets.get(socketId);
          if (!sock) {
            errno = ERRNO_MAP.EBADF;
            break;
          }
          sock.destroy();
          this._sockets.delete(socketId);
          break;
        }

        default:
          errno = ERRNO_MAP.ENOSYS; // ENOSYS
      }
    } catch (err) {
      errno = mapErrorToErrno(err);
    }

    // Guard against SAB data buffer overflow
    if (errno === 0 && responseData && responseData.length > DATA_BUFFER_BYTES) {
      errno = 76; // EIO — response exceeds 1MB SAB capacity
      responseData = null;
    }

    // Write response to signal buffer — always set DATA_LEN so workers
    // never read stale lengths from previous calls (e.g. 0-byte EOF reads)
    Atomics.store(signal, SIG_IDX_DATA_LEN, responseData ? responseData.length : 0);
    Atomics.store(signal, SIG_IDX_ERRNO, errno);
    Atomics.store(signal, SIG_IDX_INT_RESULT, intResult);
    Atomics.store(signal, SIG_IDX_STATE, SIG_STATE_READY);
    Atomics.notify(signal, SIG_IDX_STATE);
  }
}

/** Map errors to WASI errno codes. Prefers structured .code, falls back to string matching. */
export function mapErrorToErrno(err: unknown): number {
  if (!(err instanceof Error)) return ERRNO_EIO;

  // Prefer structured code field (KernelError, VfsError)
  const code = (err as { code?: string }).code;
  if (code && code in ERRNO_MAP) return ERRNO_MAP[code];

  // Fallback: match error code in message string
  const msg = err.message;
  for (const [name, errno] of Object.entries(ERRNO_MAP)) {
    if (msg.includes(name)) return errno;
  }
  return ERRNO_EIO;
}
