/**
 * WasmVM runtime driver for kernel integration.
 *
 * Mounts the WasmVM multicall binary as a RuntimeDriver, enabling
 * kernel dispatch for 90+ coreutils/shell commands. Each spawn()
 * creates a Worker thread that loads the WASM binary and communicates
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

/**
 * All commands in the WasmVM multicall dispatch table.
 * brush-shell PATH lookup needs /bin stubs for these.
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
];

export interface WasmVmRuntimeOptions {
  /** Path to the compiled WASM multicall binary. */
  wasmBinaryPath?: string;
}

/**
 * Create a WasmVM RuntimeDriver that can be mounted into the kernel.
 */
export function createWasmVmRuntime(options?: WasmVmRuntimeOptions): RuntimeDriver {
  return new WasmVmRuntimeDriver(options);
}

class WasmVmRuntimeDriver implements RuntimeDriver {
  readonly name = 'wasmvm';
  readonly commands: string[] = [...WASMVM_COMMANDS];

  private _kernel: KernelInterface | null = null;
  private _wasmBinaryPath: string;
  private _activeWorkers = new Map<number, WorkerHandle>();
  private _workerAdapter = new WorkerAdapter();

  constructor(options?: WasmVmRuntimeOptions) {
    this._wasmBinaryPath = options?.wasmBinaryPath ?? '';
  }

  async init(kernel: KernelInterface): Promise<void> {
    this._kernel = kernel;
  }

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const kernel = this._kernel;
    if (!kernel) throw new Error('WasmVM driver not initialized');

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

    // Set up stdin pipe so writeStdin/closeStdin deliver data through kernel FD 0
    const stdinPipe = kernel.pipe(ctx.pid);
    kernel.fdDup2(ctx.pid, stdinPipe.readFd, 0);
    kernel.fdClose(ctx.pid, stdinPipe.readFd);
    const stdinWriteFd = stdinPipe.writeFd;

    const proc: DriverProcess = {
      onStdout: null,
      onStderr: null,
      onExit: null,
      writeStdin: (data: Uint8Array) => {
        kernel.fdWrite(ctx.pid, stdinWriteFd, data);
      },
      closeStdin: () => {
        try { kernel.fdClose(ctx.pid, stdinWriteFd); } catch { /* already closed */ }
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
    this._launchWorker(command, args, ctx, proc, resolveExit);

    return proc;
  }

  async dispose(): Promise<void> {
    for (const worker of this._activeWorkers.values()) {
      try { await worker.terminate(); } catch { /* best effort */ }
    }
    this._activeWorkers.clear();
    this._kernel = null;
  }

  /** Check if a process's FD is a pipe via kernel FD stat. */
  private _isFdPiped(pid: number, fd: number): boolean {
    if (!this._kernel) return false;
    try {
      const stat = this._kernel.fdStat(pid, fd);
      return stat.filetype === 6; // FILETYPE_PIPE
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Worker lifecycle
  // -------------------------------------------------------------------------

  private _launchWorker(
    command: string,
    args: string[],
    ctx: ProcessContext,
    proc: DriverProcess,
    resolveExit: (code: number) => void,
  ): void {
    const kernel = this._kernel!;

    // Create shared buffers for RPC
    const signalBuf = new SharedArrayBuffer(SIGNAL_BUFFER_BYTES);
    const dataBuf = new SharedArrayBuffer(DATA_BUFFER_BYTES);

    // Check if stdio FDs are piped by inspecting the kernel FD table
    const stdinPiped = this._isFdPiped(ctx.pid, 0);
    const stdoutPiped = this._isFdPiped(ctx.pid, 1);
    const stderrPiped = this._isFdPiped(ctx.pid, 2);

    const workerData: WorkerInitData = {
      wasmBinaryPath: this._wasmBinaryPath,
      command,
      args,
      pid: ctx.pid,
      ppid: ctx.ppid,
      env: ctx.env,
      cwd: ctx.cwd,
      signalBuf,
      dataBuf,
      // Tell worker which stdio channels are piped so it routes writes correctly
      stdinFd: stdinPiped ? 99 : undefined,
      stdoutFd: stdoutPiped ? 99 : undefined,
      stderrFd: stderrPiped ? 99 : undefined,
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
          intResult = kernel.fdWrite(pid, msg.args.fd as number, new Uint8Array(msg.args.data as ArrayBuffer));
          break;
        }
        case 'fdOpen': {
          intResult = kernel.fdOpen(pid, msg.args.path as string, msg.args.flags as number, msg.args.mode as number);
          break;
        }
        case 'fdSeek': {
          const offset = kernel.fdSeek(pid, msg.args.fd as number, BigInt(msg.args.offset as string), msg.args.whence as number);
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
          errno = 52; // ENOSYS
      }
    } catch (err) {
      errno = mapErrorToErrno(err);
    }

    // Guard against SAB data buffer overflow
    if (errno === 0 && responseData && responseData.length > DATA_BUFFER_BYTES) {
      errno = 76; // EIO — response exceeds 1MB SAB capacity
      responseData = null;
    }

    // Write response to signal buffer
    if (responseData && responseData.length > 0) {
      // Data already written to dataBuf above (for some cases)
      Atomics.store(signal, SIG_IDX_DATA_LEN, responseData.length);
    } else if (!responseData) {
      Atomics.store(signal, SIG_IDX_DATA_LEN, 0);
    }
    Atomics.store(signal, SIG_IDX_ERRNO, errno);
    Atomics.store(signal, SIG_IDX_INT_RESULT, intResult);
    Atomics.store(signal, SIG_IDX_STATE, SIG_STATE_READY);
    Atomics.notify(signal, SIG_IDX_STATE);
  }
}

/** Map error messages to WASI errno codes. */
function mapErrorToErrno(err: unknown): number {
  if (!(err instanceof Error)) return 76; // EIO
  const msg = err.message;
  if (msg.includes('EBADF')) return 8;
  if (msg.includes('ENOENT')) return 44;
  if (msg.includes('EEXIST')) return 20;
  if (msg.includes('ENOTDIR')) return 54;
  if (msg.includes('EISDIR')) return 31;
  if (msg.includes('EACCES')) return 2;
  if (msg.includes('ESRCH')) return 71;
  if (msg.includes('ENOSYS')) return 52;
  return 76; // EIO fallback
}
