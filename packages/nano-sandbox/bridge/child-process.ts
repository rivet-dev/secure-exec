// child_process module polyfill for isolated-vm
// Provides Node.js child_process module emulation that bridges to host

import type * as nodeChildProcess from "child_process";

// Declare host bridge References
declare const _childProcessExecRaw: {
  apply(
    ctx: undefined,
    args: [string],
    options: { result: { promise: true } }
  ): Promise<string>;
  applySyncPromise(ctx: undefined, args: [string]): string;
};

declare const _childProcessSpawnRaw: {
  apply(
    ctx: undefined,
    args: [string, string],
    options: { result: { promise: true } }
  ): Promise<string>;
  applySyncPromise(ctx: undefined, args: [string, string]): string;
};

// Event listener types
type EventListener = (...args: unknown[]) => void;

// Stream stub for stdin
interface StdinStream {
  writable: boolean;
  _buffer: unknown[];
  write(data: unknown): boolean;
  end(): void;
  on(): StdinStream;
  once(): StdinStream;
  emit(): boolean;
}

// Stream stub for stdout/stderr
interface OutputStreamStub {
  readable: boolean;
  _data: string;
  _listeners: Record<string, EventListener[]>;
  _onceListeners: Record<string, EventListener[]>;
  on(event: string, listener: EventListener): OutputStreamStub;
  once(event: string, listener: EventListener): OutputStreamStub;
  emit(event: string, ...args: unknown[]): boolean;
  read(): null;
  setEncoding(): OutputStreamStub;
  pipe<T extends NodeJS.WritableStream>(dest: T): T;
}

// ChildProcess class - simplified interface, not strictly satisfying nodeChildProcess.ChildProcess
class ChildProcess {
  private _listeners: Record<string, EventListener[]> = {};
  private _onceListeners: Record<string, EventListener[]> = {};

  pid: number = Math.floor(Math.random() * 10000) + 1000;
  killed = false;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  connected = false;
  spawnfile = "";
  spawnargs: string[] = [];

  stdin: StdinStream;
  stdout: OutputStreamStub;
  stderr: OutputStreamStub;
  stdio: [StdinStream, OutputStreamStub, OutputStreamStub];

  constructor() {
    // Create stdin stream stub
    this.stdin = {
      writable: true,
      _buffer: [],
      write(data: unknown): boolean {
        this._buffer.push(data);
        return true;
      },
      end(): void {
        this.writable = false;
      },
      on(): StdinStream {
        return this;
      },
      once(): StdinStream {
        return this;
      },
      emit(): boolean {
        return false;
      },
    };

    // Create stdout stream stub
    this.stdout = {
      readable: true,
      _data: "",
      _listeners: {},
      _onceListeners: {},
      on(event: string, listener: EventListener): OutputStreamStub {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(listener);
        return this;
      },
      once(event: string, listener: EventListener): OutputStreamStub {
        if (!this._onceListeners[event]) this._onceListeners[event] = [];
        this._onceListeners[event].push(listener);
        return this;
      },
      emit(event: string, ...args: unknown[]): boolean {
        if (this._listeners[event]) {
          this._listeners[event].forEach((fn) => fn(...args));
        }
        if (this._onceListeners[event]) {
          this._onceListeners[event].forEach((fn) => fn(...args));
          this._onceListeners[event] = [];
        }
        return true;
      },
      read(): null {
        return null;
      },
      setEncoding(): OutputStreamStub {
        return this;
      },
      pipe<T extends NodeJS.WritableStream>(dest: T): T {
        return dest;
      },
    };

    // Create stderr stream stub
    this.stderr = {
      readable: true,
      _data: "",
      _listeners: {},
      _onceListeners: {},
      on(event: string, listener: EventListener): OutputStreamStub {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(listener);
        return this;
      },
      once(event: string, listener: EventListener): OutputStreamStub {
        if (!this._onceListeners[event]) this._onceListeners[event] = [];
        this._onceListeners[event].push(listener);
        return this;
      },
      emit(event: string, ...args: unknown[]): boolean {
        if (this._listeners[event]) {
          this._listeners[event].forEach((fn) => fn(...args));
        }
        if (this._onceListeners[event]) {
          this._onceListeners[event].forEach((fn) => fn(...args));
          this._onceListeners[event] = [];
        }
        return true;
      },
      read(): null {
        return null;
      },
      setEncoding(): OutputStreamStub {
        return this;
      },
      pipe<T extends NodeJS.WritableStream>(dest: T): T {
        return dest;
      },
    };

    this.stdio = [this.stdin, this.stdout, this.stderr];
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    if (!this._onceListeners[event]) this._onceListeners[event] = [];
    this._onceListeners[event].push(listener);
    return this;
  }

  off(event: string, listener: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(listener);
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    let handled = false;
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => {
        fn(...args);
        handled = true;
      });
    }
    if (this._onceListeners[event]) {
      this._onceListeners[event].forEach((fn) => {
        fn(...args);
        handled = true;
      });
      this._onceListeners[event] = [];
    }
    return handled;
  }

  kill(_signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.signalCode = (typeof _signal === "string" ? _signal : "SIGTERM") as NodeJS.Signals;
    return true;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  disconnect(): void {
    this.connected = false;
  }

  _complete(stdout: string, stderr: string, code: number): void {
    this.exitCode = code;

    // Emit data events for stdout/stderr as single chunks
    if (stdout) {
      const buf = typeof Buffer !== "undefined" ? Buffer.from(stdout) : stdout;
      this.stdout.emit("data", buf);
    }
    if (stderr) {
      const buf = typeof Buffer !== "undefined" ? Buffer.from(stderr) : stderr;
      this.stderr.emit("data", buf);
    }

    // Emit end events
    this.stdout.emit("end");
    this.stderr.emit("end");

    // Emit close event (code, signal)
    this.emit("close", code, this.signalCode);

    // Emit exit event
    this.emit("exit", code, this.signalCode);
  }
}

// ExecError type
interface ExecError extends Error {
  code?: number;
  killed?: boolean;
  signal?: string | null;
  cmd?: string;
  stdout?: string;
  stderr?: string;
  status?: number;
  output?: [null, string, string];
}

// exec - execute shell command, callback when done
function exec(
  command: string,
  options?: nodeChildProcess.ExecOptions | ((error: ExecError | null, stdout: string, stderr: string) => void),
  callback?: (error: ExecError | null, stdout: string, stderr: string) => void
): ChildProcess {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const child = new ChildProcess();
  child.spawnargs = ["bash", "-c", command];
  child.spawnfile = "bash";

  // Execute asynchronously via host bridge
  (async () => {
    try {
      const jsonResult = await _childProcessExecRaw.apply(undefined, [command], {
        result: { promise: true },
      });
      const result = JSON.parse(jsonResult) as { stdout?: string; stderr?: string; code?: number };
      const stdout = result.stdout || "";
      const stderr = result.stderr || "";
      const code = result.code || 0;

      child._complete(stdout, stderr, code);

      if (callback) {
        if (code !== 0) {
          const err: ExecError = new Error("Command failed: " + command);
          err.code = code;
          err.killed = false;
          err.signal = null;
          err.cmd = command;
          err.stdout = stdout;
          err.stderr = stderr;
          callback(err, stdout, stderr);
        } else {
          callback(null, stdout, stderr);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      child._complete("", errMsg, 1);
      if (callback) {
        const error: ExecError = err instanceof Error ? err : new Error(String(err));
        error.code = 1;
        error.stdout = "";
        error.stderr = errMsg;
        callback(error, "", error.stderr);
      }
    }
  })();

  return child;
}

// execSync - synchronous shell execution
function execSync(
  command: string,
  options?: nodeChildProcess.ExecSyncOptions
): string | Buffer {
  const opts = options || {};

  // Use synchronous bridge call - result is JSON string
  const jsonResult = _childProcessExecRaw.applySyncPromise(undefined, [command]);
  const result = JSON.parse(jsonResult) as { stdout: string; stderr: string; code: number };

  if (result.code !== 0) {
    const err: ExecError = new Error("Command failed: " + command);
    err.status = result.code;
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    err.output = [null, result.stdout, result.stderr];
    throw err;
  }

  if (opts.encoding === "buffer" || !opts.encoding) {
    return typeof Buffer !== "undefined" ? Buffer.from(result.stdout) : (result.stdout as unknown as Buffer);
  }
  return result.stdout;
}

// spawn - spawn a command with streaming
function spawn(
  command: string,
  args?: readonly string[] | nodeChildProcess.SpawnOptions,
  options?: nodeChildProcess.SpawnOptions
): ChildProcess {
  let argsArray: string[] = [];
  let opts: nodeChildProcess.SpawnOptions = {};

  if (!Array.isArray(args)) {
    opts = (args as nodeChildProcess.SpawnOptions) || {};
  } else {
    argsArray = args as string[];
    opts = options || {};
  }

  const child = new ChildProcess();
  child.spawnfile = command;
  child.spawnargs = [command, ...argsArray];

  // Check if it's a shell command
  const useShell = opts.shell || false;

  // Execute asynchronously
  (async () => {
    try {
      let jsonResult: string;
      if (useShell || command === "bash" || command === "sh") {
        // Use shell execution
        const fullCmd = [command, ...argsArray].join(" ");
        jsonResult = await _childProcessExecRaw.apply(undefined, [fullCmd], {
          result: { promise: true },
        });
      } else {
        // Use spawn - args passed as JSON string for transferability
        jsonResult = await _childProcessSpawnRaw.apply(
          undefined,
          [command, JSON.stringify(argsArray)],
          { result: { promise: true } }
        );
      }
      const result = JSON.parse(jsonResult) as { stdout?: string; stderr?: string; code?: number };

      child._complete(result.stdout || "", result.stderr || "", result.code || 0);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      child._complete("", errMsg, 1);
      child.emit("error", err);
    }
  })();

  return child;
}

// SpawnSyncResult type
interface SpawnSyncResult {
  pid: number;
  output: [null, string | Buffer, string | Buffer];
  stdout: string | Buffer;
  stderr: string | Buffer;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

// spawnSync - synchronous spawn
function spawnSync(
  command: string,
  args?: readonly string[] | nodeChildProcess.SpawnSyncOptions,
  options?: nodeChildProcess.SpawnSyncOptions
): SpawnSyncResult {
  let argsArray: string[] = [];

  if (!Array.isArray(args)) {
    // args is actually options
  } else {
    argsArray = args as string[];
  }

  try {
    // Args passed as JSON string for transferability
    const jsonResult = _childProcessSpawnRaw.applySyncPromise(undefined, [
      command,
      JSON.stringify(argsArray),
    ]);
    const result = JSON.parse(jsonResult) as { stdout: string; stderr: string; code: number };

    const stdoutBuf = typeof Buffer !== "undefined" ? Buffer.from(result.stdout) : result.stdout;
    const stderrBuf = typeof Buffer !== "undefined" ? Buffer.from(result.stderr) : result.stderr;

    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      output: [null, stdoutBuf as string | Buffer, stderrBuf as string | Buffer],
      stdout: stdoutBuf as string | Buffer,
      stderr: stderrBuf as string | Buffer,
      status: result.code,
      signal: null,
      error: undefined,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const stderrBuf = typeof Buffer !== "undefined" ? Buffer.from(errMsg) : errMsg;

    return {
      pid: 0,
      output: [null, "", stderrBuf as string | Buffer],
      stdout: typeof Buffer !== "undefined" ? Buffer.from("") : "",
      stderr: stderrBuf as string | Buffer,
      status: 1,
      signal: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// execFile - execute a file directly
function execFile(
  file: string,
  args?: readonly string[] | nodeChildProcess.ExecFileOptions | ((error: ExecError | null, stdout: string, stderr: string) => void),
  options?: nodeChildProcess.ExecFileOptions | ((error: ExecError | null, stdout: string, stderr: string) => void),
  callback?: (error: ExecError | null, stdout: string, stderr: string) => void
): ChildProcess {
  let argsArray: string[] = [];
  let opts: nodeChildProcess.ExecFileOptions = {};
  let cb: ((error: ExecError | null, stdout: string, stderr: string) => void) | undefined;

  if (typeof args === "function") {
    cb = args;
  } else if (typeof options === "function") {
    argsArray = (args as readonly string[]).slice();
    cb = options;
  } else {
    argsArray = Array.isArray(args) ? (args as string[]) : [];
    opts = (options as nodeChildProcess.ExecFileOptions) || {};
    cb = callback;
  }

  // execFile is like spawn but with callback
  const child = spawn(file, argsArray, opts as nodeChildProcess.SpawnOptions);

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data: unknown) => {
    stdout += String(data);
  });
  child.stderr.on("data", (data: unknown) => {
    stderr += String(data);
  });

  child.on("close", (code: number) => {
    if (cb) {
      if (code !== 0) {
        const err: ExecError = new Error("Command failed: " + file);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        cb(err, stdout, stderr);
      } else {
        cb(null, stdout, stderr);
      }
    }
  });

  child.on("error", (err: unknown) => {
    if (cb) {
      cb(err as ExecError, stdout, stderr);
    }
  });

  return child;
}

// execFileSync
function execFileSync(
  file: string,
  args?: readonly string[] | nodeChildProcess.ExecFileSyncOptions,
  options?: nodeChildProcess.ExecFileSyncOptions
): string | Buffer {
  let argsArray: string[] = [];
  let opts: nodeChildProcess.ExecFileSyncOptions = {};

  if (!Array.isArray(args)) {
    opts = (args as nodeChildProcess.ExecFileSyncOptions) || {};
  } else {
    argsArray = args as string[];
    opts = options || {};
  }

  const result = spawnSync(file, argsArray, opts as nodeChildProcess.SpawnSyncOptions);

  if (result.status !== 0) {
    const err: ExecError = new Error("Command failed: " + file);
    err.status = result.status ?? undefined;
    err.stdout = String(result.stdout);
    err.stderr = String(result.stderr);
    throw err;
  }

  if (opts.encoding === "buffer" || !opts.encoding) {
    return result.stdout;
  }
  return typeof result.stdout === "string" ? result.stdout : result.stdout.toString(opts.encoding as BufferEncoding);
}

// fork - spawn a node process with IPC
function fork(
  modulePath: string,
  args?: readonly string[] | nodeChildProcess.ForkOptions,
  options?: nodeChildProcess.ForkOptions
): ChildProcess {
  let argsArray: string[] = [];
  let opts: nodeChildProcess.ForkOptions = {};

  if (!Array.isArray(args)) {
    opts = (args as nodeChildProcess.ForkOptions) || {};
  } else {
    argsArray = args as string[];
    opts = options || {};
  }

  // Fork executes a node script - we use spawn with node
  const child = spawn("node", [modulePath, ...argsArray], {
    ...opts,
    stdio: opts.stdio || "pipe",
  } as nodeChildProcess.SpawnOptions);

  // Add IPC-like methods (stubs)
  (child as ChildProcess & { send: (message: unknown, sendHandle?: unknown, options?: unknown, callback?: (error: Error | null) => void) => boolean }).send = function (
    _message: unknown,
    sendHandle?: unknown,
    _options?: unknown,
    callback?: (error: Error | null) => void
  ): boolean {
    if (typeof sendHandle === "function") {
      callback = sendHandle as (error: Error | null) => void;
    }
    if (callback) callback(null);
    return true;
  };

  child.connected = true;

  return child;
}

// Create the child_process module
const childProcess = {
  ChildProcess,
  exec,
  execSync,
  spawn,
  spawnSync,
  execFile,
  execFileSync,
  fork,
};

// Expose to global for require() to use
(globalThis as Record<string, unknown>)._childProcessModule = childProcess;

export { ChildProcess, exec, execSync, spawn, spawnSync, execFile, execFileSync, fork };
export default childProcess;
