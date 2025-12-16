// Process module polyfill for isolated-vm
// Provides Node.js process object and global polyfills for sandbox compatibility

import type * as nodeProcess from "process";

// Configuration interface - values are set via globals before bridge loads
export interface ProcessConfig {
  platform?: string;
  arch?: string;
  version?: string;
  cwd?: string;
  env?: Record<string, string>;
  argv?: string[];
  execPath?: string;
}

// Declare config and host bridge globals
declare const _processConfig: ProcessConfig | undefined;
declare const _log: {
  applySync(ctx: undefined, args: [string]): void;
};
declare const _error: {
  applySync(ctx: undefined, args: [string]): void;
};

// Get config with defaults
const config = {
  platform:
    (typeof _processConfig !== "undefined" && _processConfig.platform) ||
    "linux",
  arch:
    (typeof _processConfig !== "undefined" && _processConfig.arch) || "x64",
  version:
    (typeof _processConfig !== "undefined" && _processConfig.version) ||
    "v22.0.0",
  cwd: (typeof _processConfig !== "undefined" && _processConfig.cwd) || "/",
  env: (typeof _processConfig !== "undefined" && _processConfig.env) || {},
  argv:
    (typeof _processConfig !== "undefined" && _processConfig.argv) || [
      "node",
      "script.js",
    ],
  execPath:
    (typeof _processConfig !== "undefined" && _processConfig.execPath) ||
    "/usr/bin/node",
};

// Start time for uptime calculation
const _processStartTime = Date.now();

// Exit code tracking
let _exitCode = 0;
let _exited = false;

// ProcessExitError class for controlled exits
export class ProcessExitError extends Error {
  code: number;
  constructor(code: number) {
    super("process.exit(" + code + ")");
    this.name = "ProcessExitError";
    this.code = code;
  }
}

// Make available globally
(globalThis as Record<string, unknown>).ProcessExitError = ProcessExitError;

// EventEmitter implementation for process
type EventListener = (...args: unknown[]) => void;
const _processListeners: Record<string, EventListener[]> = {};
const _processOnceListeners: Record<string, EventListener[]> = {};

function _addListener(
  event: string,
  listener: EventListener,
  once = false
): typeof process {
  const target = once ? _processOnceListeners : _processListeners;
  if (!target[event]) {
    target[event] = [];
  }
  target[event].push(listener);
  return process;
}

function _removeListener(
  event: string,
  listener: EventListener
): typeof process {
  if (_processListeners[event]) {
    const idx = _processListeners[event].indexOf(listener);
    if (idx !== -1) _processListeners[event].splice(idx, 1);
  }
  if (_processOnceListeners[event]) {
    const idx = _processOnceListeners[event].indexOf(listener);
    if (idx !== -1) _processOnceListeners[event].splice(idx, 1);
  }
  return process;
}

function _emit(event: string, ...args: unknown[]): boolean {
  let handled = false;

  // Regular listeners
  if (_processListeners[event]) {
    for (const listener of _processListeners[event]) {
      listener(...args);
      handled = true;
    }
  }

  // Once listeners (remove after calling)
  if (_processOnceListeners[event]) {
    const listeners = _processOnceListeners[event].slice();
    _processOnceListeners[event] = [];
    for (const listener of listeners) {
      listener(...args);
      handled = true;
    }
  }

  return handled;
}

// Stdout stream
const _stdout = {
  write(data: unknown): boolean {
    if (typeof _log !== "undefined") {
      _log.applySync(undefined, [String(data).replace(/\n$/, "")]);
    }
    return true;
  },
  end(): typeof _stdout {
    return this;
  },
  on(): typeof _stdout {
    return this;
  },
  once(): typeof _stdout {
    return this;
  },
  emit(): boolean {
    return false;
  },
  writable: true,
  isTTY: false,
  columns: 80,
  rows: 24,
};

// Stderr stream
const _stderr = {
  write(data: unknown): boolean {
    if (typeof _error !== "undefined") {
      _error.applySync(undefined, [String(data).replace(/\n$/, "")]);
    }
    return true;
  },
  end(): typeof _stderr {
    return this;
  },
  on(): typeof _stderr {
    return this;
  },
  once(): typeof _stderr {
    return this;
  },
  emit(): boolean {
    return false;
  },
  writable: true,
  isTTY: false,
  columns: 80,
  rows: 24,
};

// Stdin stream
const _stdin = {
  readable: true,
  paused: true,
  encoding: null as string | null,
  read(): null {
    return null;
  },
  on(): typeof _stdin {
    return this;
  },
  once(): typeof _stdin {
    return this;
  },
  emit(): boolean {
    return false;
  },
  pause(): typeof _stdin {
    this.paused = true;
    return this;
  },
  resume(): typeof _stdin {
    this.paused = false;
    return this;
  },
  setEncoding(enc: string): typeof _stdin {
    this.encoding = enc;
    return this;
  },
  isTTY: false,
};

// hrtime function with bigint method
function hrtime(prev?: [number, number]): [number, number] {
  const now =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  const seconds = Math.floor(now / 1000);
  const nanoseconds = Math.floor((now % 1000) * 1e6);

  if (prev) {
    let diffSec = seconds - prev[0];
    let diffNano = nanoseconds - prev[1];
    if (diffNano < 0) {
      diffSec -= 1;
      diffNano += 1e9;
    }
    return [diffSec, diffNano];
  }

  return [seconds, nanoseconds];
}

hrtime.bigint = function (): bigint {
  const now =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  return BigInt(Math.floor(now * 1e6));
};

// Internal state
let _cwd = config.cwd;
let _umask = 0o022;

// The process object
const process: Partial<typeof nodeProcess> & {
  stdout: typeof _stdout;
  stderr: typeof _stderr;
  stdin: typeof _stdin;
  _cwd: string;
  _umask: number;
} = {
  // Static properties
  platform: config.platform as NodeJS.Platform,
  arch: config.arch as NodeJS.Architecture,
  version: config.version,
  versions: {
    node: config.version.replace(/^v/, ""),
    v8: "11.3.244.8",
    uv: "1.44.2",
    zlib: "1.2.13",
    brotli: "1.0.9",
    ares: "1.19.0",
    modules: "108",
    nghttp2: "1.52.0",
    napi: "8",
    llhttp: "8.1.0",
    openssl: "3.0.8",
    cldr: "42.0",
    icu: "72.1",
    tz: "2022g",
    unicode: "15.0",
  },
  pid: 1,
  ppid: 0,
  execPath: config.execPath,
  execArgv: [],
  argv: config.argv,
  argv0: config.argv[0] || "node",
  title: "node",
  env: config.env,

  // Config stubs
  config: {
    target_defaults: {
      cflags: [],
      default_configuration: "Release",
      defines: [],
      include_dirs: [],
      libraries: [],
    },
    variables: {
      node_prefix: "/usr",
      node_shared_libuv: false,
    },
  },

  release: {
    name: "node",
    sourceUrl:
      "https://nodejs.org/download/release/v20.0.0/node-v20.0.0.tar.gz",
    headersUrl:
      "https://nodejs.org/download/release/v20.0.0/node-v20.0.0-headers.tar.gz",
  },

  // Feature flags
  features: {
    inspector: false,
    debug: false,
    uv: true,
    ipv6: true,
    tls_alpn: true,
    tls_sni: true,
    tls_ocsp: true,
    tls: true,
  },

  // Methods
  cwd(): string {
    return _cwd;
  },

  chdir(dir: string): void {
    _cwd = dir;
  },

  get exitCode(): number | undefined {
    return _exitCode;
  },

  set exitCode(code: number | undefined) {
    _exitCode = code ?? 0;
  },

  exit(code?: number): never {
    const exitCode = code !== undefined ? code : _exitCode;
    _exitCode = exitCode;
    _exited = true;

    // Fire exit event
    try {
      _emit("exit", exitCode);
    } catch (_e) {
      // Ignore errors in exit handlers
    }

    // Throw to stop execution
    throw new ProcessExitError(exitCode);
  },

  abort(): never {
    return process.exit!(1);
  },

  nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => callback(...args));
    } else {
      Promise.resolve().then(() => callback(...args));
    }
  },

  hrtime: hrtime as typeof nodeProcess.hrtime,

  getuid(): number {
    return 0;
  },
  getgid(): number {
    return 0;
  },
  geteuid(): number {
    return 0;
  },
  getegid(): number {
    return 0;
  },
  getgroups(): number[] {
    return [0];
  },

  setuid(): void {},
  setgid(): void {},
  seteuid(): void {},
  setegid(): void {},
  setgroups(): void {},

  umask(mask?: number): number {
    const oldMask = _umask;
    if (mask !== undefined) {
      _umask = mask;
    }
    return oldMask;
  },

  uptime(): number {
    return (Date.now() - _processStartTime) / 1000;
  },

  memoryUsage(): NodeJS.MemoryUsage {
    return {
      rss: 50 * 1024 * 1024,
      heapTotal: 20 * 1024 * 1024,
      heapUsed: 10 * 1024 * 1024,
      external: 1 * 1024 * 1024,
      arrayBuffers: 500 * 1024,
    };
  },

  cpuUsage(prev?: NodeJS.CpuUsage): NodeJS.CpuUsage {
    const usage = {
      user: 1000000,
      system: 500000,
    };

    if (prev) {
      return {
        user: usage.user - prev.user,
        system: usage.system - prev.system,
      };
    }

    return usage;
  },

  resourceUsage(): NodeJS.ResourceUsage {
    return {
      userCPUTime: 1000000,
      systemCPUTime: 500000,
      maxRSS: 50 * 1024,
      sharedMemorySize: 0,
      unsharedDataSize: 0,
      unsharedStackSize: 0,
      minorPageFault: 0,
      majorPageFault: 0,
      swappedOut: 0,
      fsRead: 0,
      fsWrite: 0,
      ipcSent: 0,
      ipcReceived: 0,
      signalsCount: 0,
      voluntaryContextSwitches: 0,
      involuntaryContextSwitches: 0,
    };
  },

  kill(pid: number, signal?: string | number): true {
    if (pid !== process.pid) {
      const err = new Error("Operation not permitted") as NodeJS.ErrnoException;
      err.code = "EPERM";
      err.errno = -1;
      err.syscall = "kill";
      throw err;
    }
    // Self-kill - treat as exit
    if (!signal || signal === "SIGTERM" || signal === 15) {
      process.exit!(143);
    }
    return true;
  },

  // EventEmitter methods
  on(event: string, listener: EventListener): typeof process {
    return _addListener(event, listener);
  },

  once(event: string, listener: EventListener): typeof process {
    return _addListener(event, listener, true);
  },

  removeListener(event: string, listener: EventListener): typeof process {
    return _removeListener(event, listener);
  },

  // off is an alias for removeListener (assigned below to be same reference)
  off: null as unknown as (event: string, listener: EventListener) => typeof process,

  removeAllListeners(event?: string): typeof process {
    if (event) {
      delete _processListeners[event];
      delete _processOnceListeners[event];
    } else {
      Object.keys(_processListeners).forEach((k) => delete _processListeners[k]);
      Object.keys(_processOnceListeners).forEach(
        (k) => delete _processOnceListeners[k]
      );
    }
    return process;
  },

  addListener(event: string, listener: EventListener): typeof process {
    return _addListener(event, listener);
  },

  emit(event: string, ...args: unknown[]): boolean {
    return _emit(event, ...args);
  },

  listeners(event: string): EventListener[] {
    return [
      ...(_processListeners[event] || []),
      ...(_processOnceListeners[event] || []),
    ];
  },

  listenerCount(event: string): number {
    return (
      (_processListeners[event] || []).length +
      (_processOnceListeners[event] || []).length
    );
  },

  prependListener(event: string, listener: EventListener): typeof process {
    if (!_processListeners[event]) {
      _processListeners[event] = [];
    }
    _processListeners[event].unshift(listener);
    return process;
  },

  prependOnceListener(event: string, listener: EventListener): typeof process {
    if (!_processOnceListeners[event]) {
      _processOnceListeners[event] = [];
    }
    _processOnceListeners[event].unshift(listener);
    return process;
  },

  eventNames(): (string | symbol)[] {
    return [
      ...new Set([
        ...Object.keys(_processListeners),
        ...Object.keys(_processOnceListeners),
      ]),
    ];
  },

  setMaxListeners(): typeof process {
    return process;
  },
  getMaxListeners(): number {
    return 10;
  },
  rawListeners(event: string): EventListener[] {
    return process.listeners!(event);
  },

  // Stdio streams
  stdout: _stdout as unknown as typeof nodeProcess.stdout,
  stderr: _stderr as unknown as typeof nodeProcess.stderr,
  stdin: _stdin as unknown as typeof nodeProcess.stdin,

  // Process state
  connected: false,

  // Module info (will be set by createRequire)
  mainModule: undefined,

  // No-op methods for compatibility
  emitWarning(warning: string | Error): void {
    const msg = typeof warning === "string" ? warning : warning.message;
    _emit("warning", { message: msg, name: "Warning" });
  },

  binding(name: string): Record<string, unknown> {
    // Return stub implementations for common bindings
    const stubs: Record<string, Record<string, unknown>> = {
      fs: {},
      buffer: { Buffer: (globalThis as Record<string, unknown>).Buffer },
      process_wrap: {},
      natives: {},
      config: {},
      uv: { UV_UDP_REUSEADDR: 4 },
      constants: {},
      crypto: {},
      string_decoder: {},
      os: {},
    };
    return stubs[name] || {};
  },

  _linkedBinding(name: string): Record<string, unknown> {
    return process.binding!(name);
  },

  dlopen(): void {
    throw new Error("process.dlopen is not supported");
  },

  hasUncaughtExceptionCaptureCallback(): boolean {
    return false;
  },
  setUncaughtExceptionCaptureCallback(): void {},

  // Send for IPC (no-op)
  send(): boolean {
    return false;
  },
  disconnect(): void {},

  // Report
  report: {
    directory: "",
    filename: "",
    compact: false,
    signal: "SIGUSR2",
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport(): Record<string, unknown> {
      return {};
    },
    writeReport(): string {
      return "";
    },
  },

  // Debug port
  debugPort: 9229,

  // Internal state
  _cwd: config.cwd,
  _umask: 0o022,
};

// Make process.off === process.removeListener (same function reference)
process.off = process.removeListener;

// Add memoryUsage.rss
(process.memoryUsage as unknown as Record<string, () => number>).rss =
  function (): number {
    return 50 * 1024 * 1024;
  };

export default process;

// ============================================================================
// Global polyfills
// ============================================================================

// Timer implementation
let _timerId = 0;
const _timers = new Map<number, TimerHandle>();
const _intervals = new Map<number, TimerHandle>();

// queueMicrotask fallback
const _queueMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : function (fn: () => void): void {
        Promise.resolve().then(fn);
      };

// Timer handle class that mimics Node.js Timeout object
class TimerHandle {
  _id: number;
  _destroyed: boolean;
  constructor(id: number) {
    this._id = id;
    this._destroyed = false;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
  hasRef(): boolean {
    return true;
  }
  refresh(): this {
    return this;
  }
  [Symbol.toPrimitive](): number {
    return this._id;
  }
}

export function setTimeout(
  callback: (...args: unknown[]) => void,
  _delay?: number,
  ...args: unknown[]
): TimerHandle {
  const id = ++_timerId;
  const handle = new TimerHandle(id);
  _queueMicrotask(() => {
    if (_timers.has(id)) {
      _timers.delete(id);
      try {
        callback(...args);
      } catch (_e) {
        // Ignore timer callback errors
      }
    }
  });
  _timers.set(id, handle);
  return handle;
}

export function clearTimeout(timer: TimerHandle | number | undefined): void {
  const id =
    timer && typeof timer === "object" && timer._id !== undefined
      ? timer._id
      : (timer as number);
  _timers.delete(id);
}

export function setInterval(
  callback: (...args: unknown[]) => void,
  _delay?: number,
  ...args: unknown[]
): TimerHandle {
  const id = ++_timerId;
  const handle = new TimerHandle(id);
  _intervals.set(id, handle);
  _queueMicrotask(() => {
    if (_intervals.has(id)) {
      try {
        callback(...args);
      } catch (_e) {
        // Ignore timer callback errors
      }
    }
  });
  return handle;
}

export function clearInterval(timer: TimerHandle | number | undefined): void {
  const id =
    timer && typeof timer === "object" && timer._id !== undefined
      ? timer._id
      : (timer as number);
  _intervals.delete(id);
}

export function setImmediate(
  callback: (...args: unknown[]) => void,
  ...args: unknown[]
): TimerHandle {
  return setTimeout(callback, 0, ...args);
}

export function clearImmediate(id: TimerHandle | number | undefined): void {
  clearTimeout(id);
}

// URL polyfill
export class URL {
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  searchParams: URLSearchParams;

  constructor(url: string | URL, base?: string | URL) {
    let urlStr =
      typeof url === "object" && url !== null && typeof url.toString === "function"
        ? url.toString()
        : String(url);
    let fullUrl = urlStr;

    if (base) {
      const baseStr =
        typeof base === "object" && base !== null && typeof base.toString === "function"
          ? base.toString()
          : String(base);

      let isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr);

      // Special case: "file:" without "//" is a relative file reference
      if (urlStr.startsWith("file:") && !urlStr.startsWith("file://")) {
        isAbsolute = false;
        urlStr = urlStr.slice(5);
      }

      if (!isAbsolute) {
        if (baseStr.startsWith("file://")) {
          let basePath = baseStr.slice(7);
          let resolvedPath: string;
          if (urlStr.startsWith("/")) {
            resolvedPath = urlStr;
          } else {
            let baseDir = basePath;
            if (!baseDir.endsWith("/")) {
              const lastSlash = baseDir.lastIndexOf("/");
              baseDir = lastSlash >= 0 ? baseDir.slice(0, lastSlash + 1) : "/";
            }
            const combined = baseDir + urlStr;
            const parts = combined.split("/");
            const normalized: string[] = [];
            for (const part of parts) {
              if (part === "..") {
                normalized.pop();
              } else if (part !== "." && part !== "") {
                normalized.push(part);
              }
            }
            resolvedPath = "/" + normalized.join("/");
          }
          fullUrl = "file://" + resolvedPath;
        } else {
          const baseUrl = new URL(baseStr);
          if (urlStr.startsWith("/")) {
            fullUrl = baseUrl.origin + urlStr;
          } else {
            fullUrl = baseStr.replace(/[^/]*$/, "") + urlStr;
          }
        }
      }
    }

    // Parse HTTP/HTTPS URLs
    let match = fullUrl.match(
      /^(https?:)\/\/([^/:]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/
    );

    if (!match) {
      // Try file:// URLs (full form)
      const fileMatch = fullUrl.match(/^file:\/\/(\/?[^?#]*)?(\?[^#]*)?(#.*)?$/);
      if (fileMatch) {
        this.protocol = "file:";
        this.host = "";
        this.hostname = "";
        this.port = "";
        this.pathname = fileMatch[1] || "/";
        this.search = fileMatch[2] || "";
        this.hash = fileMatch[3] || "";
        this.origin = "null";
        this.href = "file://" + this.pathname + this.search + this.hash;
        this.searchParams = new URLSearchParams(this.search);
        return;
      }

      // Try bare "file:" or "file:path" (without //)
      const bareFileMatch = fullUrl.match(/^file:(\/?[^?#]*)?(\?[^#]*)?(#.*)?$/);
      if (bareFileMatch) {
        this.protocol = "file:";
        this.host = "";
        this.hostname = "";
        this.port = "";
        this.pathname = bareFileMatch[1] || "/";
        this.search = bareFileMatch[2] || "";
        this.hash = bareFileMatch[3] || "";
        this.origin = "null";
        this.href = "file://" + this.pathname + this.search + this.hash;
        this.searchParams = new URLSearchParams(this.search);
        return;
      }

      throw new TypeError("Invalid URL: " + urlStr);
    }

    this.href = fullUrl;
    this.protocol = match[1] || "";
    this.host = match[2] + (match[3] ? ":" + match[3] : "");
    this.hostname = match[2] || "";
    this.port = match[3] || "";
    this.pathname = match[4] || "/";
    this.search = match[5] || "";
    this.hash = match[6] || "";
    this.origin = this.protocol + "//" + this.host;
    this.searchParams = new URLSearchParams(this.search);
  }

  toString(): string {
    return this.href;
  }
  toJSON(): string {
    return this.href;
  }
}

// URLSearchParams polyfill
export class URLSearchParams {
  private _params: Map<string, string>;

  constructor(init?: string | Record<string, string> | URLSearchParams) {
    this._params = new Map();
    if (typeof init === "string") {
      const params = init.startsWith("?") ? init.slice(1) : init;
      for (const pair of params.split("&")) {
        const [key, value] = pair.split("=").map(decodeURIComponent);
        if (key) this._params.set(key, value || "");
      }
    } else if (init && typeof init === "object") {
      if (init instanceof URLSearchParams) {
        for (const [key, value] of init.entries()) {
          this._params.set(key, value);
        }
      } else {
        for (const [key, value] of Object.entries(init)) {
          this._params.set(key, value);
        }
      }
    }
  }

  get(key: string): string | null {
    return this._params.get(key) || null;
  }
  set(key: string, value: string): void {
    this._params.set(key, value);
  }
  has(key: string): boolean {
    return this._params.has(key);
  }
  delete(key: string): void {
    this._params.delete(key);
  }
  append(key: string, value: string): void {
    this._params.set(key, value);
  }
  toString(): string {
    return Array.from(this._params.entries())
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("&");
  }
  *entries(): IterableIterator<[string, string]> {
    yield* this._params.entries();
  }
  *keys(): IterableIterator<string> {
    yield* this._params.keys();
  }
  *values(): IterableIterator<string> {
    yield* this._params.values();
  }
  forEach(
    cb: (value: string, key: string, parent: URLSearchParams) => void
  ): void {
    this._params.forEach((value, key) => cb(value, key, this));
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this._params[Symbol.iterator]();
  }
}

// TextEncoder polyfill
export class TextEncoder {
  readonly encoding = "utf-8";

  encode(str: string): Uint8Array {
    const utf8: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let charCode = str.charCodeAt(i);
      if (charCode < 0x80) {
        utf8.push(charCode);
      } else if (charCode < 0x800) {
        utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
      } else if (charCode < 0xd800 || charCode >= 0xe000) {
        utf8.push(
          0xe0 | (charCode >> 12),
          0x80 | ((charCode >> 6) & 0x3f),
          0x80 | (charCode & 0x3f)
        );
      } else {
        // surrogate pair
        i++;
        charCode =
          0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        utf8.push(
          0xf0 | (charCode >> 18),
          0x80 | ((charCode >> 12) & 0x3f),
          0x80 | ((charCode >> 6) & 0x3f),
          0x80 | (charCode & 0x3f)
        );
      }
    }
    return new Uint8Array(utf8);
  }

  encodeInto(
    str: string,
    dest: Uint8Array
  ): { read: number; written: number } {
    const encoded = this.encode(str);
    const len = Math.min(encoded.length, dest.length);
    dest.set(encoded.subarray(0, len));
    return { read: str.length, written: len };
  }
}

// TextDecoder polyfill
export class TextDecoder {
  private _encoding: string;

  constructor(encoding?: string) {
    this._encoding = encoding || "utf-8";
  }

  get encoding(): string {
    return this._encoding;
  }

  decode(input?: BufferSource): string {
    if (!input) return "";
    const bytes =
      input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
    let result = "";
    let i = 0;
    while (i < bytes.length) {
      const byte = bytes[i];
      if (byte < 0x80) {
        result += String.fromCharCode(byte);
        i++;
      } else if ((byte & 0xe0) === 0xc0) {
        result += String.fromCharCode(
          ((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f)
        );
        i += 2;
      } else if ((byte & 0xf0) === 0xe0) {
        result += String.fromCharCode(
          ((byte & 0x0f) << 12) |
            ((bytes[i + 1] & 0x3f) << 6) |
            (bytes[i + 2] & 0x3f)
        );
        i += 3;
      } else if ((byte & 0xf8) === 0xf0) {
        const codePoint =
          ((byte & 0x07) << 18) |
          ((bytes[i + 1] & 0x3f) << 12) |
          ((bytes[i + 2] & 0x3f) << 6) |
          (bytes[i + 3] & 0x3f);
        // Convert to surrogate pair
        const offset = codePoint - 0x10000;
        result += String.fromCharCode(
          0xd800 + (offset >> 10),
          0xdc00 + (offset & 0x3ff)
        );
        i += 4;
      } else {
        result += "?";
        i++;
      }
    }
    return result;
  }
}

// Buffer polyfill
export class Buffer extends Uint8Array {
  static isBuffer(obj: unknown): obj is Buffer {
    return obj instanceof Buffer || obj instanceof Uint8Array;
  }

  static from(
    value: string | ArrayBuffer | ArrayLike<number> | ArrayBufferView,
    _encodingOrOffset?: BufferEncoding | number,
    _length?: number
  ): Buffer {
    if (typeof value === "string") {
      const encoder = new TextEncoder();
      const arr = encoder.encode(value);
      return new Buffer(arr);
    }
    if (ArrayBuffer.isView(value)) {
      return new Buffer(value.buffer, value.byteOffset, value.byteLength);
    }
    if (value instanceof ArrayBuffer) {
      return new Buffer(value);
    }
    if (Array.isArray(value)) {
      return new Buffer(value);
    }
    return new Buffer(0);
  }

  static alloc(size: number, fill?: number | string, _encoding?: BufferEncoding): Buffer {
    const buf = new Buffer(size);
    if (fill !== undefined) {
      buf.fill(typeof fill === "number" ? fill : 0);
    }
    return buf;
  }

  static allocUnsafe(size: number): Buffer {
    return new Buffer(size);
  }

  static concat(list: Uint8Array[], totalLength?: number): Buffer {
    if (totalLength === undefined) {
      totalLength = list.reduce((acc, buf) => acc + buf.length, 0);
    }
    const result = new Buffer(totalLength);
    let offset = 0;
    for (const buf of list) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  static byteLength(string: string | Buffer, _encoding?: BufferEncoding): number {
    if (typeof string !== "string") {
      return string.length;
    }
    const encoder = new TextEncoder();
    return encoder.encode(string).length;
  }

  toString(encoding?: BufferEncoding, start?: number, end?: number): string {
    const decoder = new TextDecoder(
      encoding === "utf8" || encoding === "utf-8" ? "utf-8" : "utf-8"
    );
    const slice =
      start !== undefined || end !== undefined
        ? this.subarray(start || 0, end)
        : this;
    return decoder.decode(slice);
  }

  write(
    string: string,
    offset?: number,
    length?: number,
    _encoding?: BufferEncoding
  ): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(string);
    const writeLen = Math.min(
      bytes.length,
      length !== undefined ? length : this.length - (offset || 0)
    );
    this.set(bytes.subarray(0, writeLen), offset || 0);
    return writeLen;
  }

  copy(
    target: Uint8Array,
    targetStart?: number,
    sourceStart?: number,
    sourceEnd?: number
  ): number {
    targetStart = targetStart || 0;
    sourceStart = sourceStart || 0;
    sourceEnd = sourceEnd || this.length;
    const bytes = this.subarray(sourceStart, sourceEnd);
    target.set(bytes, targetStart);
    return bytes.length;
  }

  slice(start?: number, end?: number): Buffer {
    return new Buffer(
      this.buffer,
      this.byteOffset + (start || 0),
      (end !== undefined ? end : this.length) - (start || 0)
    );
  }

  equals(other: Uint8Array): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false;
    }
    return true;
  }

  compare(other: Uint8Array): number {
    const len = Math.min(this.length, other.length);
    for (let i = 0; i < len; i++) {
      if (this[i] < other[i]) return -1;
      if (this[i] > other[i]) return 1;
    }
    if (this.length < other.length) return -1;
    if (this.length > other.length) return 1;
    return 0;
  }

  fill(value: number, start?: number, end?: number, _encoding?: BufferEncoding): this {
    start = start || 0;
    end = end !== undefined ? end : this.length;
    const fillValue = typeof value === "number" ? value : 0;
    for (let i = start; i < end; i++) {
      this[i] = fillValue;
    }
    return this;
  }
}

// Crypto polyfill
export const cryptoPolyfill = {
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength
    );
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },

  randomUUID(): string {
    const bytes = new Uint8Array(16);
    cryptoPolyfill.getRandomValues(bytes);
    // Set version (4) and variant (RFC4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  },

  subtle: {
    digest(): Promise<ArrayBuffer> {
      throw new Error("crypto.subtle.digest not supported in sandbox");
    },
    encrypt(): Promise<ArrayBuffer> {
      throw new Error("crypto.subtle.encrypt not supported in sandbox");
    },
    decrypt(): Promise<ArrayBuffer> {
      throw new Error("crypto.subtle.decrypt not supported in sandbox");
    },
  },
};

// Setup globals function - call this to install polyfills on globalThis
export function setupGlobals(): void {
  const g = globalThis as Record<string, unknown>;

  // Process
  g.process = process;

  // Timers
  g.setTimeout = setTimeout;
  g.clearTimeout = clearTimeout;
  g.setInterval = setInterval;
  g.clearInterval = clearInterval;
  g.setImmediate = setImmediate;
  g.clearImmediate = clearImmediate;

  // queueMicrotask
  if (typeof g.queueMicrotask === "undefined") {
    g.queueMicrotask = _queueMicrotask;
  }

  // URL
  if (typeof g.URL === "undefined") {
    g.URL = URL;
  }

  if (typeof g.URLSearchParams === "undefined") {
    g.URLSearchParams = URLSearchParams;
  }

  // TextEncoder/TextDecoder
  if (typeof g.TextEncoder === "undefined") {
    g.TextEncoder = TextEncoder;
  }

  if (typeof g.TextDecoder === "undefined") {
    g.TextDecoder = TextDecoder;
  }

  // Buffer
  if (typeof g.Buffer === "undefined") {
    g.Buffer = Buffer;
  }

  // Crypto
  if (typeof g.crypto === "undefined") {
    g.crypto = cryptoPolyfill;
  } else if (typeof (g.crypto as Record<string, unknown>).getRandomValues === "undefined") {
    (g.crypto as Record<string, unknown>).getRandomValues =
      cryptoPolyfill.getRandomValues;
    (g.crypto as Record<string, unknown>).randomUUID = cryptoPolyfill.randomUUID;
  }
}
