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
  RuntimeDriver,
  KernelInterface,
  ProcessContext,
  DriverProcess,
} from '@secure-exec/kernel';
import type { WorkerHandle } from './worker-adapter.ts';
import { WorkerAdapter } from './worker-adapter.ts';
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
} from './syscall-rpc.ts';
import { ERRNO_MAP, ERRNO_EIO } from './wasi-constants.ts';
import { isWasmBinary, isWasmBinarySync } from './wasm-magic.ts';
import { ModuleCache } from './module-cache.ts';
import { readdir, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * All commands in the WasmVM multicall dispatch table.
 * Used as fallback when no commandDirs are configured (legacy mode).
 * @deprecated Use commandDirs option instead.
 */
export const WASMVM_COMMANDS: readonly string[] = [
  // Shell
  'sh', 'bash',
  // Text processing
  'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'jq', 'yq',
  // Find
  'find',
  // Built-in implementations
  'cat', 'chmod', 'column', 'cp', 'dd', 'diff', 'du', 'expr', 'file', 'head',
  'ln', 'logname', 'ls', 'mkdir', 'mktemp', 'mv', 'pathchk', 'rev', 'rm',
  'sleep', 'sort', 'split', 'stat', 'strings', 'tac', 'tail', 'test',
  '[', 'touch', 'tree', 'tsort', 'whoami',
  // Compression & Archiving
  'gzip', 'gunzip', 'zcat', 'tar',
  // Shim commands
  'env', 'nice', 'nohup', 'stdbuf', 'timeout', 'xargs',
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
] as const;
Object.freeze(WASMVM_COMMANDS);

export interface WasmVmRuntimeOptions {
  /**
   * Path to the compiled WASM multicall binary.
   * @deprecated Use commandDirs instead. Triggers legacy multicall mode.
   */
  wasmBinaryPath?: string;
  /** Directories to scan for WASM command binaries, searched in order (PATH semantics). */
  commandDirs?: string[];
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
  // Legacy mode: single multicall binary path
  private _wasmBinaryPath: string;
  private _legacyMode: boolean;

  private _kernel: KernelInterface | null = null;
  private _activeWorkers = new Map<number, WorkerHandle>();
  private _workerAdapter = new WorkerAdapter();
  private _moduleCache = new ModuleCache();

  get commands(): string[] { return this._commands; }

  constructor(options?: WasmVmRuntimeOptions) {
    this._commandDirs = options?.commandDirs ?? [];
    this._wasmBinaryPath = options?.wasmBinaryPath ?? '';

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
      kill: (_signal: number) => {
        const worker = this._activeWorkers.get(ctx.pid);
        if (worker) {
          worker.terminate();
          this._activeWorkers.delete(ctx.pid);
        }
      },
      wait: () => exitPromise,
    };

    // Launch worker asynchronously — spawn() returns synchronously per contract
    this._launchWorker(command, args, ctx, proc, resolveExit, binaryPath);

    return proc;
  }

  async dispose(): Promise<void> {
    for (const worker of this._activeWorkers.values()) {
      try { await worker.terminate(); } catch { /* best effort */ }
    }
    this._activeWorkers.clear();
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

  /** Resolve binary path for a command. */
  private _resolveBinaryPath(command: string): string {
    // commandDirs mode: look up per-command binary path
    const perCommand = this._commandPaths.get(command);
    if (perCommand) return perCommand;

    // Legacy mode: all commands use the single multicall binary
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
    } catch {
      // Binary not found or invalid — worker will report the error
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
    };

    const workerUrl = new URL('./kernel-worker.ts', import.meta.url);

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
          // Wait for child and write exit code to data buffer
          managed.wait().then((code) => {
            const view = new DataView(dataBuf);
            view.setInt32(0, code, true);
          });
          break;
        }
        case 'waitpid': {
          const result = await kernel.waitpid(msg.args.pid as number);
          intResult = result.status;
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
        case 'fdDup': {
          intResult = kernel.fdDup(pid, msg.args.fd as number);
          break;
        }
        case 'vfsStat': {
          const stat = await kernel.vfs.stat(msg.args.path as string);
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
          data.set(bytes, 0);
          responseData = bytes;
          break;
        }
        case 'vfsReaddir': {
          const entries = await kernel.vfs.readDir(msg.args.path as string);
          const bytes = new TextEncoder().encode(JSON.stringify(entries));
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
          data.set(bytes, 0);
          responseData = bytes;
          break;
        }
        case 'vfsReadFile': {
          const content = await kernel.vfs.readFile(msg.args.path as string);
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
          data.set(bytes, 0);
          responseData = bytes;
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
