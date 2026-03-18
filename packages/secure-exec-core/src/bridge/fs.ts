// fs polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js fs API compatibility
// It communicates with the host via the _fs Reference object

import { Buffer } from "buffer";
import type * as nodeFs from "fs";
import type { FsFacadeBridge } from "../shared/bridge-contract.js";

// Declare globals that are set up by the host environment
declare const _fs: FsFacadeBridge;

// File descriptor table — capped to prevent resource exhaustion
const MAX_BRIDGE_FDS = 1024;
const fdTable = new Map<number, { path: string; flags: number; position: number }>();
let nextFd = 3;

const O_RDONLY = 0;
const O_WRONLY = 1;
const O_RDWR = 2;
const O_ACCMODE = 3;
const O_CREAT = 64;
const O_EXCL = 128;
const O_TRUNC = 512;
const O_APPEND = 1024;

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

// Dir class for opendir — async-iterable directory handle
class Dir {
  readonly path: string;
  private _entries: Dirent[] | null = null;
  private _index: number = 0;
  private _closed: boolean = false;

  constructor(dirPath: string) {
    this.path = dirPath;
  }

  private _load(): Dirent[] {
    if (this._entries === null) {
      this._entries = fs.readdirSync(this.path, { withFileTypes: true }) as Dirent[];
    }
    return this._entries;
  }

  readSync(): Dirent | null {
    if (this._closed) throw new Error("Directory handle was closed");
    const entries = this._load();
    if (this._index >= entries.length) return null;
    return entries[this._index++];
  }

  async read(): Promise<Dirent | null> {
    return this.readSync();
  }

  closeSync(): void {
    this._closed = true;
  }

  async close(): Promise<void> {
    this.closeSync();
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Dirent> {
    const entries = this._load();
    for (const entry of entries) {
      if (this._closed) return;
      yield entry;
    }
    this._closed = true;
  }
}

// ReadStream class for createReadStream
// Provides a proper readable stream implementation that works with stream.pipeline
class ReadStream {
  // ReadStream-specific properties
  bytesRead: number = 0;
  path: string | Buffer;
  pending: boolean = true;

  // Readable stream properties
  readable: boolean = true;
  readableAborted: boolean = false;
  readableDidRead: boolean = false;
  readableEncoding: BufferEncoding | null = null;
  readableEnded: boolean = false;
  readableFlowing: boolean | null = null;
  readableHighWaterMark: number = 65536;
  readableLength: number = 0;
  readableObjectMode: boolean = false;
  destroyed: boolean = false;
  closed: boolean = false;
  errored: Error | null = null;

  // Internal state
  private _content: Buffer | null = null;
  private _listeners: Map<string | symbol, Array<(...args: unknown[]) => void>> = new Map();
  private _started: boolean = false;

  constructor(filePath: string | Buffer, private _options?: { encoding?: BufferEncoding; start?: number; end?: number; highWaterMark?: number }) {
    this.path = filePath;
    if (_options?.encoding) {
      this.readableEncoding = _options.encoding;
    }
    if (_options?.highWaterMark) {
      this.readableHighWaterMark = _options.highWaterMark;
    }
  }

  private _loadContent(): Buffer {
    if (this._content === null) {
      const pathStr = typeof this.path === 'string' ? this.path : this.path.toString();
      // readFileSync already normalizes the path
      this._content = fs.readFileSync(pathStr) as Buffer;
      this.pending = false;
    }
    return this._content;
  }

  // Start reading - called when 'data' listener is added or resume() is called
  private _startReading(): void {
    if (this._started || this.destroyed) return;
    this._started = true;
    this.readableFlowing = true;

    Promise.resolve().then(() => {
      try {
        const content = this._loadContent();
        this.readableDidRead = true;

        // Determine start/end positions
        const start = this._options?.start ?? 0;
        const end = this._options?.end ?? content.length;
        const chunk = content.slice(start, end);

        this.bytesRead = chunk.length;

        // Emit data event
        this.emit('data', chunk);

        // Emit end and close
        Promise.resolve().then(() => {
          this.readable = false;
          this.readableEnded = true;
          this.emit('end');
          Promise.resolve().then(() => {
            this.closed = true;
            this.emit('close');
          });
        });
      } catch (err) {
        this.errored = err as Error;
        this.emit('error', err);
        this.destroy(err as Error);
      }
    });
  }

  // Event handling
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(listener);

    // Start reading when 'data' listener is added (flowing mode)
    if (event === 'data' && !this._started) {
      this._startReading();
    }

    return this;
  }

  once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]): void => {
      this.off(event, wrapper);
      listener(...args);
    };
    (wrapper as { _originalListener?: typeof listener })._originalListener = listener;
    return this.on(event, wrapper);
  }

  off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners.get(event);
    if (listeners) {
      const idx = listeners.findIndex(
        fn => fn === listener || (fn as { _originalListener?: typeof listener })._originalListener === listener
      );
      if (idx !== -1) listeners.splice(idx, 1);
    }
    return this;
  }

  removeListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const listeners = this._listeners.get(event);
    if (listeners && listeners.length > 0) {
      listeners.slice().forEach(fn => fn(...args));
      return true;
    }
    return false;
  }

  // Readable methods
  read(_size?: number): Buffer | string | null {
    if (this.readableEnded || this.destroyed) return null;

    try {
      const content = this._loadContent();
      const start = this._options?.start ?? 0;
      const end = this._options?.end ?? content.length;
      const chunk = content.slice(start, end);

      this.bytesRead = chunk.length;
      this.readableDidRead = true;
      this.readable = false;
      this.readableEnded = true;

      // Schedule end event
      Promise.resolve().then(() => {
        this.emit('end');
        Promise.resolve().then(() => {
          this.closed = true;
          this.emit('close');
        });
      });

      return this.readableEncoding ? chunk.toString(this.readableEncoding) : chunk;
    } catch (err) {
      this.errored = err as Error;
      this.emit('error', err);
      return null;
    }
  }

  pipe<T extends NodeJS.WritableStream>(destination: T, _options?: { end?: boolean }): T {
    const content = this._loadContent();
    const start = this._options?.start ?? 0;
    const end = this._options?.end ?? content.length;
    const chunk = content.slice(start, end);

    this.bytesRead = chunk.length;
    this.readableDidRead = true;

    if (typeof destination.write === 'function') {
      destination.write(chunk as unknown as string);
    }
    if (typeof destination.end === 'function') {
      Promise.resolve().then(() => destination.end());
    }

    this.readable = false;
    this.readableEnded = true;
    this.closed = true;

    Promise.resolve().then(() => {
      this.emit('end');
      this.emit('close');
    });

    return destination;
  }

  unpipe(_destination?: NodeJS.WritableStream): this {
    return this;
  }

  pause(): this {
    this.readableFlowing = false;
    return this;
  }

  resume(): this {
    this.readableFlowing = true;
    if (!this._started) {
      this._startReading();
    }
    return this;
  }

  setEncoding(encoding: BufferEncoding): this {
    this.readableEncoding = encoding;
    return this;
  }

  destroy(error?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.readable = false;
    if (error) {
      this.errored = error;
      this.emit('error', error);
    }
    this.emit('close');
    this.closed = true;
    return this;
  }

  close(callback?: (err?: Error | null) => void): void {
    if (this.closed) {
      if (callback) Promise.resolve().then(() => callback(null));
      return;
    }
    this.closed = true;
    this.readable = false;
    this.destroyed = true;
    Promise.resolve().then(() => {
      this.emit('close');
      if (callback) callback(null);
    });
  }

  // Symbol.asyncIterator for async iteration
  async *[Symbol.asyncIterator](): AsyncIterator<Buffer | string> {
    const content = this._loadContent();
    const start = this._options?.start ?? 0;
    const end = this._options?.end ?? content.length;
    const chunk = content.slice(start, end);
    yield this.readableEncoding ? chunk.toString(this.readableEncoding) : chunk;
  }
}

// WriteStream class for createWriteStream
// This provides a type-safe implementation that satisfies nodeFs.WriteStream
const MAX_WRITE_STREAM_BYTES = 16 * 1024 * 1024; // 16MB cap to prevent memory exhaustion
// We use 'as' assertion at the return site since the full interface is complex
class WriteStream {
  // WriteStream-specific properties
  bytesWritten: number = 0;
  path: string | Buffer;
  pending: boolean = false;

  // Writable stream properties
  writable: boolean = true;
  writableAborted: boolean = false;
  writableEnded: boolean = false;
  writableFinished: boolean = false;
  writableHighWaterMark: number = 16384;
  writableLength: number = 0;
  writableObjectMode: boolean = false;
  writableCorked: number = 0;
  destroyed: boolean = false;
  closed: boolean = false;
  errored: Error | null = null;
  writableNeedDrain: boolean = false;

  // Internal state
  private _chunks: Uint8Array[] = [];
  private _listeners: Map<string | symbol, Array<(...args: unknown[]) => void>> = new Map();

  constructor(filePath: string | Buffer, _options?: { encoding?: BufferEncoding; flags?: string; mode?: number }) {
    this.path = filePath;
  }

  // WriteStream-specific methods
  close(callback?: (err?: NodeJS.ErrnoException | null) => void): void {
    if (this.closed) {
      if (callback) Promise.resolve().then(() => callback(null));
      return;
    }
    this.closed = true;
    this.writable = false;
    Promise.resolve().then(() => {
      this.emit("close");
      if (callback) callback(null);
    });
  }

  // Writable methods
  write(chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void): boolean {
    if (this.writableEnded || this.destroyed) {
      const err = new Error("write after end");
      if (typeof encodingOrCallback === "function") {
        Promise.resolve().then(() => encodingOrCallback(err));
      } else if (callback) {
        Promise.resolve().then(() => callback(err));
      }
      return false;
    }

    let data: Uint8Array;
    if (typeof chunk === "string") {
      data = Buffer.from(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8");
    } else if (Buffer.isBuffer(chunk)) {
      data = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    } else if (chunk instanceof Uint8Array) {
      data = chunk;
    } else {
      data = Buffer.from(String(chunk));
    }

    // Cap buffered data to prevent memory exhaustion
    if (this.writableLength + data.length > MAX_WRITE_STREAM_BYTES) {
      const err = new Error(`WriteStream buffer exceeded ${MAX_WRITE_STREAM_BYTES} bytes`);
      this.errored = err;
      this.destroyed = true;
      this.writable = false;
      const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (cb) Promise.resolve().then(() => cb(err));
      Promise.resolve().then(() => this.emit("error", err));
      return false;
    }

    this._chunks.push(data);
    this.bytesWritten += data.length;
    this.writableLength += data.length;

    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (cb) Promise.resolve().then(() => cb(null));

    return true;
  }

  end(chunkOrCb?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void): this {
    if (this.writableEnded) return this;

    let cb: (() => void) | undefined;
    if (typeof chunkOrCb === "function") {
      cb = chunkOrCb as () => void;
    } else if (typeof encodingOrCallback === "function") {
      cb = encodingOrCallback;
      if (chunkOrCb !== undefined && chunkOrCb !== null) {
        this.write(chunkOrCb);
      }
    } else {
      cb = callback;
      if (chunkOrCb !== undefined && chunkOrCb !== null) {
        this.write(chunkOrCb, encodingOrCallback);
      }
    }

    this.writableEnded = true;

    // Concatenate and write all chunks
    const totalLength = this._chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of this._chunks) {
      result.set(c, offset);
      offset += c.length;
    }

    // Write to filesystem
    const pathStr = typeof this.path === "string" ? this.path : this.path.toString();
    fs.writeFileSync(pathStr, result);

    this.writable = false;
    this.writableFinished = true;
    this.writableLength = 0;

    Promise.resolve().then(() => {
      this.emit("finish");
      this.emit("close");
      this.closed = true;
      if (cb) cb();
    });

    return this;
  }

  setDefaultEncoding(_encoding: BufferEncoding): this {
    return this;
  }

  cork(): void {
    this.writableCorked++;
  }

  uncork(): void {
    if (this.writableCorked > 0) this.writableCorked--;
  }

  destroy(error?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.writable = false;
    if (error) {
      this.errored = error;
      Promise.resolve().then(() => {
        this.emit("error", error);
        this.emit("close");
        this.closed = true;
      });
    } else {
      Promise.resolve().then(() => {
        this.emit("close");
        this.closed = true;
      });
    }
    return this;
  }

  // Internal methods (required by Writable interface but not typically called directly)
  _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }

  _destroy(_error: Error | null, callback: (error?: Error | null) => void): void {
    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    callback();
  }

  // EventEmitter methods
  addListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners.get(event) || [];
    listeners.push(listener);
    this._listeners.set(event, listeners);
    return this;
  }

  once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  prependListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners.get(event) || [];
    listeners.unshift(listener);
    this._listeners.set(event, listeners);
    return this;
  }

  prependOnceListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.prependListener(event, wrapper);
  }

  removeListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    }
    return this;
  }

  off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return this.removeListener(event, listener);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const listeners = this._listeners.get(event);
    if (listeners && listeners.length > 0) {
      listeners.slice().forEach(l => l(...args));
      return true;
    }
    return false;
  }

  listeners(event: string | symbol): Function[] {
    return [...(this._listeners.get(event) || [])];
  }

  rawListeners(event: string | symbol): Function[] {
    return this.listeners(event);
  }

  listenerCount(event: string | symbol): number {
    return (this._listeners.get(event) || []).length;
  }

  eventNames(): (string | symbol)[] {
    return [...this._listeners.keys()];
  }

  getMaxListeners(): number {
    return 10;
  }

  setMaxListeners(_n: number): this {
    return this;
  }

  // Pipe methods (minimal implementation)
  pipe<T extends NodeJS.WritableStream>(destination: T, _options?: { end?: boolean }): T {
    return destination;
  }

  unpipe(_destination?: NodeJS.WritableStream): this {
    return this;
  }

  // Additional required methods
  compose<T extends NodeJS.ReadableStream>(_stream: T | Iterable<T> | AsyncIterable<T>, _options?: { signal: AbortSignal }): T {
    throw new Error("compose not implemented in sandbox");
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

// Parse flags string to number
function parseFlags(flags: OpenMode): number {
  if (typeof flags === "number") return flags;
  const flagMap: Record<string, number> = {
    r: O_RDONLY,
    "r+": O_RDWR,
    w: O_WRONLY | O_CREAT | O_TRUNC,
    "w+": O_RDWR | O_CREAT | O_TRUNC,
    a: O_WRONLY | O_APPEND | O_CREAT,
    "a+": O_RDWR | O_APPEND | O_CREAT,
    wx: O_WRONLY | O_CREAT | O_TRUNC | O_EXCL,
    xw: O_WRONLY | O_CREAT | O_TRUNC | O_EXCL,
    "wx+": O_RDWR | O_CREAT | O_TRUNC | O_EXCL,
    "xw+": O_RDWR | O_CREAT | O_TRUNC | O_EXCL,
    ax: O_WRONLY | O_APPEND | O_CREAT | O_EXCL,
    xa: O_WRONLY | O_APPEND | O_CREAT | O_EXCL,
    "ax+": O_RDWR | O_APPEND | O_CREAT | O_EXCL,
    "xa+": O_RDWR | O_APPEND | O_CREAT | O_EXCL,
  };
  if (flags in flagMap) return flagMap[flags];
  throw new Error("Unknown file flag: " + flags);
}

// Check if flags allow reading
function canRead(flags: number): boolean {
  const mode = flags & O_ACCMODE;
  return mode === 0 || mode === 2;
}

// Check if flags allow writing
function canWrite(flags: number): boolean {
  const mode = flags & O_ACCMODE;
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
  err.errno = code === "ENOENT" ? -2 : code === "EACCES" ? -13 : code === "EBADF" ? -9 : code === "EMFILE" ? -24 : -1;
  err.syscall = syscall;
  if (path) err.path = path;
  return err;
}

/** Wrap a bridge call with ENOENT/EACCES error re-creation. */
function bridgeCall<T>(fn: () => T, syscall: string, path?: string): T {
  try {
    return fn();
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (msg.includes("ENOENT") || msg.includes("no such file or directory") || msg.includes("not found")) {
      throw createFsError("ENOENT", `ENOENT: no such file or directory, ${syscall} '${path}'`, syscall, path);
    }
    if (msg.includes("EACCES") || msg.includes("permission denied")) {
      throw createFsError("EACCES", `EACCES: permission denied, ${syscall} '${path}'`, syscall, path);
    }
    if (msg.includes("EEXIST") || msg.includes("file already exists")) {
      throw createFsError("EEXIST", `EEXIST: file already exists, ${syscall} '${path}'`, syscall, path);
    }
    if (msg.includes("EINVAL") || msg.includes("invalid argument")) {
      throw createFsError("EINVAL", `EINVAL: invalid argument, ${syscall} '${path}'`, syscall, path);
    }
    throw err;
  }
}

// Glob pattern matching helper — converts glob to regex and walks VFS recursively
function _globToRegex(pattern: string): RegExp {
  // Determine base directory vs glob portion
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // ** matches any depth of directories
      if (pattern[i + 2] === "/") {
        regexStr += "(?:.+/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      regexStr += "[^/]*";
      i++;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === "{") {
      const close = pattern.indexOf("}", i);
      if (close !== -1) {
        const alternatives = pattern.slice(i + 1, close).split(",");
        regexStr += "(?:" + alternatives.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^/]*")).join("|") + ")";
        i = close + 1;
      } else {
        regexStr += "\\{";
        i++;
      }
    } else if (ch === "[") {
      const close = pattern.indexOf("]", i);
      if (close !== -1) {
        regexStr += pattern.slice(i, close + 1);
        i = close + 1;
      } else {
        regexStr += "\\[";
        i++;
      }
    } else if (".+^${}()|[]\\".includes(ch)) {
      regexStr += "\\" + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return new RegExp("^" + regexStr + "$");
}

function _globGetBase(pattern: string): string {
  // Find the longest directory prefix that has no glob characters
  const parts = pattern.split("/");
  const baseParts: string[] = [];
  for (const part of parts) {
    if (/[*?{}\[\]]/.test(part)) break;
    baseParts.push(part);
  }
  return baseParts.join("/") || "/";
}

// Recursively walk VFS directory and collect matching paths
// We use a reference to `fs` via late-binding in the fs object method
const MAX_GLOB_DEPTH = 100; // Prevent stack overflow on deeply nested trees

function _globCollect(pattern: string, results: string[]): void {
  const regex = _globToRegex(pattern);
  const base = _globGetBase(pattern);

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_GLOB_DEPTH) return;
    let entries: string[];
    try {
      entries = _globReadDir(dir);
    } catch {
      return; // Directory doesn't exist or not readable
    }
    for (const entry of entries) {
      const fullPath = dir === "/" ? "/" + entry : dir + "/" + entry;
      // Check if this path matches the pattern
      if (regex.test(fullPath)) {
        results.push(fullPath);
      }
      // Recurse into directories if pattern has ** or more segments
      try {
        const stat = _globStat(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      } catch {
        // Not a directory or stat failed — skip
      }
    }
  };

  // Start walking from the base directory
  try {
    // Check if base itself matches (edge case)
    if (regex.test(base)) {
      const stat = _globStat(base);
      if (!stat.isDirectory()) {
        results.push(base);
        return;
      }
    }
    walk(base, 0);
  } catch {
    // Base doesn't exist — no matches
  }
}

// Late-bound references — these get assigned after fs is defined
let _globReadDir: (dir: string) => string[];
let _globStat: (path: string) => Stats;

// Type definitions for the fs module - use Node.js types
type PathLike = nodeFs.PathLike;
type PathOrFileDescriptor = nodeFs.PathOrFileDescriptor;
type OpenMode = nodeFs.OpenMode;
type Mode = nodeFs.Mode;
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

// Note: Path normalization is handled by VirtualFileSystem, not here.
// The VFS expects /data/* paths for Directory access, so we pass paths through unchanged.

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
    O_RDONLY,
    O_WRONLY,
    O_RDWR,
    O_CREAT,
    O_EXCL,
    O_NOCTTY: 256,
    O_TRUNC,
    O_APPEND,
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
  Dir,

  // Sync methods

  readFileSync(path: PathOrFileDescriptor, options?: ReadFileOptions): string | Buffer {
    const rawPath = typeof path === "number" ? fdTable.get(path)?.path : toPathString(path);
    if (!rawPath) throw createFsError("EBADF", "EBADF: bad file descriptor", "read");
    const pathStr = rawPath;
    const encoding =
      typeof options === "string" ? options : (options as { encoding?: BufferEncoding | null })?.encoding;

    try {
      if (encoding) {
        // Text mode - use text read
        const content = _fs.readFile.applySyncPromise(undefined, [pathStr]);
        return content;
      } else {
        // Binary mode - use binary read with base64 encoding
        const base64Content = _fs.readFileBinary.applySyncPromise(undefined, [pathStr]);
        return Buffer.from(base64Content, "base64");
      }
    } catch (err) {
      const errMsg = (err as Error).message || String(err);
      // Convert various "not found" errors to proper ENOENT
      if (
        errMsg.includes("entry not found") ||
        errMsg.includes("not found") ||
        errMsg.includes("ENOENT") ||
        errMsg.includes("no such file or directory")
      ) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, open '${rawPath}'`,
          "open",
          rawPath
        );
      }
      // Convert permission errors to proper EACCES
      if (errMsg.includes("EACCES") || errMsg.includes("permission denied")) {
        throw createFsError(
          "EACCES",
          `EACCES: permission denied, open '${rawPath}'`,
          "open",
          rawPath
        );
      }
      throw err;
    }
  },

  writeFileSync(
    file: PathOrFileDescriptor,
    data: string | NodeJS.ArrayBufferView,
    _options?: WriteFileOptions
  ): void {
    const rawPath = typeof file === "number" ? fdTable.get(file)?.path : toPathString(file);
    if (!rawPath) throw createFsError("EBADF", "EBADF: bad file descriptor", "write");
    const pathStr = rawPath;

    if (typeof data === "string") {
      // Text mode - use text write
      // Return the result so async callers (fs.promises) can await it.
      return _fs.writeFile.applySyncPromise(undefined, [pathStr, data]);
    } else if (ArrayBuffer.isView(data)) {
      // Binary mode - convert to base64 and use binary write
      const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const base64 = Buffer.from(uint8).toString("base64");
      return _fs.writeFileBinary.applySyncPromise(undefined, [pathStr, base64]);
    } else {
      // Fallback to text mode
      return _fs.writeFile.applySyncPromise(undefined, [pathStr, String(data)]);
    }
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
    const rawPath = toPathString(path);
    const pathStr = rawPath;
    let entriesJson: string;
    try {
      entriesJson = _fs.readDir.applySyncPromise(undefined, [pathStr]);
    } catch (err) {
      // Convert "entry not found" and similar errors to proper ENOENT
      const errMsg = (err as Error).message || String(err);
      if (errMsg.includes("entry not found") || errMsg.includes("not found")) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, scandir '${rawPath}'`,
          "scandir",
          rawPath
        );
      }
      throw err;
    }
    const entries = JSON.parse(entriesJson) as Array<{
      name: string;
      isDirectory: boolean;
    }>;
    if (options?.withFileTypes) {
      return entries.map((e) => new Dirent(e.name, e.isDirectory, rawPath));
    }
    return entries.map((e) => e.name);
  },

  mkdirSync(path: PathLike, options?: MakeDirectoryOptions | Mode): string | undefined {
    const rawPath = toPathString(path);
    const pathStr = rawPath;
    const recursive = typeof options === "object" ? options?.recursive ?? false : false;
    _fs.mkdir.applySyncPromise(undefined, [pathStr, recursive]);
    return recursive ? rawPath : undefined;
  },

  rmdirSync(path: PathLike, _options?: RmDirOptions): void {
    const pathStr = toPathString(path);
    _fs.rmdir.applySyncPromise(undefined, [pathStr]);
  },

  rmSync(path: PathLike, options?: { force?: boolean; recursive?: boolean }): void {
    const pathStr = toPathString(path);
    const opts = options || {};
    try {
      const stats = fs.statSync(pathStr);
      if (stats.isDirectory()) {
        if (opts.recursive) {
          // Recursively remove directory contents
          const entries = fs.readdirSync(pathStr);
          for (const entry of entries) {
            const entryPath = pathStr.endsWith("/") ? pathStr + entry : pathStr + "/" + entry;
            const entryStats = fs.statSync(entryPath);
            if (entryStats.isDirectory()) {
              fs.rmSync(entryPath, { recursive: true });
            } else {
              fs.unlinkSync(entryPath);
            }
          }
          fs.rmdirSync(pathStr);
        } else {
          fs.rmdirSync(pathStr);
        }
      } else {
        fs.unlinkSync(pathStr);
      }
    } catch (e) {
      if (opts.force && (e as NodeJS.ErrnoException).code === "ENOENT") {
        return; // Ignore ENOENT when force is true
      }
      throw e;
    }
  },

  existsSync(path: PathLike): boolean {
    const pathStr = toPathString(path);
    return _fs.exists.applySyncPromise(undefined, [pathStr]);
  },

  statSync(path: PathLike, _options?: nodeFs.StatSyncOptions): Stats {
    const rawPath = toPathString(path);
    const pathStr = rawPath;
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
          `ENOENT: no such file or directory, stat '${rawPath}'`,
          "stat",
          rawPath
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
    const pathStr = toPathString(path);
    const statJson = bridgeCall(() => _fs.lstat.applySyncPromise(undefined, [pathStr]), "lstat", pathStr);
    const stat = JSON.parse(statJson) as {
      mode: number;
      size: number;
      isDirectory: boolean;
      isSymbolicLink?: boolean;
      atimeMs?: number;
      mtimeMs?: number;
      ctimeMs?: number;
      birthtimeMs?: number;
    };
    return new Stats(stat);
  },

  unlinkSync(path: PathLike): void {
    const pathStr = toPathString(path);
    _fs.unlink.applySyncPromise(undefined, [pathStr]);
  },

  renameSync(oldPath: PathLike, newPath: PathLike): void {
    const oldPathStr = toPathString(oldPath);
    const newPathStr = toPathString(newPath);
    _fs.rename.applySyncPromise(undefined, [oldPathStr, newPathStr]);
  },

  copyFileSync(src: PathLike, dest: PathLike, _mode?: number): void {
    // readFileSync and writeFileSync already normalize paths
    const content = fs.readFileSync(src);
    fs.writeFileSync(dest, content as Buffer);
  },

  // Recursive copy
  cpSync(src: PathLike, dest: PathLike, options?: { recursive?: boolean; force?: boolean; errorOnExist?: boolean }): void {
    const srcPath = toPathString(src);
    const destPath = toPathString(dest);
    const opts = options || {};

    const srcStat = fs.statSync(srcPath);

    if (srcStat.isDirectory()) {
      if (!opts.recursive) {
        throw createFsError(
          "ERR_FS_EISDIR",
          `Path is a directory: cp '${srcPath}'`,
          "cp",
          srcPath
        );
      }
      // Create destination directory
      try {
        fs.mkdirSync(destPath, { recursive: true });
      } catch {
        // May already exist
      }
      // Copy contents recursively
      const entries = fs.readdirSync(srcPath) as string[];
      for (const entry of entries) {
        const srcEntry = srcPath.endsWith("/") ? srcPath + entry : srcPath + "/" + entry;
        const destEntry = destPath.endsWith("/") ? destPath + entry : destPath + "/" + entry;
        fs.cpSync(srcEntry, destEntry, opts);
      }
    } else {
      // File copy
      if (opts.errorOnExist && fs.existsSync(destPath)) {
        throw createFsError(
          "EEXIST",
          `EEXIST: file already exists, cp '${srcPath}' -> '${destPath}'`,
          "cp",
          destPath
        );
      }
      if (!opts.force && opts.force !== undefined && fs.existsSync(destPath)) {
        return; // Skip without error when force is false
      }
      fs.copyFileSync(srcPath, destPath);
    }
  },

  // Temp directory creation
  mkdtempSync(prefix: string, _options?: nodeFs.EncodingOption): string {
    const suffix = Math.random().toString(36).slice(2, 8);
    const dirPath = prefix + suffix;
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  },

  // Directory handle (sync)
  opendirSync(path: PathLike, _options?: nodeFs.OpenDirOptions): Dir {
    const pathStr = toPathString(path);
    // Verify directory exists
    const stat = fs.statSync(pathStr);
    if (!stat.isDirectory()) {
      throw createFsError(
        "ENOTDIR",
        `ENOTDIR: not a directory, opendir '${pathStr}'`,
        "opendir",
        pathStr
      );
    }
    return new Dir(pathStr);
  },

  // File descriptor methods

  openSync(path: PathLike, flags: OpenMode, _mode?: Mode | null): number {
    // Enforce bridge-side FD limit
    if (fdTable.size >= MAX_BRIDGE_FDS) {
      throw createFsError("EMFILE", "EMFILE: too many open files, open '" + toPathString(path) + "'", "open", toPathString(path));
    }
    const rawPath = toPathString(path);
    const pathStr = rawPath;
    const numFlags = parseFlags(flags);
    const fd = nextFd++;

    // Check if file exists (existsSync already normalizes)
    const exists = fs.existsSync(path);

    // Handle O_CREAT - create file if it doesn't exist
    if (numFlags & 64 && !exists) {
      fs.writeFileSync(path, "");
    } else if (!exists && !(numFlags & 64)) {
      throw createFsError(
        "ENOENT",
        `ENOENT: no such file or directory, open '${rawPath}'`,
        "open",
        rawPath
      );
    }

    // Handle O_TRUNC - truncate file
    if (numFlags & 512 && exists) {
      fs.writeFileSync(path, "");
    }

    // Store normalized path in fd table for subsequent operations
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
    // fs.writeSync
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

  // fsync / fdatasync — no-op for in-memory VFS (nothing to flush to disk)
  fsyncSync(fd: number): void {
    if (!fdTable.has(fd)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, fsync", "fsync");
    }
  },

  fdatasyncSync(fd: number): void {
    if (!fdTable.has(fd)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, fdatasync", "fdatasync");
    }
  },

  // readv — scatter-read into multiple buffers
  readvSync(fd: number, buffers: ArrayBufferView[], position?: number | null): number {
    const entry = fdTable.get(fd);
    if (!entry) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, readv", "readv");
    }
    if (!canRead(entry.flags)) {
      throw createFsError("EBADF", "EBADF: bad file descriptor, readv", "readv");
    }

    let totalBytesRead = 0;
    for (const buffer of buffers) {
      const target = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const bytesRead = fs.readSync(fd, target, 0, target.byteLength, position);
      totalBytesRead += bytesRead;
      if (position !== null && position !== undefined) {
        position += bytesRead;
      }
      // EOF — stop filling further buffers
      if (bytesRead < target.byteLength) break;
    }
    return totalBytesRead;
  },

  // statfs — return synthetic filesystem stats for the in-memory VFS
  statfsSync(path: PathLike, _options?: nodeFs.StatFsOptions): nodeFs.StatsFs {
    const pathStr = toPathString(path);
    // Verify path exists
    if (!fs.existsSync(pathStr)) {
      throw createFsError(
        "ENOENT",
        `ENOENT: no such file or directory, statfs '${pathStr}'`,
        "statfs",
        pathStr
      );
    }
    // Return synthetic stats — in-memory VFS has no real block device
    return {
      type: 0x01021997, // TMPFS_MAGIC
      bsize: 4096,
      blocks: 262144,    // 1GB virtual capacity
      bfree: 262144,
      bavail: 262144,
      files: 1000000,
      ffree: 999999,
    } as unknown as nodeFs.StatsFs;
  },

  // glob — pattern matching over VFS files
  globSync(pattern: string | string[], _options?: nodeFs.GlobOptionsWithFileTypes): string[] {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const results: string[] = [];
    for (const pat of patterns) {
      _globCollect(pat, results);
    }
    return [...new Set(results)].sort();
  },

  // Metadata and link sync methods — delegate to VFS via host refs
  chmodSync(path: PathLike, mode: Mode): void {
    const pathStr = toPathString(path);
    const modeNum = typeof mode === "string" ? parseInt(mode, 8) : mode;
    bridgeCall(() => _fs.chmod.applySyncPromise(undefined, [pathStr, modeNum]), "chmod", pathStr);
  },

  chownSync(path: PathLike, uid: number, gid: number): void {
    const pathStr = toPathString(path);
    bridgeCall(() => _fs.chown.applySyncPromise(undefined, [pathStr, uid, gid]), "chown", pathStr);
  },

  linkSync(existingPath: PathLike, newPath: PathLike): void {
    const existingStr = toPathString(existingPath);
    const newStr = toPathString(newPath);
    bridgeCall(() => _fs.link.applySyncPromise(undefined, [existingStr, newStr]), "link", newStr);
  },

  symlinkSync(target: PathLike, path: PathLike, _type?: string | null): void {
    const targetStr = toPathString(target);
    const pathStr = toPathString(path);
    bridgeCall(() => _fs.symlink.applySyncPromise(undefined, [targetStr, pathStr]), "symlink", pathStr);
  },

  readlinkSync(path: PathLike, _options?: nodeFs.EncodingOption): string {
    const pathStr = toPathString(path);
    return bridgeCall(() => _fs.readlink.applySyncPromise(undefined, [pathStr]), "readlink", pathStr);
  },

  truncateSync(path: PathLike, len?: number | null): void {
    const pathStr = toPathString(path);
    bridgeCall(() => _fs.truncate.applySyncPromise(undefined, [pathStr, len ?? 0]), "truncate", pathStr);
  },

  utimesSync(path: PathLike, atime: string | number | Date, mtime: string | number | Date): void {
    const pathStr = toPathString(path);
    const atimeNum = typeof atime === "number" ? atime : new Date(atime).getTime() / 1000;
    const mtimeNum = typeof mtime === "number" ? mtime : new Date(mtime).getTime() / 1000;
    bridgeCall(() => _fs.utimes.applySyncPromise(undefined, [pathStr, atimeNum, mtimeNum]), "utimes", pathStr);
  },

  // Async methods - wrap sync methods in callbacks/promises
  //
  // IMPORTANT: Low-level fd operations (open, close, read, write) and operations commonly
  // used by streaming libraries (stat, lstat, rename, unlink) must defer their callbacks
  // using queueMicrotask(). This is critical for proper stream operation.
  //
  // Why: Node.js streams (like tar, minipass, fs-minipass) use callback chains where each
  // callback triggers the next read/write operation. These streams also rely on events like
  // 'drain' to know when to resume writing. If callbacks fire synchronously, the event loop
  // never gets a chance to process these events, causing streams to stall after the first chunk.
  //
  // Example problem without queueMicrotask:
  //   1. tar calls fs.read() with callback
  //   2. Our sync implementation calls callback immediately
  //   3. Callback writes to stream, stream buffer fills, returns false (needs drain)
  //   4. Code sets up 'drain' listener and returns
  //   5. But we never returned to event loop, so 'drain' never fires
  //   6. Stream hangs forever
  //
  // With queueMicrotask, step 2 defers the callback, allowing the event loop to process
  // pending events (including 'drain') before the next operation starts.

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
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        fs.rmdirSync(path);
        queueMicrotask(() => cb(null));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
      }
    } else {
      return Promise.resolve(fs.rmdirSync(path));
    }
  },

  // rm - remove files or directories (with recursive support)
  rm(
    path: string,
    options?: { force?: boolean; recursive?: boolean } | NodeCallback<void>,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    let opts: { force?: boolean; recursive?: boolean } = {};
    let cb: NodeCallback<void> | undefined;

    if (typeof options === "function") {
      cb = options;
    } else if (options) {
      opts = options;
      cb = callback;
    } else {
      cb = callback;
    }

    const doRm = (): void => {
      try {
        const stats = fs.statSync(path);
        if (stats.isDirectory()) {
          if (opts.recursive) {
            // Recursively remove directory contents
            const entries = fs.readdirSync(path);
            for (const entry of entries) {
              const entryPath = path.endsWith("/") ? path + entry : path + "/" + entry;
              const entryStats = fs.statSync(entryPath);
              if (entryStats.isDirectory()) {
                fs.rmSync(entryPath, { recursive: true });
              } else {
                fs.unlinkSync(entryPath);
              }
            }
            fs.rmdirSync(path);
          } else {
            fs.rmdirSync(path);
          }
        } else {
          fs.unlinkSync(path);
        }
      } catch (e) {
        if (opts.force && (e as NodeJS.ErrnoException).code === "ENOENT") {
          return; // Ignore ENOENT when force is true
        }
        throw e;
      }
    };

    if (cb) {
      // Defer callback to next tick to allow event loop to process stream events
      try {
        doRm();
        queueMicrotask(() => cb(null));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
      }
    } else {
      doRm();
      return Promise.resolve();
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
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        const stats = fs.statSync(path);
        queueMicrotask(() => cb(null, stats));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
      }
    } else {
      return Promise.resolve(fs.statSync(path));
    }
  },

  lstat(path: string, callback?: NodeCallback<Stats>): Promise<Stats> | void {
    if (callback) {
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        const stats = fs.lstatSync(path);
        queueMicrotask(() => cb(null, stats));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
      }
    } else {
      return Promise.resolve(fs.lstatSync(path));
    }
  },

  unlink(path: string, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        fs.unlinkSync(path);
        queueMicrotask(() => cb(null));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
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
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        fs.renameSync(oldPath, newPath);
        queueMicrotask(() => cb(null));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
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

  cp(
    src: string,
    dest: string,
    options?: { recursive?: boolean; force?: boolean; errorOnExist?: boolean } | NodeCallback<void>,
    callback?: NodeCallback<void>
  ): Promise<void> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        fs.cpSync(src, dest, options as { recursive?: boolean; force?: boolean; errorOnExist?: boolean });
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.cpSync(src, dest, options as { recursive?: boolean; force?: boolean; errorOnExist?: boolean }));
    }
  },

  mkdtemp(
    prefix: string,
    options?: nodeFs.EncodingOption | NodeCallback<string>,
    callback?: NodeCallback<string>
  ): Promise<string> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.mkdtempSync(prefix, options as nodeFs.EncodingOption));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.mkdtempSync(prefix, options as nodeFs.EncodingOption));
    }
  },

  opendir(
    path: string,
    options?: nodeFs.OpenDirOptions | NodeCallback<Dir>,
    callback?: NodeCallback<Dir>
  ): Promise<Dir> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.opendirSync(path, options as nodeFs.OpenDirOptions));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.opendirSync(path, options as nodeFs.OpenDirOptions));
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
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        const fd = fs.openSync(path, flags, mode);
        queueMicrotask(() => cb(null, fd));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
      }
    } else {
      return Promise.resolve(fs.openSync(path, flags, mode));
    }
  },

  close(fd: number, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        fs.closeSync(fd);
        queueMicrotask(() => cb(null));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
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
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        const bytesRead = fs.readSync(fd, buffer, offset, length, position);
        queueMicrotask(() => cb(null, bytesRead, buffer));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
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
      // Defer callback to next tick to allow event loop to process stream events
      const cb = callback;
      try {
        const bytesWritten = fs.writeSync(
          fd,
          buffer,
          offset as number | undefined,
          length as number | undefined,
          position as number | null | undefined
        );
        queueMicrotask(() => cb(null, bytesWritten));
      } catch (e) {
        queueMicrotask(() => cb(e as Error));
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

  // writev - write multiple buffers to a file descriptor
  writev(
    fd: number,
    buffers: ArrayBufferView[],
    position?: number | null | ((err: Error | null, bytesWritten?: number, buffers?: ArrayBufferView[]) => void),
    callback?: (err: Error | null, bytesWritten?: number, buffers?: ArrayBufferView[]) => void
  ): void {
    if (typeof position === "function") {
      callback = position;
      position = null;
    }
    if (callback) {
      try {
        const bytesWritten = fs.writevSync(fd, buffers, position as number | null);
        callback(null, bytesWritten, buffers);
      } catch (e) {
        callback(e as Error);
      }
    }
  },

  writevSync(fd: number, buffers: ArrayBufferView[], position?: number | null): number {
    let totalBytesWritten = 0;
    for (const buffer of buffers) {
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      totalBytesWritten += fs.writeSync(fd, bytes, 0, bytes.length, position);
      if (position !== null && position !== undefined) {
        position += bytes.length;
      }
    }
    return totalBytesWritten;
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

  // fsync / fdatasync async callback forms
  fsync(fd: number, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.fsyncSync(fd);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.fsyncSync(fd));
    }
  },

  fdatasync(fd: number, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.fdatasyncSync(fd);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.fdatasyncSync(fd));
    }
  },

  // readv async callback form
  readv(
    fd: number,
    buffers: ArrayBufferView[],
    position?: number | null | ((err: Error | null, bytesRead?: number, buffers?: ArrayBufferView[]) => void),
    callback?: (err: Error | null, bytesRead?: number, buffers?: ArrayBufferView[]) => void
  ): void {
    if (typeof position === "function") {
      callback = position;
      position = null;
    }
    if (callback) {
      try {
        const bytesRead = fs.readvSync(fd, buffers, position as number | null);
        callback(null, bytesRead, buffers);
      } catch (e) {
        callback(e as Error);
      }
    }
  },

  // statfs async callback form
  statfs(
    path: PathLike,
    options?: nodeFs.StatFsOptions | NodeCallback<nodeFs.StatsFs>,
    callback?: NodeCallback<nodeFs.StatsFs>
  ): Promise<nodeFs.StatsFs> | void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.statfsSync(path, options as nodeFs.StatFsOptions));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.statfsSync(path, options as nodeFs.StatFsOptions));
    }
  },

  // glob async callback form
  glob(
    pattern: string | string[],
    options?: nodeFs.GlobOptionsWithFileTypes | ((err: Error | null, matches?: string[]) => void),
    callback?: (err: Error | null, matches?: string[]) => void
  ): void {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (callback) {
      try {
        callback(null, fs.globSync(pattern, options as nodeFs.GlobOptionsWithFileTypes));
      } catch (e) {
        callback(e as Error);
      }
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
    async cp(src: string, dest: string, options?: { recursive?: boolean; force?: boolean; errorOnExist?: boolean }) {
      return fs.cpSync(src, dest, options);
    },
    async mkdtemp(prefix: string, options?: nodeFs.EncodingOption) {
      return fs.mkdtempSync(prefix, options);
    },
    async opendir(path: string, options?: nodeFs.OpenDirOptions) {
      return fs.opendirSync(path, options);
    },
    async statfs(path: string, options?: nodeFs.StatFsOptions) {
      return fs.statfsSync(path, options);
    },
    async glob(pattern: string | string[], _options?: nodeFs.GlobOptionsWithFileTypes) {
      return fs.globSync(pattern, _options);
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
    async rm(path: string, options?: { force?: boolean; recursive?: boolean }) {
      return fs.rmSync(path, options);
    },
    async chmod(path: string, mode: Mode): Promise<void> {
      return fs.chmodSync(path, mode);
    },
    async chown(path: string, uid: number, gid: number): Promise<void> {
      return fs.chownSync(path, uid, gid);
    },
    async link(existingPath: string, newPath: string): Promise<void> {
      return fs.linkSync(existingPath, newPath);
    },
    async symlink(target: string, path: string): Promise<void> {
      return fs.symlinkSync(target, path);
    },
    async readlink(path: string): Promise<string> {
      return fs.readlinkSync(path);
    },
    async truncate(path: string, len?: number): Promise<void> {
      return fs.truncateSync(path, len);
    },
    async utimes(path: string, atime: string | number | Date, mtime: string | number | Date): Promise<void> {
      return fs.utimesSync(path, atime, mtime);
    },
  },

  // Compatibility methods

  accessSync(path: string): void {
    // existsSync already normalizes the path
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
      // Resolve symlinks by walking each path component via lstat + readlink
      const MAX_SYMLINK_DEPTH = 40;
      let symlinksFollowed = 0;
      const raw = toPathString(path);

      // Build initial queue: normalize . and .. segments
      const pending: string[] = [];
      for (const seg of raw.split("/")) {
        if (!seg || seg === ".") continue;
        if (seg === "..") { if (pending.length > 0) pending.pop(); }
        else pending.push(seg);
      }

      // Walk each component, resolving symlinks via a queue
      const resolved: string[] = [];
      while (pending.length > 0) {
        const seg = pending.shift()!;
        if (seg === ".") continue;
        if (seg === "..") { if (resolved.length > 0) resolved.pop(); continue; }
        resolved.push(seg);
        const currentPath = "/" + resolved.join("/");
        try {
          const stat = fs.lstatSync(currentPath);
          if (stat.isSymbolicLink()) {
            if (++symlinksFollowed > MAX_SYMLINK_DEPTH) {
              const err = new Error(`ELOOP: too many levels of symbolic links, realpath '${raw}'`) as NodeJS.ErrnoException;
              err.code = "ELOOP";
              err.syscall = "realpath";
              err.path = raw;
              throw err;
            }
            const target = fs.readlinkSync(currentPath);
            // Prepend target segments to pending for re-resolution
            const targetSegs = target.split("/").filter(Boolean);
            if (target.startsWith("/")) {
              // Absolute symlink — restart from root
              resolved.length = 0;
            } else {
              // Relative symlink — drop current component
              resolved.pop();
            }
            // Prepend target segments so they're processed next
            pending.unshift(...targetSegs);
          }
        } catch (e: unknown) {
          const err = e as NodeJS.ErrnoException;
          if (err.code === "ELOOP") throw e;
          if (err.code === "ENOENT" || err.code === "ENOTDIR") {
            const enoent = new Error(`ENOENT: no such file or directory, realpath '${raw}'`) as NodeJS.ErrnoException;
            enoent.code = "ENOENT";
            enoent.syscall = "realpath";
            enoent.path = raw;
            throw enoent;
          }
          break;
        }
      }
      return "/" + resolved.join("/") || "/";
    },
    {
      native(path: PathLike): string {
        return fs.realpathSync(path);
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
    path: nodeFs.PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding; start?: number; end?: number; highWaterMark?: number }
  ): nodeFs.ReadStream {
    const pathStr = typeof path === "string" ? path : path instanceof Buffer ? path.toString() : String(path);
    const opts = typeof options === "string" ? { encoding: options } : options;
    // Use type assertion since our ReadStream has all the methods npm needs
    // but not all the complex overloaded signatures of the full Node.js interface
    return new ReadStream(pathStr, opts) as unknown as nodeFs.ReadStream;
  },

  createWriteStream(
    path: nodeFs.PathLike,
    options?: BufferEncoding | { encoding?: BufferEncoding; flags?: string; mode?: number }
  ): nodeFs.WriteStream {
    const pathStr = typeof path === "string" ? path : path instanceof Buffer ? path.toString() : String(path);
    const opts = typeof options === "string" ? { encoding: options } : options;
    // Use type assertion since our WriteStream has all the methods npm needs
    // but not all the complex overloaded signatures of the full Node.js interface
    return new WriteStream(pathStr, opts) as unknown as nodeFs.WriteStream;
  },

  // Unsupported fs APIs — watch requires kernel-level inotify, use polling instead
  watch(..._args: unknown[]): never {
    throw new Error("fs.watch is not supported in sandbox — use polling");
  },

  watchFile(..._args: unknown[]): never {
    throw new Error("fs.watchFile is not supported in sandbox — use polling");
  },

  unwatchFile(..._args: unknown[]): never {
    throw new Error("fs.unwatchFile is not supported in sandbox — use polling");
  },

  chmod(path: PathLike, mode: Mode, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.chmodSync(path, mode);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.chmodSync(path, mode));
    }
  },

  chown(path: PathLike, uid: number, gid: number, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.chownSync(path, uid, gid);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.chownSync(path, uid, gid));
    }
  },

  link(existingPath: PathLike, newPath: PathLike, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.linkSync(existingPath, newPath);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.linkSync(existingPath, newPath));
    }
  },

  symlink(target: PathLike, path: PathLike, typeOrCb?: string | null | NodeCallback<void>, callback?: NodeCallback<void>): Promise<void> | void {
    if (typeof typeOrCb === "function") {
      callback = typeOrCb;
    }
    if (callback) {
      try {
        fs.symlinkSync(target, path);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.symlinkSync(target, path));
    }
  },

  readlink(path: PathLike, optionsOrCb?: nodeFs.EncodingOption | NodeCallback<string>, callback?: NodeCallback<string>): Promise<string> | void {
    if (typeof optionsOrCb === "function") {
      callback = optionsOrCb;
    }
    if (callback) {
      try {
        callback(null, fs.readlinkSync(path));
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.readlinkSync(path));
    }
  },

  truncate(path: PathLike, lenOrCb?: number | null | NodeCallback<void>, callback?: NodeCallback<void>): Promise<void> | void {
    if (typeof lenOrCb === "function") {
      callback = lenOrCb;
      lenOrCb = 0;
    }
    if (callback) {
      try {
        fs.truncateSync(path, lenOrCb as number | null);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.truncateSync(path, lenOrCb as number | null));
    }
  },

  utimes(path: PathLike, atime: string | number | Date, mtime: string | number | Date, callback?: NodeCallback<void>): Promise<void> | void {
    if (callback) {
      try {
        fs.utimesSync(path, atime, mtime);
        callback(null);
      } catch (e) {
        callback(e as Error);
      }
    } else {
      return Promise.resolve(fs.utimesSync(path, atime, mtime));
    }
  },
};

// Wire late-bound glob helpers to the fs object
_globReadDir = (dir: string) => fs.readdirSync(dir) as string[];
_globStat = (path: string) => fs.statSync(path);

// Export the fs module
export default fs;
