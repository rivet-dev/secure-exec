/**
 * Worker entry for WasmVM kernel-integrated execution.
 *
 * Runs a single WASM command inside a worker thread. Communicates
 * with the main thread via SharedArrayBuffer RPC for synchronous
 * kernel calls (file I/O, VFS, process spawn) and postMessage for
 * stdout/stderr streaming.
 *
 * proc_spawn is provided as a host_process import so brush-shell
 * pipeline stages route through KernelInterface.spawn() to the
 * correct runtime driver.
 */

import { workerData, parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { WasiPolyfill, WasiProcExit } from './wasi-polyfill.ts';
import { UserManager } from './user.ts';
import { FDTable } from '../test/helpers/test-fd-table.ts';
import {
  FILETYPE_CHARACTER_DEVICE,
  FILETYPE_REGULAR_FILE,
  FILETYPE_DIRECTORY,
  ERRNO_SUCCESS,
  ERRNO_EACCES,
  ERRNO_EINVAL,
  ERRNO_EBADF,
} from './wasi-constants.ts';
import { VfsError } from './wasi-types.ts';
import type { WasiVFS, WasiInode, VfsStat, VfsSnapshotEntry } from './wasi-types.ts';
import type { WasiFileIO } from './wasi-file-io.ts';
import type { WasiProcessIO } from './wasi-process-io.ts';
import {
  SIG_IDX_STATE,
  SIG_IDX_ERRNO,
  SIG_IDX_INT_RESULT,
  SIG_IDX_DATA_LEN,
  SIG_STATE_IDLE,
  SIG_STATE_READY,
  RPC_WAIT_TIMEOUT_MS,
  type WorkerInitData,
  type SyscallRequest,
} from './syscall-rpc.ts';
import {
  isWriteBlocked as _isWriteBlocked,
  isSpawnBlocked as _isSpawnBlocked,
  isPathInCwd as _isPathInCwd,
} from './permission-check.ts';

const port = parentPort!;
const init = workerData as WorkerInitData;

// Permission tier for this command (default: read-write)
const permissionTier = init.permissionTier ?? 'read-write';

/** Check if the tier blocks write operations. */
function isWriteBlocked(): boolean {
  return _isWriteBlocked(permissionTier);
}

/** Check if the tier blocks subprocess spawning. */
function isSpawnBlocked(): boolean {
  return _isSpawnBlocked(permissionTier);
}

/** Check if a path is within the cwd subtree (for isolated tier). */
function isPathInCwd(path: string): boolean {
  return _isPathInCwd(path, init.cwd);
}

// -------------------------------------------------------------------------
// RPC client — blocks worker thread until main thread responds
// -------------------------------------------------------------------------

const signalArr = new Int32Array(init.signalBuf);
const dataArr = new Uint8Array(init.dataBuf);

function rpcCall(call: string, args: Record<string, unknown>): {
  errno: number;
  intResult: number;
  data: Uint8Array;
} {
  // Reset signal
  Atomics.store(signalArr, SIG_IDX_STATE, SIG_STATE_IDLE);

  // Post request
  const msg: SyscallRequest = { type: 'syscall', call, args };
  port.postMessage(msg);

  // Block until response
  const result = Atomics.wait(signalArr, SIG_IDX_STATE, SIG_STATE_IDLE, RPC_WAIT_TIMEOUT_MS);
  if (result === 'timed-out') {
    return { errno: 76 /* EIO */, intResult: 0, data: new Uint8Array(0) };
  }

  // Read response
  const errno = Atomics.load(signalArr, SIG_IDX_ERRNO);
  const intResult = Atomics.load(signalArr, SIG_IDX_INT_RESULT);
  const dataLen = Atomics.load(signalArr, SIG_IDX_DATA_LEN);
  const data = dataLen > 0 ? dataArr.slice(0, dataLen) : new Uint8Array(0);

  // Reset for next call
  Atomics.store(signalArr, SIG_IDX_STATE, SIG_STATE_IDLE);

  return { errno, intResult, data };
}

// -------------------------------------------------------------------------
// Local FD table — mirrors kernel state for rights checking / routing
// -------------------------------------------------------------------------

// Local FD → kernel FD mapping: the local FD table has a preopen at FD 3
// that the kernel doesn't know about, so opened-file FDs diverge.
const localToKernelFd = new Map<number, number>();

// Mapping-aware FDTable: updates localToKernelFd on renumber so pipe/redirect
// FDs remain reachable after WASI fd_renumber moves them to stdio positions.
// Also closes the kernel FD of the overwritten target (POSIX renumber semantics).
class KernelFDTable extends FDTable {
  renumber(oldFd: number, newFd: number): number {
    if (oldFd === newFd) {
      return this.has(oldFd) ? ERRNO_SUCCESS : ERRNO_EBADF;
    }

    // Capture mappings before super changes entries
    const sourceMapping = localToKernelFd.get(oldFd);
    const targetKernelFd = localToKernelFd.get(newFd) ?? newFd;

    const result = super.renumber(oldFd, newFd);
    if (result === ERRNO_SUCCESS) {
      // Close kernel FD of overwritten target (mirrors POSIX close-on-renumber)
      rpcCall('fdClose', { fd: targetKernelFd });

      // Move source mapping to target position
      localToKernelFd.delete(oldFd);
      localToKernelFd.delete(newFd);
      if (sourceMapping !== undefined) {
        localToKernelFd.set(newFd, sourceMapping);
      }
    }
    return result;
  }
}

const fdTable = new KernelFDTable();

// -------------------------------------------------------------------------
// Kernel-backed WasiFileIO
// -------------------------------------------------------------------------

function createKernelFileIO(): WasiFileIO {
  /** Translate local FD to kernel FD (falls back to identity for stdio FDs 0-2). */
  function kernelFd(localFd: number): number {
    return localToKernelFd.get(localFd) ?? localFd;
  }

  return {
    fdRead(fd, maxBytes) {
      const res = rpcCall('fdRead', { fd: kernelFd(fd), length: maxBytes });
      return { errno: res.errno, data: res.data };
    },
    fdWrite(fd, data) {
      // Permission check: read-only/isolated tiers can only write to stdout/stderr
      if (isWriteBlocked() && fd !== 1 && fd !== 2) {
        return { errno: ERRNO_EACCES, written: 0 };
      }
      const res = rpcCall('fdWrite', { fd: kernelFd(fd), data: Array.from(data) });
      return { errno: res.errno, written: res.intResult };
    },
    fdOpen(path, dirflags, oflags, fdflags, rightsBase, rightsInheriting) {
      const isDirectory = !!(oflags & 0x2); // OFLAG_DIRECTORY

      // Permission check: isolated tier restricts reads to cwd subtree
      if (permissionTier === 'isolated' && !isPathInCwd(path)) {
        return { errno: ERRNO_EACCES, fd: -1, filetype: 0 };
      }

      // Permission check: block write flags for read-only/isolated tiers
      const hasWriteIntent = !!(oflags & 0x1) || !!(oflags & 0x8) || !!(fdflags & 0x1) || !!(rightsBase & 2n);
      if (isWriteBlocked() && hasWriteIntent) {
        return { errno: ERRNO_EACCES, fd: -1, filetype: 0 };
      }

      // Directory opens: verify path exists as directory, return local FD
      // No kernel FD needed — directory ops use VFS RPCs, not kernel fdRead
      if (isDirectory) {
        const statRes = rpcCall('vfsStat', { path });
        if (statRes.errno !== 0) return { errno: 44 /* ENOENT */, fd: -1, filetype: 0 };

        const localFd = fdTable.open(
          { type: 'preopen', path },
          { filetype: FILETYPE_DIRECTORY, rightsBase, rightsInheriting, fdflags, path },
        );
        return { errno: 0, fd: localFd, filetype: FILETYPE_DIRECTORY };
      }

      // Map WASI oflags to POSIX open flags for kernel
      let flags = 0;
      if (oflags & 0x1) flags |= 0o100;   // O_CREAT
      if (oflags & 0x4) flags |= 0o200;   // O_EXCL
      if (oflags & 0x8) flags |= 0o1000;  // O_TRUNC
      if (fdflags & 0x1) flags |= 0o2000; // O_APPEND
      if (rightsBase & 2n) flags |= 1;     // O_WRONLY

      const res = rpcCall('fdOpen', { path, flags, mode: 0o666 });
      if (res.errno !== 0) return { errno: res.errno, fd: -1, filetype: 0 };

      const kFd = res.intResult; // kernel FD

      // Mirror in local FDTable for polyfill rights checking
      const localFd = fdTable.open(
        { type: 'vfsFile', ino: 0, path },
        { filetype: FILETYPE_REGULAR_FILE, rightsBase, rightsInheriting, fdflags, path },
      );
      localToKernelFd.set(localFd, kFd);
      return { errno: 0, fd: localFd, filetype: FILETYPE_REGULAR_FILE };
    },
    fdSeek(fd, offset, whence) {
      const res = rpcCall('fdSeek', { fd: kernelFd(fd), offset: offset.toString(), whence });
      return { errno: res.errno, newOffset: BigInt(res.intResult) };
    },
    fdClose(fd) {
      const kFd = kernelFd(fd);
      fdTable.close(fd);
      localToKernelFd.delete(fd);
      const res = rpcCall('fdClose', { fd: kFd });
      return res.errno;
    },
    fdPread(fd, maxBytes, offset) {
      const res = rpcCall('fdPread', { fd: kernelFd(fd), length: maxBytes, offset: offset.toString() });
      return { errno: res.errno, data: res.data };
    },
    fdPwrite(fd, data, offset) {
      const res = rpcCall('fdPwrite', { fd: kernelFd(fd), data: Array.from(data), offset: offset.toString() });
      return { errno: res.errno, written: res.intResult };
    },
  };
}

// -------------------------------------------------------------------------
// Kernel-backed WasiProcessIO
// -------------------------------------------------------------------------

function createKernelProcessIO(): WasiProcessIO {
  return {
    getArgs() {
      return [init.command, ...init.args];
    },
    getEnviron() {
      return init.env;
    },
    fdFdstatGet(fd) {
      const entry = fdTable.get(fd);
      if (!entry) {
        return { errno: 8 /* EBADF */, filetype: 0, fdflags: 0, rightsBase: 0n, rightsInheriting: 0n };
      }
      return {
        errno: 0,
        filetype: entry.filetype,
        fdflags: entry.fdflags,
        rightsBase: entry.rightsBase,
        rightsInheriting: entry.rightsInheriting,
      };
    },
    procExit(exitCode) {
      // Exit notification handled by WasiProcExit exception path
    },
  };
}

// -------------------------------------------------------------------------
// Kernel-backed VFS proxy — routes through RPC
// -------------------------------------------------------------------------

function createKernelVfs(): WasiVFS {
  const decoder = new TextDecoder();

  // Inode cache for getIno/getInodeByIno — synthesizes inodes from kernel VFS stat
  let nextIno = 1;
  const pathToIno = new Map<string, number>();
  const inoToPath = new Map<number, string>();
  const inoCache = new Map<number, WasiInode>();
  const populatedDirs = new Set<number>();

  function resolveIno(path: string): number | null {
    const cached = pathToIno.get(path);
    if (cached !== undefined) return cached;

    const res = rpcCall('vfsStat', { path });
    if (res.errno !== 0) return null;

    // RPC response fields: { type, mode, uid, gid, nlink, size, atime, mtime, ctime }
    const raw = JSON.parse(decoder.decode(res.data)) as Record<string, unknown>;
    const ino = nextIno++;
    pathToIno.set(path, ino);
    inoToPath.set(ino, path);

    const nodeType = raw.type as string ?? 'file';
    const isDir = nodeType === 'dir';
    const node: WasiInode = {
      type: nodeType,
      mode: (raw.mode as number) ?? (isDir ? 0o40755 : 0o100644),
      uid: (raw.uid as number) ?? 0,
      gid: (raw.gid as number) ?? 0,
      nlink: (raw.nlink as number) ?? 1,
      size: (raw.size as number) ?? 0,
      atime: (raw.atime as number) ?? Date.now(),
      mtime: (raw.mtime as number) ?? Date.now(),
      ctime: (raw.ctime as number) ?? Date.now(),
    };

    if (isDir) {
      node.entries = new Map();
    }

    inoCache.set(ino, node);
    return ino;
  }

  /** Lazy-populate directory entries from kernel VFS readdir. */
  function populateDirEntries(ino: number, node: WasiInode): void {
    if (populatedDirs.has(ino)) return;
    populatedDirs.add(ino);

    const path = inoToPath.get(ino);
    if (!path) return;

    const res = rpcCall('vfsReaddir', { path });
    if (res.errno !== 0) return;

    const names = JSON.parse(decoder.decode(res.data)) as string[];
    for (const name of names) {
      const childPath = path === '/' ? '/' + name : path + '/' + name;
      const childIno = resolveIno(childPath);
      if (childIno !== null) {
        node.entries!.set(name, childIno);
      }
    }
  }

  return {
    exists(path: string): boolean {
      const res = rpcCall('vfsExists', { path });
      return res.errno === 0 && res.intResult === 1;
    },
    mkdir(path: string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', path);
      const res = rpcCall('vfsMkdir', { path });
      if (res.errno !== 0) throw new VfsError('EACCES', path);
    },
    mkdirp(path: string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', path);
      const segments = path.split('/').filter(Boolean);
      let current = '';
      for (const seg of segments) {
        current += '/' + seg;
        const exists = rpcCall('vfsExists', { path: current });
        if (exists.errno === 0 && exists.intResult === 0) {
          rpcCall('vfsMkdir', { path: current });
        }
      }
    },
    writeFile(path: string, data: Uint8Array | string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', path);
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      rpcCall('vfsWriteFile', { path, data: Array.from(bytes) });
    },
    readFile(path: string): Uint8Array {
      // Isolated tier: restrict reads to cwd subtree
      if (permissionTier === 'isolated' && !isPathInCwd(path)) {
        throw new VfsError('EACCES', path);
      }
      const res = rpcCall('vfsReadFile', { path });
      if (res.errno !== 0) throw new VfsError('ENOENT', path);
      return res.data;
    },
    readdir(path: string): string[] {
      if (permissionTier === 'isolated' && !isPathInCwd(path)) {
        throw new VfsError('EACCES', path);
      }
      const res = rpcCall('vfsReaddir', { path });
      if (res.errno !== 0) throw new VfsError('ENOENT', path);
      return JSON.parse(decoder.decode(res.data));
    },
    stat(path: string): VfsStat {
      if (permissionTier === 'isolated' && !isPathInCwd(path)) {
        throw new VfsError('EACCES', path);
      }
      const res = rpcCall('vfsStat', { path });
      if (res.errno !== 0) throw new VfsError('ENOENT', path);
      return JSON.parse(decoder.decode(res.data));
    },
    lstat(path: string): VfsStat {
      return this.stat(path);
    },
    unlink(path: string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', path);
      const res = rpcCall('vfsUnlink', { path });
      if (res.errno !== 0) throw new VfsError('ENOENT', path);
    },
    rmdir(path: string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', path);
      const res = rpcCall('vfsRmdir', { path });
      if (res.errno !== 0) throw new VfsError('ENOENT', path);
    },
    rename(oldPath: string, newPath: string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', oldPath);
      const res = rpcCall('vfsRename', { oldPath, newPath });
      if (res.errno !== 0) throw new VfsError('ENOENT', oldPath);
    },
    symlink(target: string, linkPath: string): void {
      if (isWriteBlocked()) throw new VfsError('EACCES', linkPath);
      const res = rpcCall('vfsSymlink', { target, linkPath });
      if (res.errno !== 0) throw new VfsError('EEXIST', linkPath);
    },
    readlink(path: string): string {
      const res = rpcCall('vfsReadlink', { path });
      if (res.errno !== 0) throw new VfsError('EINVAL', path);
      return decoder.decode(res.data);
    },
    chmod(_path: string, _mode: number): void {
      // No-op — permissions handled by kernel
    },
    getIno(path: string): number | null {
      return resolveIno(path);
    },
    getInodeByIno(ino: number): WasiInode | null {
      const node = inoCache.get(ino);
      if (!node) return null;
      // Lazy-populate directory entries from kernel VFS
      if (node.type === 'dir' && node.entries) {
        populateDirEntries(ino, node);
      }
      return node;
    },
    snapshot(): VfsSnapshotEntry[] {
      return [];
    },
  };
}

// -------------------------------------------------------------------------
// Host process imports — proc_spawn, fd_pipe, proc_kill route through kernel
// -------------------------------------------------------------------------

function createHostProcessImports(getMemory: () => WebAssembly.Memory | null) {
  return {
    /**
     * proc_spawn routes through KernelInterface.spawn() so brush-shell
     * pipeline stages dispatch to the correct runtime driver.
     *
     * Matches Rust FFI: proc_spawn(argv_ptr, argv_len, envp_ptr, envp_len,
     *   stdin_fd, stdout_fd, stderr_fd, cwd_ptr, cwd_len, ret_pid) -> errno
     */
    proc_spawn(
      argv_ptr: number, argv_len: number,
      envp_ptr: number, envp_len: number,
      stdin_fd: number, stdout_fd: number, stderr_fd: number,
      cwd_ptr: number, cwd_len: number,
      ret_pid_ptr: number,
    ): number {
      // Permission check: only 'full' tier allows subprocess spawning
      if (isSpawnBlocked()) return ERRNO_EACCES;

      const mem = getMemory();
      if (!mem) return ERRNO_EINVAL;

      const bytes = new Uint8Array(mem.buffer);
      const decoder = new TextDecoder();

      // Parse null-separated argv buffer — first entry is the command
      const argvRaw = decoder.decode(bytes.slice(argv_ptr, argv_ptr + argv_len));
      const argvParts = argvRaw.split('\0').filter(Boolean);
      const command = argvParts[0] ?? '';
      const args = argvParts.slice(1);

      // Parse null-separated envp buffer (KEY=VALUE\0 pairs)
      const env: Record<string, string> = {};
      if (envp_len > 0) {
        const envpRaw = decoder.decode(bytes.slice(envp_ptr, envp_ptr + envp_len));
        for (const entry of envpRaw.split('\0')) {
          if (!entry) continue;
          const eq = entry.indexOf('=');
          if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
        }
      }

      // Parse cwd
      const cwd = cwd_len > 0
        ? decoder.decode(bytes.slice(cwd_ptr, cwd_ptr + cwd_len))
        : init.cwd;

      // Convert local FDs to kernel FDs for pipe wiring
      const stdinFd = stdin_fd === -1 ? undefined : (localToKernelFd.get(stdin_fd) ?? stdin_fd);
      const stdoutFd = stdout_fd === -1 ? undefined : (localToKernelFd.get(stdout_fd) ?? stdout_fd);
      const stderrFd = stderr_fd === -1 ? undefined : (localToKernelFd.get(stderr_fd) ?? stderr_fd);

      // Route through kernel with FD overrides for pipe wiring
      const res = rpcCall('spawn', {
        command,
        spawnArgs: args,
        env,
        cwd,
        stdinFd,
        stdoutFd,
        stderrFd,
      });

      if (res.errno !== 0) return res.errno;
      new DataView(mem.buffer).setUint32(ret_pid_ptr, res.intResult, true);

      // Close pipe FDs used as stdio overrides in the parent (POSIX close-after-fork)
      // Without this, the parent retains a reference to the pipe ends, preventing EOF.
      for (const localFd of [stdin_fd, stdout_fd, stderr_fd]) {
        if (localFd >= 0 && localToKernelFd.has(localFd)) {
          const kFd = localToKernelFd.get(localFd)!;
          fdTable.close(localFd);
          localToKernelFd.delete(localFd);
          rpcCall('fdClose', { fd: kFd });
        }
      }

      return ERRNO_SUCCESS;
    },

    /**
     * proc_waitpid(pid, options, ret_status) -> errno
     * options: 0 = blocking, 1 = WNOHANG
     */
    proc_waitpid(pid: number, _options: number, ret_status_ptr: number): number {
      const mem = getMemory();
      if (!mem) return ERRNO_EINVAL;

      const res = rpcCall('waitpid', { pid });
      if (res.errno !== 0) return res.errno;

      new DataView(mem.buffer).setUint32(ret_status_ptr, res.intResult, true);
      return ERRNO_SUCCESS;
    },

    /** proc_kill(pid, signal) -> errno */
    proc_kill(pid: number, signal: number): number {
      const res = rpcCall('kill', { pid, signal });
      return res.errno;
    },

    /**
     * fd_pipe(ret_read_fd, ret_write_fd) -> errno
     * Creates a kernel pipe and installs both ends in this process's FD table.
     * Registers pipe FDs in the local FDTable so WASI fd_renumber can find them.
     */
    fd_pipe(ret_read_fd_ptr: number, ret_write_fd_ptr: number): number {
      const mem = getMemory();
      if (!mem) return ERRNO_EINVAL;

      const res = rpcCall('pipe', {});
      if (res.errno !== 0) return res.errno;

      // Read/write FDs packed in intResult: read in low 16 bits, write in high 16 bits
      const kernelReadFd = res.intResult & 0xFFFF;
      const kernelWriteFd = (res.intResult >>> 16) & 0xFFFF;

      // Register pipe FDs in local table as vfsFile — fd_read/fd_write for
      // vfsFile routes through kernel FileIO bridge, which detects pipe FDs
      const localReadFd = fdTable.open(
        { type: 'vfsFile', ino: 0, path: '' },
        { filetype: FILETYPE_CHARACTER_DEVICE },
      );
      const localWriteFd = fdTable.open(
        { type: 'vfsFile', ino: 0, path: '' },
        { filetype: FILETYPE_CHARACTER_DEVICE },
      );
      localToKernelFd.set(localReadFd, kernelReadFd);
      localToKernelFd.set(localWriteFd, kernelWriteFd);

      const view = new DataView(mem.buffer);
      view.setUint32(ret_read_fd_ptr, localReadFd, true);
      view.setUint32(ret_write_fd_ptr, localWriteFd, true);
      return ERRNO_SUCCESS;
    },

    /**
     * fd_dup(fd, ret_new_fd) -> errno
     * Converts local FD to kernel FD, dups in kernel, registers new local FD.
     */
    fd_dup(fd: number, ret_new_fd_ptr: number): number {
      const mem = getMemory();
      if (!mem) return ERRNO_EINVAL;

      const kFd = localToKernelFd.get(fd) ?? fd;
      const res = rpcCall('fdDup', { fd: kFd });
      if (res.errno !== 0) return res.errno;

      const newKernelFd = res.intResult;
      const newLocalFd = fdTable.open(
        { type: 'vfsFile', ino: 0, path: '' },
        { filetype: FILETYPE_CHARACTER_DEVICE },
      );
      localToKernelFd.set(newLocalFd, newKernelFd);

      new DataView(mem.buffer).setUint32(ret_new_fd_ptr, newLocalFd, true);
      return ERRNO_SUCCESS;
    },

    /** proc_getpid(ret_pid) -> errno */
    proc_getpid(ret_pid_ptr: number): number {
      const mem = getMemory();
      if (!mem) return ERRNO_EINVAL;

      new DataView(mem.buffer).setUint32(ret_pid_ptr, init.pid, true);
      return ERRNO_SUCCESS;
    },

    /** sleep_ms(milliseconds) -> errno — blocks via Atomics.wait */
    sleep_ms(milliseconds: number): number {
      const buf = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(buf, 0, 0, milliseconds);
      return ERRNO_SUCCESS;
    },
  };
}

// -------------------------------------------------------------------------
// Main execution
// -------------------------------------------------------------------------

async function main(): Promise<void> {
  let wasmMemory: WebAssembly.Memory | null = null;
  const getMemory = () => wasmMemory;

  const fileIO = createKernelFileIO();
  const processIO = createKernelProcessIO();
  const vfs = createKernelVfs();

  const polyfill = new WasiPolyfill(fdTable, vfs, {
    fileIO,
    processIO,
    args: [init.command, ...init.args],
    env: init.env,
  });

  // Route stdin through kernel pipe when piped
  if (init.stdinFd !== undefined) {
    polyfill.setStdinReader((buf, offset, length) => {
      const res = rpcCall('fdRead', { fd: 0, length });
      if (res.errno !== 0 || res.data.length === 0) return 0; // EOF or error
      const n = Math.min(res.data.length, length);
      buf.set(res.data.subarray(0, n), offset);
      return n;
    });
  }

  // Stream stdout/stderr — route through kernel pipe when FD is overridden,
  // otherwise stream to main thread via postMessage
  if (init.stdoutFd !== undefined && init.stdoutFd !== 1) {
    // Stdout is piped — route writes through kernel fdWrite on FD 1
    polyfill.setStdoutWriter((buf, offset, length) => {
      const data = buf.slice(offset, offset + length);
      rpcCall('fdWrite', { fd: 1, data: Array.from(data) });
      return length;
    });
  } else {
    polyfill.setStdoutWriter((buf, offset, length) => {
      port.postMessage({ type: 'stdout', data: buf.slice(offset, offset + length) });
      return length;
    });
  }
  if (init.stderrFd !== undefined && init.stderrFd !== 2) {
    // Stderr is piped — route writes through kernel fdWrite on FD 2
    polyfill.setStderrWriter((buf, offset, length) => {
      const data = buf.slice(offset, offset + length);
      rpcCall('fdWrite', { fd: 2, data: Array.from(data) });
      return length;
    });
  } else {
    polyfill.setStderrWriter((buf, offset, length) => {
      port.postMessage({ type: 'stderr', data: buf.slice(offset, offset + length) });
      return length;
    });
  }

  const userManager = new UserManager({
    getMemory,
    fdTable,
    ttyFds: init.ttyFds ? new Set(init.ttyFds) : false,
  });

  const hostProcess = createHostProcessImports(getMemory);

  try {
    // Use pre-compiled module from main thread if available, otherwise compile from disk
    const wasmModule = init.wasmModule
      ?? await WebAssembly.compile(await readFile(init.wasmBinaryPath));

    const imports: WebAssembly.Imports = {
      wasi_snapshot_preview1: polyfill.getImports() as WebAssembly.ModuleImports,
      host_user: userManager.getImports() as unknown as WebAssembly.ModuleImports,
      host_process: hostProcess as unknown as WebAssembly.ModuleImports,
    };

    const instance = await WebAssembly.instantiate(wasmModule, imports);
    wasmMemory = instance.exports.memory as WebAssembly.Memory;
    polyfill.setMemory(wasmMemory);

    // Run the command
    const start = instance.exports._start as () => void;
    start();

    // Normal exit — flush collected output, close piped FDs for EOF
    flushOutput(polyfill);
    closePipedFds();
    port.postMessage({ type: 'exit', code: 0 });
  } catch (err) {
    if (err instanceof WasiProcExit) {
      flushOutput(polyfill);
      closePipedFds();
      port.postMessage({ type: 'exit', code: err.exitCode });
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      port.postMessage({ type: 'stderr', data: new TextEncoder().encode(errMsg + '\n') });
      closePipedFds();
      port.postMessage({ type: 'exit', code: 1 });
    }
  }
}

/** Close piped stdio FDs so readers get EOF. */
function closePipedFds(): void {
  if (init.stdoutFd !== undefined && init.stdoutFd !== 1) {
    rpcCall('fdClose', { fd: 1 });
  }
  if (init.stderrFd !== undefined && init.stderrFd !== 2) {
    rpcCall('fdClose', { fd: 2 });
  }
}

/** Flush any remaining collected output (not caught by streaming writers). */
function flushOutput(polyfill: WasiPolyfill): void {
  const stdout = polyfill.stdout;
  if (stdout.length > 0) port.postMessage({ type: 'stdout', data: stdout });
  const stderr = polyfill.stderr;
  if (stderr.length > 0) port.postMessage({ type: 'stderr', data: stderr });
}

main().catch((err) => {
  const errMsg = err instanceof Error ? err.message : String(err);
  port.postMessage({ type: 'stderr', data: new TextEncoder().encode(errMsg + '\n') });
  port.postMessage({ type: 'exit', code: 1 });
});
