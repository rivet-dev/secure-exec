/**
 * File I/O bridge for WASI polyfill kernel delegation.
 *
 * Abstracts file data access so the polyfill does not directly touch
 * VFS inodes. In standalone mode the bridge wraps VFS + FDTable;
 * when mounted in the kernel it wraps KernelInterface with a bound pid.
 */

import type { FDTable, FDEntry } from './fd-table.ts';
import { FILETYPE_REGULAR_FILE, FILETYPE_DIRECTORY, FILETYPE_CHARACTER_DEVICE, FILETYPE_SYMBOLIC_LINK,
  FDFLAG_APPEND, ERRNO_SUCCESS, ERRNO_EBADF } from './fd-table.ts';
import type { VFS } from './vfs.ts';
import { VfsError } from './vfs.ts';
import type { VfsErrorCode } from './vfs.ts';

// WASI errno codes used by the bridge
const ERRNO_ESPIPE = 70;
const ERRNO_EISDIR = 31;
const ERRNO_ENOENT = 44;
const ERRNO_EEXIST = 20;
const ERRNO_ENOTDIR = 54;
const ERRNO_EINVAL = 28;
const ERRNO_EIO = 29;

// WASI seek whence
const WHENCE_SET = 0;
const WHENCE_CUR = 1;
const WHENCE_END = 2;

// WASI open flags
const OFLAG_CREAT = 1;
const OFLAG_DIRECTORY = 2;
const OFLAG_EXCL = 4;
const OFLAG_TRUNC = 8;

// WASI lookup flags
const LOOKUP_SYMLINK_FOLLOW = 1;

const ERRNO_MAP: Record<VfsErrorCode, number> = {
  ENOENT: 44, EEXIST: 20, ENOTDIR: 54, EISDIR: 31,
  ENOTEMPTY: 55, EACCES: 2, EBADF: 8, EINVAL: 28, EPERM: 63,
};

function vfsErrorToErrno(e: unknown): number {
  if (e instanceof VfsError) return ERRNO_MAP[e.code] ?? ERRNO_EIO;
  return ERRNO_EIO;
}

/**
 * Synchronous file I/O interface for the WASI polyfill.
 *
 * Method signatures are designed to map cleanly to KernelInterface
 * fdRead/fdWrite/fdOpen/fdSeek/fdClose when the kernel is connected.
 */
export interface WasiFileIO {
  /** Read up to maxBytes from fd at current cursor. Advances cursor. */
  fdRead(fd: number, maxBytes: number): { errno: number; data: Uint8Array };

  /** Write data to fd at current cursor (or end if append). Advances cursor. */
  fdWrite(fd: number, data: Uint8Array): { errno: number; written: number };

  /** Open file at resolved path. Handles CREAT/EXCL/TRUNC/DIRECTORY. */
  fdOpen(
    path: string, dirflags: number, oflags: number, fdflags: number,
    rightsBase: bigint, rightsInheriting: bigint,
  ): { errno: number; fd: number; filetype: number };

  /** Seek within fd. Returns new cursor position. */
  fdSeek(fd: number, offset: bigint, whence: number): { errno: number; newOffset: bigint };

  /** Close fd. */
  fdClose(fd: number): number;

  /** Positional read (no cursor change). */
  fdPread(fd: number, maxBytes: number, offset: bigint): { errno: number; data: Uint8Array };

  /** Positional write (no cursor change). */
  fdPwrite(fd: number, data: Uint8Array, offset: bigint): { errno: number; written: number };
}

// VFS inode type
type VfsInode = NonNullable<ReturnType<VFS['getInodeByIno']>>;

function inodeTypeToFiletype(type: string): number {
  switch (type) {
    case 'file': return FILETYPE_REGULAR_FILE;
    case 'dir': return FILETYPE_DIRECTORY;
    case 'symlink': return FILETYPE_SYMBOLIC_LINK;
    case 'dev': return FILETYPE_CHARACTER_DEVICE;
    default: return 0;
  }
}

/**
 * Create a standalone file I/O bridge that wraps VFS + FDTable.
 * Moves vfsFile read/write/seek/open/close logic out of the polyfill.
 */
export function createStandaloneFileIO(fdTable: FDTable, vfs: VFS): WasiFileIO {
  return {
    fdRead(fd, maxBytes) {
      const entry = fdTable.get(fd);
      if (!entry) return { errno: ERRNO_EBADF, data: new Uint8Array(0) };
      if (entry.resource.type !== 'vfsFile') return { errno: ERRNO_EBADF, data: new Uint8Array(0) };

      const node = vfs.getInodeByIno(entry.resource.ino);
      if (!node) return { errno: ERRNO_EBADF, data: new Uint8Array(0) };
      if (node.type === 'dir') return { errno: ERRNO_EISDIR, data: new Uint8Array(0) };
      if (node.type === 'dev') return { errno: ERRNO_SUCCESS, data: new Uint8Array(0) };
      if (node.type !== 'file') return { errno: ERRNO_EBADF, data: new Uint8Array(0) };

      const pos = Number(entry.cursor);
      const data = node.data!;
      const available = data.length - pos;
      if (available <= 0) return { errno: ERRNO_SUCCESS, data: new Uint8Array(0) };

      const n = Math.min(maxBytes, available);
      const result = data.subarray(pos, pos + n);
      entry.cursor = BigInt(pos + n);
      node.atime = Date.now();
      return { errno: ERRNO_SUCCESS, data: result };
    },

    fdWrite(fd, writeData) {
      const entry = fdTable.get(fd);
      if (!entry) return { errno: ERRNO_EBADF, written: 0 };
      if (entry.resource.type !== 'vfsFile') return { errno: ERRNO_EBADF, written: 0 };

      const node = vfs.getInodeByIno(entry.resource.ino);
      if (!node) return { errno: ERRNO_EBADF, written: 0 };
      if (node.type === 'dir') return { errno: ERRNO_EISDIR, written: 0 };
      if (node.type === 'dev') return { errno: ERRNO_SUCCESS, written: writeData.length };
      if (node.type !== 'file') return { errno: ERRNO_EBADF, written: 0 };

      const pos = (entry.fdflags & FDFLAG_APPEND) ? node.data!.length : Number(entry.cursor);
      const endPos = pos + writeData.length;

      if (endPos > node.data!.length) {
        const newData = new Uint8Array(endPos);
        newData.set(node.data!);
        node.data = newData;
      }

      node.data!.set(writeData, pos);
      entry.cursor = BigInt(endPos);
      node.mtime = Date.now();
      return { errno: ERRNO_SUCCESS, written: writeData.length };
    },

    fdOpen(path, dirflags, oflags, fdflags, rightsBase, rightsInheriting) {
      const followSymlinks = !!(dirflags & LOOKUP_SYMLINK_FOLLOW);
      let ino = vfs.getIno(path, followSymlinks);

      if (ino === null) {
        if (!(oflags & OFLAG_CREAT)) return { errno: ERRNO_ENOENT, fd: -1, filetype: 0 };
        try {
          vfs.writeFile(path, new Uint8Array(0));
        } catch (e) {
          return { errno: vfsErrorToErrno(e), fd: -1, filetype: 0 };
        }
        ino = vfs.getIno(path, true);
        if (ino === null) return { errno: ERRNO_ENOENT, fd: -1, filetype: 0 };
      } else {
        if ((oflags & OFLAG_CREAT) && (oflags & OFLAG_EXCL)) {
          return { errno: ERRNO_EEXIST, fd: -1, filetype: 0 };
        }
      }

      const node = vfs.getInodeByIno(ino);
      if (!node) return { errno: ERRNO_ENOENT, fd: -1, filetype: 0 };

      if ((oflags & OFLAG_DIRECTORY) && node.type !== 'dir') {
        return { errno: ERRNO_ENOTDIR, fd: -1, filetype: 0 };
      }

      if ((oflags & OFLAG_TRUNC) && node.type === 'file') {
        node.data = new Uint8Array(0);
        node.mtime = Date.now();
      }

      const filetype = inodeTypeToFiletype(node.type);
      const fd = fdTable.open(
        { type: 'vfsFile', ino, path },
        { filetype, rightsBase, rightsInheriting, fdflags, path },
      );

      return { errno: ERRNO_SUCCESS, fd, filetype };
    },

    fdSeek(fd, offset, whence) {
      const entry = fdTable.get(fd);
      if (!entry) return { errno: ERRNO_EBADF, newOffset: 0n };
      if (entry.filetype !== FILETYPE_REGULAR_FILE) return { errno: ERRNO_ESPIPE, newOffset: 0n };

      let newPos: bigint;
      switch (whence) {
        case WHENCE_SET:
          newPos = offset;
          break;
        case WHENCE_CUR:
          newPos = entry.cursor + offset;
          break;
        case WHENCE_END: {
          if (!entry.resource || entry.resource.type !== 'vfsFile') return { errno: ERRNO_EINVAL, newOffset: 0n };
          const node = vfs.getInodeByIno(entry.resource.ino);
          if (!node || node.type !== 'file') return { errno: ERRNO_EINVAL, newOffset: 0n };
          newPos = BigInt(node.data!.length) + offset;
          break;
        }
        default:
          return { errno: ERRNO_EINVAL, newOffset: 0n };
      }

      if (newPos < 0n) return { errno: ERRNO_EINVAL, newOffset: 0n };

      entry.cursor = newPos;
      return { errno: ERRNO_SUCCESS, newOffset: newPos };
    },

    fdClose(fd) {
      return fdTable.close(fd);
    },

    fdPread(fd, maxBytes, offset) {
      const entry = fdTable.get(fd);
      if (!entry) return { errno: ERRNO_EBADF, data: new Uint8Array(0) };
      if (entry.resource.type !== 'vfsFile') return { errno: ERRNO_EBADF, data: new Uint8Array(0) };

      const node = vfs.getInodeByIno(entry.resource.ino);
      if (!node || node.type !== 'file') return { errno: ERRNO_EBADF, data: new Uint8Array(0) };

      const pos = Number(offset);
      const available = node.data!.length - pos;
      if (available <= 0) return { errno: ERRNO_SUCCESS, data: new Uint8Array(0) };

      const n = Math.min(maxBytes, available);
      const result = node.data!.subarray(pos, pos + n);
      return { errno: ERRNO_SUCCESS, data: result };
    },

    fdPwrite(fd, writeData, offset) {
      const entry = fdTable.get(fd);
      if (!entry) return { errno: ERRNO_EBADF, written: 0 };
      if (entry.resource.type !== 'vfsFile') return { errno: ERRNO_EBADF, written: 0 };

      const node = vfs.getInodeByIno(entry.resource.ino);
      if (!node || node.type !== 'file') return { errno: ERRNO_EBADF, written: 0 };

      const pos = Number(offset);
      const endPos = pos + writeData.length;
      if (endPos > node.data!.length) {
        const newData = new Uint8Array(endPos);
        newData.set(node.data!);
        node.data = newData;
      }
      node.data!.set(writeData, pos);
      node.mtime = Date.now();
      return { errno: ERRNO_SUCCESS, written: writeData.length };
    },
  };
}
