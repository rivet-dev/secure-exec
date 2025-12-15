// fs polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js fs API compatibility
// It communicates with the host via the _fs Reference object

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

declare const Buffer: {
  from: (data: string | Uint8Array) => Uint8Array & { toString(encoding?: string): string };
};

// File descriptor table
const fdTable = new Map<number, { path: string; flags: number; position: number }>();
let nextFd = 3;

// Stats class
class Stats {
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
class Dirent {
  name: string;
  private _isDir: boolean;

  constructor(name: string, isDir: boolean) {
    this.name = name;
    this._isDir = isDir;
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
function parseFlags(flags: string | number): number {
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

// Type definitions for the fs module
type Encoding = "utf8" | "utf-8" | "ascii" | "binary" | "base64" | "hex" | null;
type ReadFileOptions = { encoding?: Encoding } | Encoding;
type WriteFileOptions = { encoding?: Encoding; flag?: string } | Encoding;
type ReaddirOptions = { withFileTypes?: boolean };
type MkdirOptions = { recursive?: boolean };
type OpenFlags = string | number;
type NodeCallback<T> = (err: Error | null, result?: T) => void;

// The fs module implementation
const fs = {
  // Constants
  constants: {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_TRUNC: 512,
    O_APPEND: 1024,
    S_IFMT: 61440,
    S_IFREG: 32768,
    S_IFDIR: 16384,
    S_IFLNK: 40960,
  },

  Stats,
  Dirent,

  // Sync methods

  readFileSync(path: string, options?: ReadFileOptions): string | Uint8Array {
    const encoding =
      typeof options === "string" ? options : options?.encoding;
    const content = _fs.readFile.applySyncPromise(undefined, [String(path)]);
    if (encoding) return content;
    // Return Buffer if no encoding specified
    return Buffer.from(content);
  },

  writeFileSync(
    path: string,
    data: string | Uint8Array,
    _options?: WriteFileOptions
  ): void {
    const content =
      typeof data === "string"
        ? data
        : data instanceof Uint8Array
          ? new TextDecoder().decode(data)
          : String(data);
    _fs.writeFile.applySync(undefined, [String(path), content]);
  },

  appendFileSync(
    path: string,
    data: string | Uint8Array,
    options?: WriteFileOptions
  ): void {
    const existing = fs.existsSync(path)
      ? (fs.readFileSync(path, "utf8") as string)
      : "";
    const content = typeof data === "string" ? data : String(data);
    fs.writeFileSync(path, existing + content, options);
  },

  readdirSync(path: string, options?: ReaddirOptions): string[] | Dirent[] {
    const entriesJson = _fs.readDir.applySyncPromise(undefined, [String(path)]);
    const entries = JSON.parse(entriesJson) as Array<{
      name: string;
      isDirectory: boolean;
    }>;
    if (options?.withFileTypes) {
      return entries.map((e) => new Dirent(e.name, e.isDirectory));
    }
    return entries.map((e) => e.name);
  },

  mkdirSync(path: string, options?: MkdirOptions): void {
    const recursive = options?.recursive ?? false;
    _fs.mkdir.applySync(undefined, [String(path), recursive]);
  },

  rmdirSync(path: string): void {
    _fs.rmdir.applySyncPromise(undefined, [String(path)]);
  },

  existsSync(path: string): boolean {
    return _fs.exists.applySyncPromise(undefined, [String(path)]);
  },

  statSync(path: string): Stats {
    const statJson = _fs.stat.applySyncPromise(undefined, [String(path)]);
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

  lstatSync(path: string): Stats {
    // In our virtual fs, lstat is the same as stat (no symlinks)
    return fs.statSync(path);
  },

  unlinkSync(path: string): void {
    _fs.unlink.applySyncPromise(undefined, [String(path)]);
  },

  renameSync(oldPath: string, newPath: string): void {
    _fs.rename.applySyncPromise(undefined, [String(oldPath), String(newPath)]);
  },

  copyFileSync(src: string, dest: string): void {
    const content = fs.readFileSync(src);
    fs.writeFileSync(dest, content as Uint8Array);
  },

  // File descriptor methods

  openSync(path: string, flags: OpenFlags, _mode?: number): number {
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
        `ENOENT: no such file or directory, open '${path}'`,
        "open",
        path
      );
    }

    // Handle O_TRUNC - truncate file
    if (numFlags & 512 && exists) {
      fs.writeFileSync(path, "");
    }

    fdTable.set(fd, { path, flags: numFlags, position: 0 });
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
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null
  ): number {
    const entry = fdTable.get(fd);
    if (!entry) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, read", "read");
    }
    if (!canRead(entry.flags)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, read", "read");
    }

    const content = fs.readFileSync(entry.path, "utf8") as string;
    const readPos =
      position !== null && position !== undefined ? position : entry.position;
    const toRead = content.slice(readPos, readPos + length);
    const bytes = Buffer.from(toRead);

    for (let i = 0; i < bytes.length && i < length; i++) {
      buffer[offset + i] = bytes[i];
    }

    if (position === null || position === undefined) {
      entry.position += bytes.length;
    }

    return bytes.length;
  },

  writeSync(
    fd: number,
    buffer: string | Uint8Array,
    offset?: number,
    length?: number,
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
    if (typeof buffer === "string") {
      data = buffer;
      length = data.length;
    } else {
      const slice = buffer.slice(offset ?? 0, (offset ?? 0) + (length ?? buffer.length));
      data = new TextDecoder().decode(slice);
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
    } else if (position !== null && position !== undefined) {
      writePos = position;
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
    if (position === null || position === undefined) {
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
      return Promise.resolve(fs.mkdirSync(path, options as MkdirOptions));
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
  promises: {
    readFile: (path: string, options?: ReadFileOptions) =>
      Promise.resolve(fs.readFileSync(path, options)),
    writeFile: (path: string, data: string | Uint8Array, options?: WriteFileOptions) =>
      Promise.resolve(fs.writeFileSync(path, data, options)),
    appendFile: (path: string, data: string | Uint8Array, options?: WriteFileOptions) =>
      Promise.resolve(fs.appendFileSync(path, data, options)),
    readdir: (path: string, options?: ReaddirOptions) =>
      Promise.resolve(fs.readdirSync(path, options)),
    mkdir: (path: string, options?: MkdirOptions) =>
      Promise.resolve(fs.mkdirSync(path, options)),
    rmdir: (path: string) => Promise.resolve(fs.rmdirSync(path)),
    stat: (path: string) => Promise.resolve(fs.statSync(path)),
    lstat: (path: string) => Promise.resolve(fs.lstatSync(path)),
    unlink: (path: string) => Promise.resolve(fs.unlinkSync(path)),
    rename: (oldPath: string, newPath: string) =>
      Promise.resolve(fs.renameSync(oldPath, newPath)),
    copyFile: (src: string, dest: string) =>
      Promise.resolve(fs.copyFileSync(src, dest)),
    access: (path: string) =>
      Promise.resolve(
        fs.existsSync(path)
          ? undefined
          : (() => {
              throw new Error("ENOENT");
            })()
      ),
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

  realpathSync(path: string): string {
    // In our virtual fs, just normalize the path
    return String(path)
      .replace(/\/\/+/g, "/")
      .replace(/\/$/, "") || "/";
  },

  realpath(path: string, callback?: NodeCallback<string>): Promise<string> | void {
    if (callback) {
      callback(null, fs.realpathSync(path));
    } else {
      return Promise.resolve(fs.realpathSync(path));
    }
  },

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
    on: () => unknown;
  } {
    let content = "";
    const stream = {
      write(chunk: string | Uint8Array): boolean {
        content +=
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        return true;
      },
      end(chunk?: string | Uint8Array): void {
        if (chunk) stream.write(chunk);
        fs.writeFileSync(path, content);
      },
      on() {
        return stream;
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

// Export the fs module
export default fs;
