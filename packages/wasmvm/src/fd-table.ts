/**
 * WASI file descriptor table.
 *
 * Manages open file descriptors, pre-allocating FDs 0/1/2 for stdin/stdout/stderr.
 * Used by kernel-worker.ts for per-command FD tracking.
 */

import {
  FILETYPE_CHARACTER_DEVICE,
  FILETYPE_DIRECTORY,
  FILETYPE_REGULAR_FILE,
  RIGHTS_STDIO,
  RIGHTS_FILE_ALL,
  RIGHTS_DIR_ALL,
  ERRNO_SUCCESS,
  ERRNO_EBADF,
} from './wasi-constants.js';

import {
  FDEntry,
  FileDescription,
} from './wasi-types.js';

import type {
  WasiFDTable,
  FDResource,
  FDOpenOptions,
} from './wasi-types.js';

// ---------------------------------------------------------------------------
// FDTable
// ---------------------------------------------------------------------------

export class FDTable implements WasiFDTable {
  private _fds: Map<number, FDEntry>;
  private _nextFd: number;
  private _freeFds: number[];

  constructor() {
    this._fds = new Map();
    this._nextFd = 3; // 0, 1, 2 are reserved
    this._freeFds = [];

    // Pre-allocate stdio fds
    this._fds.set(0, new FDEntry(
      { type: 'stdio', name: 'stdin' },
      FILETYPE_CHARACTER_DEVICE,
      RIGHTS_STDIO,
      0n,
      0
    ));
    this._fds.set(1, new FDEntry(
      { type: 'stdio', name: 'stdout' },
      FILETYPE_CHARACTER_DEVICE,
      RIGHTS_STDIO,
      0n,
      0
    ));
    this._fds.set(2, new FDEntry(
      { type: 'stdio', name: 'stderr' },
      FILETYPE_CHARACTER_DEVICE,
      RIGHTS_STDIO,
      0n,
      0
    ));
  }

  /**
   * Allocate the lowest available file descriptor number (POSIX semantics).
   * Reuses previously freed FDs before incrementing _nextFd.
   * _freeFds is kept sorted descending so pop() returns the lowest.
   */
  private _allocateFd(): number {
    if (this._freeFds.length > 0) {
      return this._freeFds.pop()!;
    }
    return this._nextFd++;
  }

  /**
   * Open a new file descriptor for a resource.
   */
  open(resource: FDResource, options: FDOpenOptions = {}): number {
    const {
      filetype = FILETYPE_REGULAR_FILE,
      rightsBase = (filetype === FILETYPE_DIRECTORY ? RIGHTS_DIR_ALL : RIGHTS_FILE_ALL),
      rightsInheriting = (filetype === FILETYPE_DIRECTORY ? RIGHTS_FILE_ALL : 0n),
      fdflags = 0,
      path,
    } = options;

    const inode = (resource as { ino?: number }).ino ?? 0;
    const fileDesc = new FileDescription(inode, fdflags);
    const fd = this._allocateFd();
    this._fds.set(fd, new FDEntry(resource, filetype, rightsBase, rightsInheriting, fdflags, path, fileDesc));
    return fd;
  }

  /**
   * Close a file descriptor.
   *
   * Returns WASI errno (0 = success, 8 = EBADF).
   */
  close(fd: number): number {
    const entry = this._fds.get(fd);
    if (!entry) {
      return ERRNO_EBADF;
    }
    entry.fileDescription.refCount--;
    this._fds.delete(fd);
    // Reclaim FD for reuse (sorted descending so pop gives lowest-available per POSIX)
    this._freeFds.push(fd);
    this._freeFds.sort((a, b) => b - a);
    return ERRNO_SUCCESS;
  }

  /**
   * Get the entry for a file descriptor.
   */
  get(fd: number): FDEntry | null {
    return this._fds.get(fd) ?? null;
  }

  /**
   * Duplicate a file descriptor to lowest available fd >= minFd (F_DUPFD).
   * Returns the new fd number, or -1 if the source fd is invalid.
   */
  dupMinFd(fd: number, minFd: number): number {
    const entry = this._fds.get(fd);
    if (!entry) return -1;

    entry.fileDescription.refCount++;
    let newFd = minFd;
    while (this._fds.has(newFd)) newFd++;

    this._fds.set(newFd, new FDEntry(
      entry.resource,
      entry.filetype,
      entry.rightsBase,
      entry.rightsInheriting,
      entry.fdflags,
      entry.path ?? undefined,
      entry.fileDescription,
    ));

    if (newFd >= this._nextFd) {
      this._nextFd = newFd + 1;
    }
    return newFd;
  }

  /**
   * Duplicate a file descriptor, returning a new fd pointing to the same resource.
   *
   * Returns the new fd number, or -1 if the source fd is invalid.
   */
  dup(fd: number): number {
    const entry = this._fds.get(fd);
    if (!entry) {
      return -1;
    }
    entry.fileDescription.refCount++;
    const newFd = this._allocateFd();
    this._fds.set(newFd, new FDEntry(
      entry.resource,
      entry.filetype,
      entry.rightsBase,
      entry.rightsInheriting,
      entry.fdflags,
      entry.path ?? undefined,
      entry.fileDescription,
    ));
    return newFd;
  }

  /**
   * Duplicate a file descriptor to a specific fd number.
   * If newFd is already open, it is closed first.
   *
   * Returns WASI errno (0 = success, 8 = EBADF if oldFd invalid, 28 = EINVAL if same fd).
   */
  dup2(oldFd: number, newFd: number): number {
    if (oldFd === newFd) {
      // If they're the same and oldFd is valid, it's a no-op
      if (this._fds.has(oldFd)) {
        return ERRNO_SUCCESS;
      }
      return ERRNO_EBADF;
    }

    const entry = this._fds.get(oldFd);
    if (!entry) {
      return ERRNO_EBADF;
    }

    // Close newFd if it's open (decrement its FileDescription refCount)
    const existing = this._fds.get(newFd);
    if (existing) {
      existing.fileDescription.refCount--;
    }
    this._fds.delete(newFd);

    entry.fileDescription.refCount++;
    this._fds.set(newFd, new FDEntry(
      entry.resource,
      entry.filetype,
      entry.rightsBase,
      entry.rightsInheriting,
      entry.fdflags,
      entry.path ?? undefined,
      entry.fileDescription,
    ));

    // Keep _nextFd above all allocated fds
    if (newFd >= this._nextFd) {
      this._nextFd = newFd + 1;
    }

    return ERRNO_SUCCESS;
  }

  /**
   * Check if a file descriptor is open.
   */
  has(fd: number): boolean {
    return this._fds.has(fd);
  }

  /**
   * Get the number of open file descriptors.
   */
  get size(): number {
    return this._fds.size;
  }

  /**
   * Renumber a file descriptor (move oldFd to newFd, closing newFd if open).
   *
   * Returns WASI errno.
   */
  renumber(oldFd: number, newFd: number): number {
    if (oldFd === newFd) {
      return this._fds.has(oldFd) ? ERRNO_SUCCESS : ERRNO_EBADF;
    }
    const entry = this._fds.get(oldFd);
    if (!entry) {
      return ERRNO_EBADF;
    }
    // Close newFd if open
    this._fds.delete(newFd);
    // Move oldFd to newFd
    this._fds.set(newFd, entry);
    this._fds.delete(oldFd);

    if (newFd >= this._nextFd) {
      this._nextFd = newFd + 1;
    }
    return ERRNO_SUCCESS;
  }
}
