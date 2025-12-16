// fs polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js fs API compatibility
// It communicates with the host via the _fs Reference object

import { Buffer } from "buffer";
import type * as nodeFs from "fs";

// Declare globals that are set up by the host environment
declare const _fs: {
  readFile: { applySyncPromise: (ctx: undefined, args: [string]) => string };
  writeFile: { applySync: (ctx: undefined, args: [string, string]) => void };
  readDir: { applySyncPromise: (ctx: undefined, args: [string]) => string };
  mkdir: { applySync: (ctx: undefined, args: [string, boolean]) => void };
  rmdir: { applySyncPromise: (ctx: undefined, args: [string]) => void };
  exists: { applySyncPromise: (ctx: undefined, args: [string]) => boolean };
  stat: { applySyncPromise: (ctx: undefined, args: [string]) => string };
  unlink: { applySyncPromise: (ctx: undefined, args: [string]) => void };
  rename: { applySyncPromise: (ctx: undefined, args: [string, string]) => void };
};

// File descriptor table
const fdTable = new Map<number, { path: string; flags: number; position: number }>();
let nextFd = 3;

// Stats class
class Stats implements nodeFs.Stats {
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  blksize: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;

  constructor(init: {
    dev?: number;
    ino?: number;
    mode: number;
    nlink?: number;
    uid?: number;
    gid?: number;
    rdev?: number;
    size: number;
    blksize?: number;
    blocks?: number;
    atimeMs?: number;
    mtimeMs?: number;
    ctimeMs?: number;
    birthtimeMs?: number;
  }) {
    this.dev = init.dev ?? 0;
    this.ino = init.ino ?? 0;
    this.mode = init.mode;
    this.nlink = init.nlink ?? 1;
    this.uid = init.uid ?? 0;
    this.gid = init.gid ?? 0;
    this.rdev = init.rdev ?? 0;
    this.size = init.size;
    this.blksize = init.blksize ?? 4096;
    this.blocks = init.blocks ?? Math.ceil(init.size / 512);
    this.atimeMs = init.atimeMs ?? Date.now();
    this.mtimeMs = init.mtimeMs ?? Date.now();
    this.ctimeMs = init.ctimeMs ?? Date.now();
    this.birthtimeMs = init.birthtimeMs ?? Date.now();
    this.atime = new Date(this.atimeMs);
    this.mtime = new Date(this.mtimeMs);
    this.ctime = new Date(this.ctimeMs);
    this.birthtime = new Date(this.birthtimeMs);
  }

  isFile(): boolean {
    return (this.mode & 61440) === 32768;
  }
  isDirectory(): boolean {
    return (this.mode & 61440) === 16384;
  }
  isSymbolicLink(): boolean {
    return (this.mode & 61440) === 40960;
  }
  isBlockDevice(): boolean {
    return false;
  }
  isCharacterDevice(): boolean {
    return false;
  }
  isFIFO(): boolean {
    return false;
  }
  isSocket(): boolean {
    return false;
  }
}

// Dirent class for readdir with withFileTypes
class Dirent implements nodeFs.Dirent<string> {
  name: string;
  parentPath: string;
  path: string; // Deprecated alias for parentPath
  private _isDir: boolean;

  constructor(name: string, isDir: boolean, parentPath: string = "") {
    this.name = name;
    this._isDir = isDir;
    this.parentPath = parentPath;
    this.path = parentPath;
  }

  isFile(): boolean {
    return !this._isDir;
  }
  isDirectory(): boolean {
    return this._isDir;
  }
  isSymbolicLink(): boolean {
    return false;
  }
  isBlockDevice(): boolean {
    return false;
  }
  isCharacterDevice(): boolean {
    return false;
  }
  isFIFO(): boolean {
    return false;
  }
  isSocket(): boolean {
    return false;
  }
}

// Parse flags string to number
function parseFlags(flags: OpenMode): number {
  if (typeof flags === "number") return flags;
  const flagMap: Record<string, number> = {
    r: 0,
    "r+": 2,
    w: 577,
    "w+": 578,
    a: 1089,
    "a+": 1090,
    wx: 705,
    xw: 705,
    "wx+": 706,
    "xw+": 706,
    ax: 1217,
    xa: 1217,
    "ax+": 1218,
    "xa+": 1218,
  };
  if (flags in flagMap) return flagMap[flags];
  throw new Error("Unknown file flag: " + flags);
}

// Check if flags allow reading
function canRead(flags: number): boolean {
  const mode = flags & 3;
  return mode === 0 || mode === 2;
}

// Check if flags allow writing
function canWrite(flags: number): boolean {
  const mode = flags & 3;
  return mode === 1 || mode === 2;
}

// Helper to create fs errors
function createFsError(
  code: string,
  message: string,
  syscall: string,
  path?: string
): Error & { code: string; errno: number; syscall: string; path?: string } {
  const err = new Error(message) as Error & {
    code: string;
    errno: number;
    syscall: string;
    path?: string;
  };
  err.code = code;
  err.errno = code === "ENOENT" ? -2 : code === "EBADF" ? -9 : -1;
  err.syscall = syscall;
  if (path) err.path = path;
  return err;
}

// Type definitions for the fs module - use Node.js types
type PathLike = nodeFs.PathLike;
type PathOrFileDescriptor = nodeFs.PathOrFileDescriptor;
type OpenMode = nodeFs.OpenMode;
type Mode = nodeFs.Mode;
type Encoding = BufferEncoding | null;
type ReadFileOptions = Parameters<typeof nodeFs.readFileSync>[1];
type WriteFileOptions = nodeFs.WriteFileOptions;
type MakeDirectoryOptions = nodeFs.MakeDirectoryOptions;
type RmDirOptions = nodeFs.RmDirOptions;
type ReaddirOptions = nodeFs.ObjectEncodingOptions & { withFileTypes?: boolean; recursive?: boolean };
type MkdirOptions = MakeDirectoryOptions;
type OpenFlags = nodeFs.OpenMode;
type NodeCallback<T> = (err: NodeJS.ErrnoException | null, result?: T) => void;

// Helper to convert PathLike to string
function toPathString(path: PathLike): string {
  if (typeof path === "string") return path;
  if (Buffer.isBuffer(path)) return path.toString("utf8");
  if (path instanceof URL) return path.pathname;
  return String(path);
}

// The fs module implementation
const fs = {
  // Constants
  constants: {
    // File Access Constants
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    // File Copy Constants
    COPYFILE_EXCL: 1,
    COPYFILE_FICLONE: 2,
    COPYFILE_FICLONE_FORCE: 4,
    // File Open Constants
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_NOCTTY: 256,
    O_TRUNC: 512,
    O_APPEND: 1024,
    O_DIRECTORY: 65536,
    O_NOATIME: 262144,
    O_NOFOLLOW: 131072,
    O_SYNC: 1052672,
    O_DSYNC: 4096,
    O_SYMLINK: 2097152,
    O_DIRECT: 16384,
    O_NONBLOCK: 2048,
    // File Type Constants
    S_IFMT: 61440,
    S_IFREG: 32768,
    S_IFDIR: 16384,
    S_IFCHR: 8192,
    S_IFBLK: 24576,
    S_IFIFO: 4096,
    S_IFLNK: 40960,
    S_IFSOCK: 49152,
    // File Mode Constants
    S_IRWXU: 448,
    S_IRUSR: 256,
    S_IWUSR: 128,
    S_IXUSR: 64,
    S_IRWXG: 56,
    S_IRGRP: 32,
    S_IWGRP: 16,
    S_IXGRP: 8,
    S_IRWXO: 7,
    S_IROTH: 4,
    S_IWOTH: 2,
    S_IXOTH: 1,
    UV_FS_O_FILEMAP: 536870912,
  },

  Stats,
  Dirent,

  // Sync methods

  readFileSync(path: PathOrFileDescriptor, options?: ReadFileOptions): string | Buffer {
    const pathStr = typeof path === "number" ? fdTable.get(path)?.path : toPathString(path);
    if (!pathStr) throw createFsError("EBADF", "EBADF: bad file descriptor", "read");
    const encoding =
      typeof options === "string" ? options : (options as { encoding?: BufferEncoding | null })?.encoding;
    let content: string;
    try {
      content = _fs.readFile.applySyncPromise(undefined, [pathStr]);
    } catch (err) {
      // Convert "entry not found" and similar errors to proper ENOENT
      const errMsg = (err as Error).message || String(err);
      if (errMsg.includes("entry not found") || errMsg.includes("not found")) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, read '${pathStr}'`,
          "read",
          pathStr
        );
      }
      throw err;
    }
    if (encoding) return content;
    // Return Buffer if no encoding specified
    return Buffer.from(content);
  },

  writeFileSync(
    file: PathOrFileDescriptor,
    data: string | NodeJS.ArrayBufferView,
    _options?: WriteFileOptions
  ): void {
    const pathStr = typeof file === "number" ? fdTable.get(file)?.path : toPathString(file);
    if (!pathStr) throw createFsError("EBADF", "EBADF: bad file descriptor", "write");
    const content =
      typeof data === "string"
        ? data
        : ArrayBuffer.isView(data)
          ? new TextDecoder().decode(data)
          : String(data);
    _fs.writeFile.applySync(undefined, [pathStr, content]);
  },

  appendFileSync(
    path: PathOrFileDescriptor,
    data: string | Uint8Array,
    options?: WriteFileOptions
  ): void {
    const existing = fs.existsSync(path as PathLike)
      ? (fs.readFileSync(path, "utf8") as string)
      : "";
    const content = typeof data === "string" ? data : String(data);
    fs.writeFileSync(path, existing + content, options);
  },

  readdirSync(path: PathLike, options?: nodeFs.ObjectEncodingOptions & { withFileTypes?: boolean; recursive?: boolean }): string[] | Dirent[] {
    const pathStr = toPathString(path);
    let entriesJson: string;
    try {
      entriesJson = _fs.readDir.applySyncPromise(undefined, [pathStr]);
    } catch (err) {
      // Convert "entry not found" and similar errors to proper ENOENT
      const errMsg = (err as Error).message || String(err);
      if (errMsg.includes("entry not found") || errMsg.includes("not found")) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, scandir '${pathStr}'`,
          "scandir",
          pathStr
        );
      }
      throw err;
    }
    const entries = JSON.parse(entriesJson) as Array<{
      name: string;
      isDirectory: boolean;
    }>;
    if (options?.withFileTypes) {
      return entries.map((e) => new Dirent(e.name, e.isDirectory, pathStr));
    }
    return entries.map((e) => e.name);
  },

  mkdirSync(path: PathLike, options?: MakeDirectoryOptions | Mode): string | undefined {
    const recursive = typeof options === "object" ? options?.recursive ?? false : false;
    _fs.mkdir.applySync(undefined, [toPathString(path), recursive]);
    return recursive ? toPathString(path) : undefined;
  },

  rmdirSync(path: PathLike, _options?: RmDirOptions): void {
    _fs.rmdir.applySyncPromise(undefined, [toPathString(path)]);
  },

  existsSync(path: PathLike): boolean {
    return _fs.exists.applySyncPromise(undefined, [toPathString(path)]);
  },

  statSync(path: PathLike, _options?: nodeFs.StatSyncOptions): Stats {
    const pathStr = toPathString(path);
    let statJson: string;
    try {
      statJson = _fs.stat.applySyncPromise(undefined, [pathStr]);
    } catch (err) {
      // Convert various "not found" errors to proper ENOENT
      const errMsg = (err as Error).message || String(err);
      if (
        errMsg.includes("entry not found") ||
        errMsg.includes("not found") ||
        errMsg.includes("ENOENT") ||
        errMsg.includes("no such file or directory")
      ) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, stat '${pathStr}'`,
          "stat",
          pathStr
        );
      }
      throw err;
    }
    const stat = JSON.parse(statJson) as {
      mode: number;
      size: number;
      atimeMs?: number;
      mtimeMs?: number;
      ctimeMs?: number;
      birthtimeMs?: number;
    };
    return new Stats(stat);
  },

  lstatSync(path: PathLike, _options?: nodeFs.StatSyncOptions): Stats {
    // In our virtual fs, lstat is the same as stat (no symlinks)
    return fs.statSync(path);
  },

  unlinkSync(path: PathLike): void {
    _fs.unlink.applySyncPromise(undefined, [toPathString(path)]);
  },

  renameSync(oldPath: PathLike, newPath: PathLike): void {
    _fs.rename.applySyncPromise(undefined, [toPathString(oldPath), toPathString(newPath)]);
  },

  copyFileSync(src: PathLike, dest: PathLike, _mode?: number): void {
    const content = fs.readFileSync(src);
    fs.writeFileSync(dest, content as Buffer);
  },

  // File descriptor methods

  openSync(path: PathLike, flags: OpenMode, _mode?: Mode | null): number {
    const pathStr = toPathString(path);
    const numFlags = parseFlags(flags);
    const fd = nextFd++;

    // Check if file exists
    const exists = fs.existsSync(path);

    // Handle O_CREAT - create file if it doesn't exist
    if (numFlags & 64 && !exists) {
      fs.writeFileSync(path, "");
    } else if (!exists && !(numFlags & 64)) {
      throw createFsError(
        "ENOENT",
        `ENOENT: no such file or directory, open '${pathStr}'`,
        "open",
        pathStr
      );
    }

    // Handle O_TRUNC - truncate file
    if (numFlags & 512 && exists) {
      fs.writeFileSync(path, "");
    }

    fdTable.set(fd, { path: pathStr, flags: numFlags, position: 0 });
    return fd;
  },

  closeSync(fd: number): void {
    if (!fdTable.has(fd)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, close", "close");
    }
    fdTable.delete(fd);
  },

  readSync(
    fd: number,
    buffer: NodeJS.ArrayBufferView,
    offset?: number | null,
    length?: number | null,
    position?: nodeFs.ReadPosition | null
  ): number {
    const entry = fdTable.get(fd);
    if (!entry) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, read", "read");
    }
    if (!canRead(entry.flags)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, read", "read");
    }

    const content = fs.readFileSync(entry.path, "utf8") as string;
    const readOffset = offset ?? 0;
    const readLength = length ?? (buffer.byteLength - readOffset);
    const pos = position !== null && position !== undefined ? Number(position) : entry.position;
    const toRead = content.slice(pos, pos + readLength);
    const bytes = Buffer.from(toRead);
    const targetBuffer = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    for (let i = 0; i < bytes.length && i < readLength; i++) {
      targetBuffer[readOffset + i] = bytes[i];
    }

    if (position === null || position === undefined) {
      entry.position += bytes.length;
    }

    return bytes.length;
  },

  writeSync(
    fd: number,
    buffer: string | NodeJS.ArrayBufferView,
    offsetOrPosition?: number | null,
    lengthOrEncoding?: number | BufferEncoding | null,
    position?: number | null
  ): number {
    const entry = fdTable.get(fd);
    if (!entry) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, write", "write");
    }
    if (!canWrite(entry.flags)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, write", "write");
    }

    // Handle string or buffer
    let data: string;
    let writePosition: number | null | undefined;

    if (typeof buffer === "string") {
      data = buffer;
      writePosition = offsetOrPosition;
    } else {
      const offset = offsetOrPosition ?? 0;
      const length = (typeof lengthOrEncoding === "number" ? lengthOrEncoding : null) ?? (buffer.byteLength - offset);
      const view = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, length);
      data = new TextDecoder().decode(view);
      writePosition = position;
    }

    // Read existing content
    let content = "";
    if (fs.existsSync(entry.path)) {
      content = fs.readFileSync(entry.path, "utf8") as string;
    }

    // Determine write position
    let writePos: number;
    if (entry.flags & 1024) {
      // O_APPEND
      writePos = content.length;
    } else if (writePosition !== null && writePosition !== undefined) {
      writePos = writePosition;
    } else {
      writePos = entry.position;
    }

    // Pad with nulls if writing past end
    while (content.length < writePos) {
      content += "\0";
    }

    // Write data
    const newContent =
      content.slice(0, writePos) + data + content.slice(writePos + data.length);
    fs.writeFileSync(entry.path, newContent);

    // Update position if not using explicit position
    if (writePosition === null || writePosition === undefined) {
      entry.position = writePos + data.length;
    }

    return data.length;
  },

  fstatSync(fd: number): Stats {
    const entry = fdTable.get(fd);
    if (!entry) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, fstat", "fstat");
    }
    return fs.statSync(entry.path);
  },

  ftruncateSync(fd: number, len?: number): void {
    const entry = fdTable.get(fd);
    if (!entry) {
      throw createFsError(
        "EBADF",
        "EBADF: bad file descriptor, ftruncate",
        "ftruncate"
      );
    }
    const content = fs.existsSync(entry.path)
      ? (fs.readFileSync(entry.path, "utf8") as string)
      : "";
    const newLen = len ?? 0;
    if (content.length > newLen) {
      fs.writeFileSync(entry.path, content.slice(0, newLen));
    } else {
      let padded = content;
      while (padded.length < newLen) padded += "\0";
      fs.writeFileSync(entry.path, padded);
    }
  },

  // Async methods - wrap sync methods in callbacks/promises

  readFile(
    path: string,
    options?: ReadFileOptions | NodeCallback<string | Uint8Array>,
    callback?: NodeCallback<string | Uint8Array>
  ): Promise<string | Uint8Array> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.readFileSync(path, options));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.readFileSync(path, options as ReadFileOptions));
    }
  },

  writeFile(
    path: string,
    data: string | Uint8Array,
    options?: WriteFileOptions | NodeCallback<void>,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        fs.writeFileSync(path, data, options);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(
        fs.writeFileSync(path, data, options as WriteFileOptions)
      );
    }
  },

  appendFile(
    path: string,
    data: string | Uint8Array,
    options?: WriteFileOptions | NodeCallback<void>,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        fs.appendFileSync(path, data, options);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(
        fs.appendFileSync(path, data, options as WriteFileOptions)
      );
    }
  },

  readdir(
    path: string,
    options?: ReaddirOptions | NodeCallback<string[] | Dirent[]>,
    callback?: NodeCallback<string[] | Dirent[]>
  ): Promise<string[] | Dirent[]> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.readdirSync(path, options));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(
        fs.readdirSync(path, options as ReaddirOptions)
      );
    }
  },

  mkdir(
    path: string,
    options?: MkdirOptions | NodeCallback<void>,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        fs.mkdirSync(path, options);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      fs.mkdirSync(path, options as MkdirOptions);
      return Promise.resolve();
    }
  },

  rmdir(path: string, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.rmdirSync(path);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.rmdirSync(path));
    }
  },

  exists(path: string, callback?: (exists: boolean) => void): Promise<boolean> | void {
    if (callback) {
      callback(fs.existsSync(path));
    } else {
      return Promise.resolve(fs.existsSync(path));
    }
  },

  stat(path: string, callback?: NodeCallback<Stats>): Promise<Stats> | void {
    if (callback) {
      try {
        callback(null, fs.statSync(path));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.statSync(path));
    }
  },

  lstat(path: string, callback?: NodeCallback<Stats>): Promise<Stats> | void {
    if (callback) {
      try {
        callback(null, fs.lstatSync(path));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.lstatSync(path));
    }
  },

  unlink(path: string, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.unlinkSync(path);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.unlinkSync(path));
    }
  },

  rename(
    oldPath: string,
    newPath: string,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (callback) {
      try {
        fs.renameSync(oldPath, newPath);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.renameSync(oldPath, newPath));
    }
  },

  copyFile(
    src: string,
    dest: string,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (callback) {
      try {
        fs.copyFileSync(src, dest);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.copyFileSync(src, dest));
    }
  },

  open(
    path: string,
    flags: OpenFlags,
    mode?: number | NodeCallback<number>,
    callback?: NodeCallback<number>
  ): Promise<number> | void {
    if (typeof mode === "function") {
      callback = mode;
      mode = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.openSync(path, flags, mode));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.openSync(path, flags, mode));
    }
  },

  close(fd: number, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.closeSync(fd);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.closeSync(fd));
    }
  },

  read(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
    callback?: (err: Error | null, bytesRead?: number, buffer?: Uint8Array) => void
  ): Promise<number> | void {
    if (callback) {
      try {
        const bytesRead = fs.readSync(fd, buffer, offset, length, position);
        callback(null, bytesRead, buffer);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.readSync(fd, buffer, offset, length, position));
    }
  },

  write(
    fd: number,
    buffer: string | Uint8Array,
    offset?: number | NodeCallback<number>,
    length?: number | NodeCallback<number>,
    position?: number | null | NodeCallback<number>,
    callback?: NodeCallback<number>
  ): Promise<number> | void {
    if (typeof offset === "function") {
      callback = offset;
      offset = undefined;
      length = undefined;
      position = undefined;
    } else if (typeof length === "function") {
      callback = length;
      length = undefined;
      position = undefined;
    } else if (typeof position === "function") {
      callback = position;
      position = undefined;
    }
    if (callback) {
      try {
        const bytesWritten = fs.writeSync(
          fd,
          buffer,
          offset as number | undefined,
          length as number | undefined,
          position as number | null | undefined
        );
        callback(null, bytesWritten);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(
        fs.writeSync(
          fd,
          buffer,
          offset as number | undefined,
          length as number | undefined,
          position as number | null | undefined
        )
      );
    }
  },

  fstat(fd: number, callback?: NodeCallback<Stats>): Promise<Stats> | void {
    if (callback) {
      try {
        callback(null, fs.fstatSync(fd));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.fstatSync(fd));
    }
  },

  // fs.promises API
  // Note: Using async functions to properly catch sync errors and return rejected promises
  promises: {
    async readFile(path: string, options?: ReadFileOptions) {
      return fs.readFileSync(path, options);
    },
    async writeFile(path: string, data: string | Uint8Array, options?: WriteFileOptions) {
      return fs.writeFileSync(path, data, options);
    },
    async appendFile(path: string, data: string | Uint8Array, options?: WriteFileOptions) {
      return fs.appendFileSync(path, data, options);
    },
    async readdir(path: string, options?: ReaddirOptions) {
      return fs.readdirSync(path, options);
    },
    async mkdir(path: string, options?: MkdirOptions) {
      return fs.mkdirSync(path, options);
    },
    async rmdir(path: string) {
      return fs.rmdirSync(path);
    },
    async stat(path: string) {
      return fs.statSync(path);
    },
    async lstat(path: string) {
      return fs.lstatSync(path);
    },
    async unlink(path: string) {
      return fs.unlinkSync(path);
    },
    async rename(oldPath: string, newPath: string) {
      return fs.renameSync(oldPath, newPath);
    },
    async copyFile(src: string, dest: string) {
      return fs.copyFileSync(src, dest);
    },
    async access(path: string) {
      if (!fs.existsSync(path)) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, access '${path}'`,
          "access",
          path
        );
      }
    },
  },

  // Compatibility methods

  accessSync(path: string): void {
    if (!fs.existsSync(path)) {
      throw createFsError(
        "ENOENT",
        `ENOENT: no such file or directory, access '${path}'`,
        "access",
        path
      );
    }
  },

  access(
    path: string,
    mode?: number | NodeCallback<void>,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (typeof mode === "function") {
      callback = mode;
      mode = undefined;
    }
    if (callback) {
      try {
        fs.accessSync(path);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return fs.promises.access(path);
    }
  },

  realpathSync: Object.assign(
    function realpathSync(path: PathLike): string {
      // In our virtual fs, just normalize the path
      return toPathString(path)
        .replace(/\/\/+/g, "/")
        .replace(/\/$/, "") || "/";
    },
    {
      native(path: PathLike): string {
        return toPathString(path)
          .replace(/\/\/+/g, "/")
          .replace(/\/$/, "") || "/";
      }
    }
  ),

  realpath: Object.assign(
    function realpath(path: PathLike, callback?: NodeCallback<string>): Promise<string> | void {
      if (callback) {
        callback(null, fs.realpathSync(path));
      } else {
        return Promise.resolve(fs.realpathSync(path));
      }
    },
    {
      native(path: PathLike, callback?: NodeCallback<string>): Promise<string> | void {
        if (callback) {
          callback(null, fs.realpathSync.native(path));
        } else {
          return Promise.resolve(fs.realpathSync.native(path));
        }
      }
    }
  ),

  createReadStream(
    path: string,
    options?: { encoding?: Encoding }
  ): {
    on: (event: string, handler: (data?: unknown) => void) => unknown;
    pipe: <T extends { write: (data: unknown) => void; end: () => void }>(dest: T) => T;
  } {
    // Basic readable stream simulation
    const encoding: Encoding = options?.encoding ?? "utf8";
    const content = fs.readFileSync(path, { encoding });
    return {
      on(event: string, handler: (data?: unknown) => void) {
        if (event === "data") {
          setTimeout(() => handler(content), 0);
        } else if (event === "end") {
          setTimeout(() => handler(), 0);
        }
        // error event - no error
        return this;
      },
      pipe<T extends { write: (data: unknown) => void; end: () => void }>(dest: T): T {
        dest.write(content);
        dest.end();
        return dest;
      },
    };
  },

  createWriteStream(
    path: string,
    _options?: { encoding?: string }
  ): {
    write: (chunk: string | Uint8Array) => boolean;
    end: (chunk?: string | Uint8Array) => void;
    on: (event: string, handler: () => void) => unknown;
    once: (event: string, handler: () => void) => unknown;
    emit: (event: string) => boolean;
    writable: boolean;
  } {
    let content = "";
    const listeners: Record<string, Array<() => void>> = {};
    const stream = {
      writable: true,
      write(chunk: string | Uint8Array): boolean {
        content +=
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        return true;
      },
      end(chunk?: string | Uint8Array): void {
        if (chunk) stream.write(chunk);
        fs.writeFileSync(path, content);
        stream.writable = false;
        // Emit finish and close events
        // Use Promise.resolve() for async microtask instead of setTimeout
        // as setTimeout may not work properly in isolated-vm
        Promise.resolve().then(() => {
          stream.emit("finish");
          stream.emit("close");
        });
      },
      on(event: string, handler: () => void) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
        return stream;
      },
      once(event: string, handler: () => void) {
        const wrapper = () => {
          handler();
          // Remove after first call
          const idx = listeners[event]?.indexOf(wrapper);
          if (idx !== undefined && idx !== -1) {
            listeners[event].splice(idx, 1);
          }
        };
        return stream.on(event, wrapper);
      },
      emit(event: string): boolean {
        const handlers = listeners[event];
        if (handlers) {
          handlers.forEach((h) => h());
          return true;
        }
        return false;
      },
    };
    return stream;
  },

  // Watch (no-op)
  watch(): { close: () => void; on: () => unknown } {
    return {
      close() {},
      on() {
        return this;
      },
    };
  },

  watchFile(): void {},
  unwatchFile(): void {},
};

// Type check: validate that our fs implementation has compatible method signatures
// We use a custom type that omits Node.js internal properties like __promisify__
type FsMethodNames = keyof typeof fs;
type NodeFsMethodSignature<K extends keyof typeof nodeFs> =
  typeof nodeFs[K] extends (...args: infer A) => infer R ? (...args: A) => R : typeof nodeFs[K];

// Validate key sync methods match Node.js signatures
type _CheckReadFileSync = typeof fs.readFileSync extends NodeFsMethodSignature<'readFileSync'> ? true : false;
type _CheckWriteFileSync = typeof fs.writeFileSync extends NodeFsMethodSignature<'writeFileSync'> ? true : false;
type _CheckStatSync = typeof fs.statSync extends NodeFsMethodSignature<'statSync'> ? true : false;
type _CheckExistsSync = typeof fs.existsSync extends NodeFsMethodSignature<'existsSync'> ? true : false;

// Export the fs module
export default fs;
