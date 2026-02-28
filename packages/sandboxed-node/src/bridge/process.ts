// @ts-nocheck
// Process module polyfill for isolated-vm
// Provides Node.js process object and global polyfills for sandbox compatibility

import type * as nodeProcess from "process";

// Re-export TextEncoder/TextDecoder from polyfills (polyfills.ts is imported first in index.ts)
import { TextEncoder, TextDecoder } from "./polyfills";

// Use whatwg-url for spec-compliant URL implementation
import { URL as WhatwgURL, URLSearchParams as WhatwgURLSearchParams } from "whatwg-url";

// Use buffer package for spec-compliant Buffer implementation
import { Buffer as BufferPolyfill } from "buffer";
import {
  exposeCustomGlobal,
  exposeMutableRuntimeStateGlobal,
} from "../shared/global-exposure.js";


// Configuration interface - values are set via globals before bridge loads
export interface ProcessConfig {
  platform?: string;
  arch?: string;
  version?: string;
  cwd?: string;
  env?: Record<string, string>;
  argv?: string[];
  execPath?: string;
  pid?: number;
  ppid?: number;
  uid?: number;
  gid?: number;
  stdin?: string;
  timingMitigation?: "off" | "freeze";
  frozenTimeMs?: number;
}

// Declare config and host bridge globals
declare const _processConfig: ProcessConfig | undefined;
declare const _log: {
  applySync(ctx: undefined, args: [string]): void;
};
declare const _error: {
  applySync(ctx: undefined, args: [string]): void;
};
// Timer reference for actual delays using host's event loop
declare const _scheduleTimer: {
  apply(
    ctx: undefined,
    args: [number],
    options?: { result: { promise: true } }
  ): Promise<void>;
} | undefined;
declare const _cryptoRandomFill: {
  applySync(ctx: undefined, args: [number]): string;
} | undefined;
declare const _cryptoRandomUUID: {
  applySync(ctx: undefined, args: []): string;
} | undefined;

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
  pid:
    (typeof _processConfig !== "undefined" && _processConfig.pid) || 1,
  ppid:
    (typeof _processConfig !== "undefined" && _processConfig.ppid) || 0,
  uid:
    (typeof _processConfig !== "undefined" && _processConfig.uid) || 0,
  gid:
    (typeof _processConfig !== "undefined" && _processConfig.gid) || 0,
  timingMitigation:
    (typeof _processConfig !== "undefined" && _processConfig.timingMitigation) ||
    "off",
  frozenTimeMs:
    typeof _processConfig !== "undefined" ? _processConfig.frozenTimeMs : undefined,
};

function getNowMs(): number {
  if (
    config.timingMitigation === "freeze" &&
    typeof config.frozenTimeMs === "number"
  ) {
    return config.frozenTimeMs;
  }
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

// Start time for uptime calculation
const _processStartTime = getNowMs();

const BUFFER_MAX_LENGTH =
  typeof (BufferPolyfill as unknown as { kMaxLength?: unknown }).kMaxLength ===
  "number"
    ? ((BufferPolyfill as unknown as { kMaxLength: number }).kMaxLength as number)
    : 2147483647;
const BUFFER_MAX_STRING_LENGTH =
  typeof (BufferPolyfill as unknown as { kStringMaxLength?: unknown }).kStringMaxLength ===
  "number"
    ? ((BufferPolyfill as unknown as { kStringMaxLength: number }).kStringMaxLength as number)
    : 536870888;
const BUFFER_CONSTANTS = Object.freeze({
  MAX_LENGTH: BUFFER_MAX_LENGTH,
  MAX_STRING_LENGTH: BUFFER_MAX_STRING_LENGTH,
});

const bufferPolyfillMutable = BufferPolyfill as unknown as {
  kMaxLength?: number;
  kStringMaxLength?: number;
  constants?: Record<string, number>;
};
if (typeof bufferPolyfillMutable.kMaxLength !== "number") {
  bufferPolyfillMutable.kMaxLength = BUFFER_MAX_LENGTH;
}
if (typeof bufferPolyfillMutable.kStringMaxLength !== "number") {
  bufferPolyfillMutable.kStringMaxLength = BUFFER_MAX_STRING_LENGTH;
}
if (
  typeof bufferPolyfillMutable.constants !== "object" ||
  bufferPolyfillMutable.constants === null
) {
  bufferPolyfillMutable.constants = {
    MAX_LENGTH: BUFFER_MAX_LENGTH,
    MAX_STRING_LENGTH: BUFFER_MAX_STRING_LENGTH,
  };
}

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
exposeCustomGlobal("ProcessExitError", ProcessExitError);

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

// Stdin stream with data support
// These are exposed as globals so they can be set after bridge initialization
type StdinListener = (data: unknown) => void;
const _stdinListeners: Record<string, StdinListener[]> = {};
const _stdinOnceListeners: Record<string, StdinListener[]> = {};

// Initialize stdin state as globals for external access
exposeMutableRuntimeStateGlobal(
  "_stdinData",
  (typeof _processConfig !== "undefined" && _processConfig.stdin) || "",
);
exposeMutableRuntimeStateGlobal("_stdinPosition", 0);
exposeMutableRuntimeStateGlobal("_stdinEnded", false);
exposeMutableRuntimeStateGlobal("_stdinFlowMode", false);

// Getters for the globals
function getStdinData(): string { return (globalThis as Record<string, unknown>)._stdinData as string; }
function setStdinDataValue(v: string): void { (globalThis as Record<string, unknown>)._stdinData = v; }
function getStdinPosition(): number { return (globalThis as Record<string, unknown>)._stdinPosition as number; }
function setStdinPosition(v: number): void { (globalThis as Record<string, unknown>)._stdinPosition = v; }
function getStdinEnded(): boolean { return (globalThis as Record<string, unknown>)._stdinEnded as boolean; }
function setStdinEnded(v: boolean): void { (globalThis as Record<string, unknown>)._stdinEnded = v; }
function getStdinFlowMode(): boolean { return (globalThis as Record<string, unknown>)._stdinFlowMode as boolean; }
function setStdinFlowMode(v: boolean): void { (globalThis as Record<string, unknown>)._stdinFlowMode = v; }

function _emitStdinData(): void {
  if (getStdinEnded() || !getStdinData()) return;

  // In flowing mode, emit all remaining data
  if (getStdinFlowMode() && getStdinPosition() < getStdinData().length) {
    const chunk = getStdinData().slice(getStdinPosition());
    setStdinPosition(getStdinData().length);

    // Emit data event
    const dataListeners = [...(_stdinListeners["data"] || []), ...(_stdinOnceListeners["data"] || [])];
    _stdinOnceListeners["data"] = [];
    for (const listener of dataListeners) {
      listener(chunk);
    }

    // Emit end after all data
    setStdinEnded(true);
    const endListeners = [...(_stdinListeners["end"] || []), ...(_stdinOnceListeners["end"] || [])];
    _stdinOnceListeners["end"] = [];
    for (const listener of endListeners) {
      listener();
    }

    // Emit close
    const closeListeners = [...(_stdinListeners["close"] || []), ...(_stdinOnceListeners["close"] || [])];
    _stdinOnceListeners["close"] = [];
    for (const listener of closeListeners) {
      listener();
    }
  }
}

const _stdin = {
  readable: true,
  paused: true,
  encoding: null as string | null,

  read(size?: number): string | null {
    if (getStdinPosition() >= getStdinData().length) return null;
    const chunk = size ? getStdinData().slice(getStdinPosition(), getStdinPosition() + size) : getStdinData().slice(getStdinPosition());
    setStdinPosition(getStdinPosition() + chunk.length);
    return chunk;
  },

  on(event: string, listener: StdinListener): typeof _stdin {
    if (!_stdinListeners[event]) _stdinListeners[event] = [];
    _stdinListeners[event].push(listener);

    // When 'end' listener is added and we have data, emit everything synchronously
    // This works because typical patterns register 'data' then 'end' listeners
    if (event === "end" && getStdinData() && !getStdinEnded()) {
      setStdinFlowMode(true);
      // Emit synchronously - all listeners should be registered by now
      _emitStdinData();
    }
    return this;
  },

  once(event: string, listener: StdinListener): typeof _stdin {
    if (!_stdinOnceListeners[event]) _stdinOnceListeners[event] = [];
    _stdinOnceListeners[event].push(listener);
    return this;
  },

  off(event: string, listener: StdinListener): typeof _stdin {
    if (_stdinListeners[event]) {
      const idx = _stdinListeners[event].indexOf(listener);
      if (idx !== -1) _stdinListeners[event].splice(idx, 1);
    }
    return this;
  },

  removeListener(event: string, listener: StdinListener): typeof _stdin {
    return this.off(event, listener);
  },

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = [...(_stdinListeners[event] || []), ...(_stdinOnceListeners[event] || [])];
    _stdinOnceListeners[event] = [];
    for (const listener of listeners) {
      listener(args[0]);
    }
    return listeners.length > 0;
  },

  pause(): typeof _stdin {
    this.paused = true;
    setStdinFlowMode(false);
    return this;
  },

  resume(): typeof _stdin {
    this.paused = false;
    setStdinFlowMode(true);
    _emitStdinData();
    return this;
  },

  setEncoding(enc: string): typeof _stdin {
    this.encoding = enc;
    return this;
  },

  isTTY: false,

  // For readline compatibility
  [Symbol.asyncIterator]: async function* () {
    const lines = getStdinData().split("\n");
    for (const line of lines) {
      if (line) yield line;
    }
  },
};

// hrtime function with bigint method
function hrtime(prev?: [number, number]): [number, number] {
  const now = getNowMs();
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
  const now = getNowMs();
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
  pid: config.pid,
  ppid: config.ppid,
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
    return config.uid;
  },
  getgid(): number {
    return config.gid;
  },
  geteuid(): number {
    return config.uid;
  },
  getegid(): number {
    return config.gid;
  },
  getgroups(): number[] {
    return [config.gid];
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
    return (getNowMs() - _processStartTime) / 1000;
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
      buffer: {
        Buffer: (globalThis as Record<string, unknown>).Buffer,
        constants: BUFFER_CONSTANTS,
        kMaxLength: BUFFER_MAX_LENGTH,
        kStringMaxLength: BUFFER_MAX_STRING_LENGTH,
      },
      process_wrap: {},
      natives: {},
      config: {},
      uv: { UV_UDP_REUSEADDR: 4 },
      constants: {
        MAX_LENGTH: BUFFER_MAX_LENGTH,
        MAX_STRING_LENGTH: BUFFER_MAX_STRING_LENGTH,
        buffer: BUFFER_CONSTANTS,
      },
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
  delay?: number,
  ...args: unknown[]
): TimerHandle {
  const id = ++_timerId;
  const handle = new TimerHandle(id);
  _timers.set(id, handle);

  const actualDelay = delay ?? 0;

  // Use host timer for actual delays if available and delay > 0
  if (typeof _scheduleTimer !== "undefined" && actualDelay > 0) {
    // _scheduleTimer.apply() returns a Promise that resolves after the delay
    // Using { result: { promise: true } } tells isolated-vm to wait for the
    // host Promise to resolve before resolving the apply() Promise
    _scheduleTimer
      .apply(undefined, [actualDelay], { result: { promise: true } })
      .then(() => {
        if (_timers.has(id)) {
          _timers.delete(id);
          try {
            callback(...args);
          } catch (_e) {
            // Ignore timer callback errors
          }
        }
      });
  } else {
    // Use microtask for zero delay or when host timer is unavailable
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
  }

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
  delay?: number,
  ...args: unknown[]
): TimerHandle {
  const id = ++_timerId;
  const handle = new TimerHandle(id);
  _intervals.set(id, handle);

  const actualDelay = delay ?? 0;

  // Schedule interval execution
  const scheduleNext = () => {
    if (!_intervals.has(id)) return; // Interval was cleared

    if (typeof _scheduleTimer !== "undefined" && actualDelay > 0) {
      // Use host timer for actual delays
      _scheduleTimer
        .apply(undefined, [actualDelay], { result: { promise: true } })
        .then(() => {
          if (_intervals.has(id)) {
            try {
              callback(...args);
            } catch (_e) {
              // Ignore timer callback errors
            }
            // Schedule next iteration
            scheduleNext();
          }
        });
    } else {
      // Use microtask for zero delay or when host timer unavailable
      _queueMicrotask(() => {
        if (_intervals.has(id)) {
          try {
            callback(...args);
          } catch (_e) {
            // Ignore timer callback errors
          }
          // Schedule next iteration
          scheduleNext();
        }
      });
    }
  };

  // Start the interval
  scheduleNext();

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

// URL and URLSearchParams - use whatwg-url for spec-compliant implementation
export const URL = WhatwgURL;
export const URLSearchParams = WhatwgURLSearchParams;

// TextEncoder and TextDecoder - re-export from polyfills
export { TextEncoder, TextDecoder };

// Buffer - use buffer package polyfill
export const Buffer = BufferPolyfill;

function throwUnsupportedCryptoApi(api: "getRandomValues" | "randomUUID"): never {
  throw new Error(`crypto.${api} is not supported in sandbox`);
}

// Crypto polyfill
export const cryptoPolyfill = {
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    if (typeof _cryptoRandomFill === "undefined") {
      throwUnsupportedCryptoApi("getRandomValues");
    }
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength
    );
    try {
      const base64 = _cryptoRandomFill.applySync(undefined, [bytes.byteLength]);
      const hostBytes = BufferPolyfill.from(base64, "base64");
      if (hostBytes.byteLength !== bytes.byteLength) {
        throw new Error("invalid host entropy size");
      }
      bytes.set(hostBytes);
      return array;
    } catch {
      throwUnsupportedCryptoApi("getRandomValues");
    }
  },

  randomUUID(): string {
    if (typeof _cryptoRandomUUID === "undefined") {
      throwUnsupportedCryptoApi("randomUUID");
    }
    try {
      const uuid = _cryptoRandomUUID.applySync(undefined, []);
      if (typeof uuid !== "string") {
        throw new Error("invalid host uuid");
      }
      return uuid;
    } catch {
      throwUnsupportedCryptoApi("randomUUID");
    }
  },

  subtle: {
    digest(): Promise<ArrayBuffer> {
      throw new Error("crypto.subtle.digest is not supported in sandbox");
    },
    encrypt(): Promise<ArrayBuffer> {
      throw new Error("crypto.subtle.encrypt is not supported in sandbox");
    },
    decrypt(): Promise<ArrayBuffer> {
      throw new Error("crypto.subtle.decrypt is not supported in sandbox");
    },
  },
};

// Setup globals function - call this to install polyfills on globalThis
export function setupGlobals(): void {
  const g = globalThis as Record<string, unknown>;

  // Process - simple assignment is sufficient since we use external: ["process"]
  // in polyfills.ts, which prevents node-stdlib-browser's process shim from being
  // bundled and overwriting our process object.
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
  const globalBuffer = g.Buffer as Record<string, unknown>;
  if (typeof globalBuffer.kMaxLength !== "number") {
    globalBuffer.kMaxLength = BUFFER_MAX_LENGTH;
  }
  if (typeof globalBuffer.kStringMaxLength !== "number") {
    globalBuffer.kStringMaxLength = BUFFER_MAX_STRING_LENGTH;
  }
  if (
    typeof globalBuffer.constants !== "object" ||
    globalBuffer.constants === null
  ) {
    globalBuffer.constants = BUFFER_CONSTANTS;
  }

  // Crypto
  if (typeof g.crypto === "undefined") {
    g.crypto = cryptoPolyfill;
  } else {
    const cryptoObj = g.crypto as Record<string, unknown>;
    if (typeof cryptoObj.getRandomValues === "undefined") {
      cryptoObj.getRandomValues = cryptoPolyfill.getRandomValues;
    }
    if (typeof cryptoObj.randomUUID === "undefined") {
      cryptoObj.randomUUID = cryptoPolyfill.randomUUID;
    }
  }
}
