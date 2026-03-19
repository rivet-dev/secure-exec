/**
 * SharedArrayBuffer-based RPC protocol for worker ↔ main-thread syscalls.
 *
 * Workers run synchronous WASI code but the kernel's FD/VFS operations
 * are async. The RPC protocol bridges this gap:
 *   1. Worker posts a syscall request via postMessage
 *   2. Worker blocks via Atomics.wait on the signal buffer
 *   3. Main thread handles the request, writes response to shared buffers
 *   4. Main thread signals via Atomics.notify
 *   5. Worker reads response and continues
 */

// Signal buffer layout (Int32Array over SharedArrayBuffer, 4 slots)
export const SIG_IDX_STATE = 0;    // 0=idle, 1=response-ready
export const SIG_IDX_ERRNO = 1;    // errno from kernel call
export const SIG_IDX_INT_RESULT = 2; // integer result (fd, written bytes, etc.)
export const SIG_IDX_DATA_LEN = 3;  // length of response data in data buffer

export const SIG_STATE_IDLE = 0;
export const SIG_STATE_READY = 1;

export const SIGNAL_BUFFER_BYTES = 4 * Int32Array.BYTES_PER_ELEMENT;
export const DATA_BUFFER_BYTES = 1024 * 1024; // 1MB response data buffer

/** Wait timeout per Atomics.wait attempt (ms). */
export const RPC_WAIT_TIMEOUT_MS = 30_000;

// Syscall IDs — used in postMessage to identify the call
export const SYSCALL_FD_READ = 'fdRead';
export const SYSCALL_FD_WRITE = 'fdWrite';
export const SYSCALL_FD_OPEN = 'fdOpen';
export const SYSCALL_FD_SEEK = 'fdSeek';
export const SYSCALL_FD_CLOSE = 'fdClose';
export const SYSCALL_FD_PREAD = 'fdPread';
export const SYSCALL_FD_PWRITE = 'fdPwrite';
export const SYSCALL_FD_STAT = 'fdStat';
export const SYSCALL_SPAWN = 'spawn';
export const SYSCALL_WAITPID = 'waitpid';
export const SYSCALL_VFS_STAT = 'vfsStat';
export const SYSCALL_VFS_READDIR = 'vfsReaddir';
export const SYSCALL_VFS_MKDIR = 'vfsMkdir';
export const SYSCALL_VFS_UNLINK = 'vfsUnlink';
export const SYSCALL_VFS_RMDIR = 'vfsRmdir';
export const SYSCALL_VFS_RENAME = 'vfsRename';
export const SYSCALL_VFS_SYMLINK = 'vfsSymlink';
export const SYSCALL_VFS_READLINK = 'vfsReadlink';
export const SYSCALL_VFS_READ_FILE = 'vfsReadFile';
export const SYSCALL_VFS_WRITE_FILE = 'vfsWriteFile';
export const SYSCALL_VFS_EXISTS = 'vfsExists';
export const SYSCALL_VFS_CHMOD = 'vfsChmod';
export const SYSCALL_VFS_REALPATH = 'vfsRealpath';

// Worker → main messages
export interface SyscallRequest {
  type: 'syscall';
  call: string;
  args: Record<string, unknown>;
}

export interface StdoutMessage { type: 'stdout'; data: Uint8Array; }
export interface StderrMessage { type: 'stderr'; data: Uint8Array; }
export interface ExitMessage { type: 'exit'; code: number; }
export interface ReadyMessage { type: 'ready'; }

export type WorkerMessage =
  | SyscallRequest
  | StdoutMessage
  | StderrMessage
  | ExitMessage
  | ReadyMessage;

// Main → worker messages
export interface StartMessage {
  type: 'start';
}

/** Permission tier controlling what a command can access. */
export type PermissionTier = 'full' | 'read-write' | 'read-only' | 'isolated';

export interface WorkerInitData {
  wasmBinaryPath: string;
  command: string;
  args: string[];
  pid: number;
  ppid: number;
  env: Record<string, string>;
  cwd: string;
  signalBuf: SharedArrayBuffer;
  dataBuf: SharedArrayBuffer;
  /** FD override for stdin (pipe read end in parent's table, or undefined). */
  stdinFd?: number;
  /** FD override for stdout (pipe write end in parent's table, or undefined). */
  stdoutFd?: number;
  /** FD override for stderr (pipe write end in parent's table, or undefined). */
  stderrFd?: number;
  /** Which stdio FDs are TTYs (for brush-shell interactive mode detection). */
  ttyFds?: number[];
  /** Pre-compiled WebAssembly.Module from main thread's ModuleCache (transferable via structured clone). */
  wasmModule?: WebAssembly.Module;
  /** Permission tier for this command (default: 'read-write'). */
  permissionTier?: PermissionTier;
}
