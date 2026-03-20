// Process module polyfill for isolated-vm
// Provides Node.js process object and global polyfills for sandbox compatibility

import type * as nodeProcess from "process";

// Re-export TextEncoder/TextDecoder from polyfills (polyfills.ts is imported first in index.ts)
import { TextEncoder, TextDecoder } from "./polyfills.js";

// Use whatwg-url for spec-compliant URL implementation
import { URL as WhatwgURL, URLSearchParams as WhatwgURLSearchParams } from "whatwg-url";

// Use buffer package for spec-compliant Buffer implementation
import { Buffer as BufferPolyfill } from "buffer";
import type {
	CryptoRandomFillBridgeRef,
	CryptoRandomUuidBridgeRef,
	FsFacadeBridge,
	ProcessErrorBridgeRef,
	ProcessLogBridgeRef,
	PtySetRawModeBridgeRef,
	ScheduleTimerBridgeRef,
} from "../shared/bridge-contract.js";
import {
  exposeCustomGlobal,
  exposeMutableRuntimeStateGlobal,
} from "../shared/global-exposure.js";


/**
 * Process configuration injected by the host before the bridge bundle loads.
 * Values default to sensible Linux/x64 stubs when unset.
 */
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
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  stderrIsTTY?: boolean;
}

// Declare config and host bridge globals
declare const _processConfig: ProcessConfig | undefined;
declare const _log: ProcessLogBridgeRef;
declare const _error: ProcessErrorBridgeRef;
// Timer reference for actual delays using host's event loop
declare const _scheduleTimer: ScheduleTimerBridgeRef | undefined;
declare const _cryptoRandomFill: CryptoRandomFillBridgeRef | undefined;
declare const _cryptoRandomUUID: CryptoRandomUuidBridgeRef | undefined;
// Filesystem bridge for chdir validation
declare const _fs: FsFacadeBridge;
// PTY setRawMode bridge ref (optional — only present when PTY is attached)
declare const _ptySetRawMode: PtySetRawModeBridgeRef | undefined;
// Timer budget injected by the host when resourceBudgets.maxTimers is set
declare const _maxTimers: number | undefined;

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
  cwd: (typeof _processConfig !== "undefined" && _processConfig.cwd) || "/root",
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

/** Get the current timestamp, returning a frozen value when timing mitigation is active. */
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

// Start time for uptime calculation (mutable for snapshot restore)
let _processStartTime = getNowMs();

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

// Expose reset function for snapshot restore — resets mutable state
// captured in this closure so each restored context starts fresh.
(globalThis as Record<string, unknown>).__runtimeResetProcessState =
  function () {
    _processStartTime =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    _exitCode = 0;
    _exited = false;
    delete (globalThis as Record<string, unknown>).__runtimeResetProcessState;
  };

/**
 * Thrown by `process.exit()` to unwind the sandbox call stack. The host
 * catches this to extract the exit code without killing the isolate.
 */
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

// Signal name → number mapping (POSIX standard)
const _signalNumbers: Record<string, number> = {
  SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5, SIGABRT: 6,
  SIGBUS: 7, SIGFPE: 8, SIGKILL: 9, SIGUSR1: 10, SIGSEGV: 11, SIGUSR2: 12,
  SIGPIPE: 13, SIGALRM: 14, SIGTERM: 15, SIGCHLD: 17, SIGCONT: 18,
  SIGSTOP: 19, SIGTSTP: 20, SIGTTIN: 21, SIGTTOU: 22, SIGURG: 23,
  SIGXCPU: 24, SIGXFSZ: 25, SIGVTALRM: 26, SIGPROF: 27, SIGWINCH: 28,
  SIGIO: 29, SIGPWR: 30, SIGSYS: 31,
};

function _resolveSignal(signal?: string | number): number {
  if (signal === undefined || signal === null) return 15; // default SIGTERM
  if (typeof signal === "number") return signal;
  const num = _signalNumbers[signal];
  if (num !== undefined) return num;
  throw new Error("Unknown signal: " + signal);
}

// EventEmitter implementation for process
type EventListener = (...args: unknown[]) => void;
const _processListeners: Record<string, EventListener[]> = {};
const _processOnceListeners: Record<string, EventListener[]> = {};
let _processMaxListeners = 10;
const _processMaxListenersWarned = new Set<string>();

function _addListener(
  event: string,
  listener: EventListener,
  once = false
): unknown {
  const target = once ? _processOnceListeners : _processListeners;
  if (!target[event]) {
    target[event] = [];
  }
  target[event].push(listener);

  // Warn when exceeding maxListeners (Node.js behavior: warn, don't crash)
  if (_processMaxListeners > 0 && !_processMaxListenersWarned.has(event)) {
    const total = (_processListeners[event]?.length ?? 0) + (_processOnceListeners[event]?.length ?? 0);
    if (total > _processMaxListeners) {
      _processMaxListenersWarned.add(event);
      const warning = `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ${total} ${event} listeners added to [process]. MaxListeners is ${_processMaxListeners}. Use emitter.setMaxListeners() to increase limit`;
      // Use console.error to emit warning without recursion risk
      if (typeof _error !== "undefined") {
        _error(warning);
      }
    }
  }

  return process;
}

function _removeListener(
  event: string,
  listener: EventListener
): unknown {
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

// Stdio stream shape shared by stdout and stderr
interface StdioWriteStream {
  write(data: unknown): boolean;
  end(): StdioWriteStream;
  on(): StdioWriteStream;
  once(): StdioWriteStream;
  emit(): boolean;
  writable: boolean;
  isTTY: boolean;
  columns: number;
  rows: number;
}

// Resolve isTTY flags from config
const _stdinIsTTY = (typeof _processConfig !== "undefined" && _processConfig.stdinIsTTY) || false;
const _stdoutIsTTY = (typeof _processConfig !== "undefined" && _processConfig.stdoutIsTTY) || false;
const _stderrIsTTY = (typeof _processConfig !== "undefined" && _processConfig.stderrIsTTY) || false;

// Stdout stream
const _stdout: StdioWriteStream = {
  write(data: unknown): boolean {
    if (typeof _log !== "undefined") {
      _log(String(data).replace(/\n$/, ""));
    }
    return true;
  },
  end(): StdioWriteStream {
    return this;
  },
  on(): StdioWriteStream {
    return this;
  },
  once(): StdioWriteStream {
    return this;
  },
  emit(): boolean {
    return false;
  },
  writable: true,
  isTTY: _stdoutIsTTY,
  columns: 80,
  rows: 24,
};

// Stderr stream
const _stderr: StdioWriteStream = {
  write(data: unknown): boolean {
    if (typeof _error !== "undefined") {
      _error(String(data).replace(/\n$/, ""));
    }
    return true;
  },
  end(): StdioWriteStream {
    return this;
  },
  on(): StdioWriteStream {
    return this;
  },
  once(): StdioWriteStream {
    return this;
  },
  emit(): boolean {
    return false;
  },
  writable: true,
  isTTY: _stderrIsTTY,
  columns: 80,
  rows: 24,
};

// Stdin stream with data support
// These are exposed as globals so they can be set after bridge initialization
type StdinListener = (data?: unknown) => void;
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

// Stdin stream shape
interface StdinStream {
  readable: boolean;
  paused: boolean;
  encoding: string | null;
  read(size?: number): string | null;
  on(event: string, listener: StdinListener): StdinStream;
  once(event: string, listener: StdinListener): StdinStream;
  off(event: string, listener: StdinListener): StdinStream;
  removeListener(event: string, listener: StdinListener): StdinStream;
  emit(event: string, ...args: unknown[]): boolean;
  pause(): StdinStream;
  resume(): StdinStream;
  setEncoding(enc: string): StdinStream;
  setRawMode(mode: boolean): StdinStream;
  isTTY: boolean;
  [Symbol.asyncIterator]: () => AsyncGenerator<string, void, unknown>;
}

const _stdin: StdinStream = {
  readable: true,
  paused: true,
  encoding: null as string | null,

  read(size?: number): string | null {
    if (getStdinPosition() >= getStdinData().length) return null;
    const chunk = size ? getStdinData().slice(getStdinPosition(), getStdinPosition() + size) : getStdinData().slice(getStdinPosition());
    setStdinPosition(getStdinPosition() + chunk.length);
    return chunk;
  },

  on(event: string, listener: StdinListener): StdinStream {
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

  once(event: string, listener: StdinListener): StdinStream {
    if (!_stdinOnceListeners[event]) _stdinOnceListeners[event] = [];
    _stdinOnceListeners[event].push(listener);
    return this;
  },

  off(event: string, listener: StdinListener): StdinStream {
    if (_stdinListeners[event]) {
      const idx = _stdinListeners[event].indexOf(listener);
      if (idx !== -1) _stdinListeners[event].splice(idx, 1);
    }
    return this;
  },

  removeListener(event: string, listener: StdinListener): StdinStream {
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

  pause(): StdinStream {
    this.paused = true;
    setStdinFlowMode(false);
    return this;
  },

  resume(): StdinStream {
    this.paused = false;
    setStdinFlowMode(true);
    _emitStdinData();
    return this;
  },

  setEncoding(enc: string): StdinStream {
    this.encoding = enc;
    return this;
  },

  setRawMode(mode: boolean): StdinStream {
    if (!_stdinIsTTY) {
      throw new Error("setRawMode is not supported when stdin is not a TTY");
    }
    if (typeof _ptySetRawMode !== "undefined") {
      _ptySetRawMode(mode);
    }
    return this;
  },

  isTTY: _stdinIsTTY,

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

// The process object — typed loosely as a polyfill, cast to typeof nodeProcess on export
const process: Record<string, unknown> & {
  stdout: StdioWriteStream;
  stderr: StdioWriteStream;
  stdin: StdinStream;
  pid: number;
  ppid: number;
  env: Record<string, string>;
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
    // Validate directory exists in VFS before setting cwd
    let stat: { isDirectory: boolean };
    try {
      stat = _fs.stat(dir);
    } catch {
      const err = new Error(`ENOENT: no such file or directory, chdir '${dir}'`) as Error & { code: string; errno: number; syscall: string; path: string };
      err.code = "ENOENT";
      err.errno = -2;
      err.syscall = "chdir";
      err.path = dir;
      throw err;
    }
    if (!stat.isDirectory) {
      const err = new Error(`ENOTDIR: not a directory, chdir '${dir}'`) as Error & { code: string; errno: number; syscall: string; path: string };
      err.code = "ENOTDIR";
      err.errno = -20;
      err.syscall = "chdir";
      err.path = dir;
      throw err;
    }
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
    return (process as unknown as { exit: (code: number) => never }).exit(1);
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
    // Resolve signal name to number (default SIGTERM)
    const sigNum = _resolveSignal(signal);
    // Self-kill - exit with 128 + signal number (POSIX convention)
    return (process as unknown as { exit: (code: number) => never }).exit(128 + sigNum);
  },

  // EventEmitter methods
  on(event: string, listener: EventListener) {
    return _addListener(event, listener);
  },

  once(event: string, listener: EventListener) {
    return _addListener(event, listener, true);
  },

  removeListener(event: string, listener: EventListener) {
    return _removeListener(event, listener);
  },

  // off is an alias for removeListener (assigned below to be same reference)
  off: null as unknown as (event: string, listener: EventListener) => unknown,

  removeAllListeners(event?: string) {
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

  addListener(event: string, listener: EventListener) {
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

  prependListener(event: string, listener: EventListener) {
    if (!_processListeners[event]) {
      _processListeners[event] = [];
    }
    _processListeners[event].unshift(listener);
    return process;
  },

  prependOnceListener(event: string, listener: EventListener) {
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

  setMaxListeners(n: number) {
    _processMaxListeners = n;
    return process;
  },
  getMaxListeners(): number {
    return _processMaxListeners;
  },
  rawListeners(event: string): EventListener[] {
    return (process as unknown as { listeners: (event: string) => EventListener[] }).listeners(event);
  },

  // Stdio streams
  stdout: _stdout,
  stderr: _stderr,
  stdin: _stdin,

  // Process state
  connected: false,

  // Module info (will be set by createRequire)
  mainModule: undefined,

  // No-op methods for compatibility
  emitWarning(warning: string | Error): void {
    const msg = typeof warning === "string" ? warning : warning.message;
    _emit("warning", { message: msg, name: "Warning" });
  },

  binding(_name: string): never {
    throw new Error("process.binding is not supported in sandbox");
  },

  _linkedBinding(_name: string): never {
    throw new Error("process._linkedBinding is not supported in sandbox");
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

// Match Node.js Object.prototype.toString.call(process) === '[object process]'
Object.defineProperty(process, Symbol.toStringTag, {
  value: "process",
  writable: false,
  configurable: true,
  enumerable: false,
});

export default process as unknown as typeof nodeProcess;

// ============================================================================
// Global polyfills
// ============================================================================

// Timer implementation
let _timerId = 0;
const _timers = new Map<number, TimerHandle>();
const _intervals = new Map<number, TimerHandle>();

/** Check timer budget. _maxTimers is injected by the host when resourceBudgets.maxTimers is set. */
function _checkTimerBudget(): void {
  if (typeof _maxTimers !== "undefined" && (_timers.size + _intervals.size) >= _maxTimers) {
    throw new Error("ERR_RESOURCE_BUDGET_EXCEEDED: maximum number of timers exceeded");
  }
}

// queueMicrotask fallback
const _queueMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : function (fn: () => void): void {
        Promise.resolve().then(fn);
      };

/**
 * Timer handle that mimics Node.js Timeout (ref/unref/Symbol.toPrimitive).
 * Timers with delay > 0 use the host's `_scheduleTimer` bridge to sleep
 * without blocking the isolate's event loop.
 */
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
  _checkTimerBudget();
  const id = ++_timerId;
  const handle = new TimerHandle(id);
  _timers.set(id, handle);

  const actualDelay = delay ?? 0;

  // Use host timer for actual delays if available and delay > 0
  if (typeof _scheduleTimer !== "undefined" && actualDelay > 0) {
    _scheduleTimer(actualDelay)
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
  _checkTimerBudget();
  const id = ++_timerId;
  const handle = new TimerHandle(id);
  _intervals.set(id, handle);

  // Enforce minimum 1ms delay to prevent microtask CPU spin
  const actualDelay = Math.max(1, delay ?? 0);

  // Schedule interval execution
  const scheduleNext = () => {
    if (!_intervals.has(id)) return; // Interval was cleared

    if (typeof _scheduleTimer !== "undefined" && actualDelay > 0) {
      // Use host timer for actual delays
      _scheduleTimer(actualDelay)
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

// Patch internal V8 Buffer slice/write methods used by native-protocol libraries
// (ssh2, msgpack, protobuf, etc.). The polyfill supports these encodings through
// toString()/write() but doesn't expose the fast-path internal methods.
const bp = BufferPolyfill.prototype as Record<string, unknown>;
const sliceEncodings = ["utf8", "ascii", "latin1", "binary", "hex", "base64", "ucs2", "utf16le"] as const;
for (const enc of sliceEncodings) {
  const sliceKey = `${enc}Slice`;
  if (typeof bp[sliceKey] !== "function") {
    bp[sliceKey] = function(this: InstanceType<typeof BufferPolyfill>, start: number, end: number): string {
      return this.toString(enc, start, end);
    };
  }
  const writeKey = `${enc}Write`;
  if (typeof bp[writeKey] !== "function") {
    bp[writeKey] = function(this: InstanceType<typeof BufferPolyfill>, str: string, offset: number, length: number): number {
      return this.write(str, offset, length, enc);
    };
  }
}

function throwUnsupportedCryptoApi(api: "getRandomValues" | "randomUUID"): never {
  throw new Error(`crypto.${api} is not supported in sandbox`);
}

/**
 * Crypto polyfill that delegates to the host for entropy. `getRandomValues`
 * calls the host's `_cryptoRandomFill` bridge to get cryptographically secure
 * random bytes. Subtle crypto operations are unsupported.
 */
export const cryptoPolyfill = {
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    if (typeof _cryptoRandomFill === "undefined") {
      throwUnsupportedCryptoApi("getRandomValues");
    }
    // Web Crypto API spec caps getRandomValues at 65536 bytes.
    if (array.byteLength > 65536) {
      throw new RangeError(
        `The ArrayBufferView's byte length (${array.byteLength}) exceeds the number of bytes of entropy available via this API (65536)`
      );
    }
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength
    );
    try {
      const hostBytes = _cryptoRandomFill(bytes.byteLength);
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
      const uuid = _cryptoRandomUUID();
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

/**
 * Install all process/timer/URL/Buffer/crypto polyfills onto `globalThis`.
 * Called once during bridge initialization before user code runs.
 */
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
