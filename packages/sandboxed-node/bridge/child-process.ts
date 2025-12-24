// child_process module polyfill for isolated-vm
// Provides Node.js child_process module emulation that bridges to host
//
// Uses the active handles mechanism to keep the sandbox alive while child
// processes are running. See: docs/ACTIVE_HANDLES.md

import type * as nodeChildProcess from "child_process";

// Host bridge declarations for streaming mode
declare const _childProcessSpawnStart:
  | {
      applySync(ctx: undefined, args: [string, string, string]): number;
    }
  | undefined;

declare const _childProcessStdinWrite:
  | {
      applySync(ctx: undefined, args: [number, Uint8Array]): void;
    }
  | undefined;

declare const _childProcessStdinClose:
  | {
      applySync(ctx: undefined, args: [number]): void;
    }
  | undefined;

declare const _childProcessKill:
  | {
      applySync(ctx: undefined, args: [number, number]): void;
    }
  | undefined;

// Synchronous spawn - blocks until process exits, returns all output as JSON
declare const _childProcessSpawnSync:
  | {
      applySyncPromise(ctx: undefined, args: [string, string, string]): string;
    }
  | undefined;

// Active handles functions (installed by active-handles.ts)
// See: docs/ACTIVE_HANDLES.md
declare const _registerHandle: (id: string, description: string) => void;
declare const _unregisterHandle: (id: string) => void;

// Active children registry - maps session ID to ChildProcess
const activeChildren = new Map<number, ChildProcess>();

// Global dispatcher - host calls this when data arrives
(globalThis as Record<string, unknown>)._childProcessDispatch = (
  sessionId: number,
  type: "stdout" | "stderr" | "exit",
  data: Uint8Array | number
): void => {
  const child = activeChildren.get(sessionId);
  if (!child) return;

  if (type === "stdout") {
    const buf =
      typeof Buffer !== "undefined" ? Buffer.from(data as Uint8Array) : data;
    child.stdout.emit("data", buf);
  } else if (type === "stderr") {
    const buf =
      typeof Buffer !== "undefined" ? Buffer.from(data as Uint8Array) : data;
    child.stderr.emit("data", buf);
  } else if (type === "exit") {
    child.exitCode = data as number;
    child.stdout.emit("end");
    child.stderr.emit("end");
    child.emit("close", data, null);
    child.emit("exit", data, null);
    activeChildren.delete(sessionId);
    // Unregister handle - allows sandbox to exit if no other handles remain
    // See: docs/ACTIVE_HANDLES.md
    if (typeof _unregisterHandle === "function") {
      _unregisterHandle(`child:${sessionId}`);
    }
  }
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
// Uses spawn("bash", ["-c", command]) internally
// NOTE: WASIX bash returns incorrect exit codes (45 instead of 0) for -c flag,
// so error will be set even on successful commands. The stdout/stderr are correct.
function exec(
  command: string,
  options?: nodeChildProcess.ExecOptions | ((error: ExecError | null, stdout: string, stderr: string) => void),
  callback?: (error: ExecError | null, stdout: string, stderr: string) => void
): ChildProcess {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  // Use spawn with shell to execute the command
  const child = spawn("bash", ["-c", command], { shell: false });
  child.spawnargs = ["bash", "-c", command];
  child.spawnfile = "bash";

  // Collect output and invoke callback
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data: unknown) => {
    stdout += String(data);
  });

  child.stderr.on("data", (data: unknown) => {
    stderr += String(data);
  });

  child.on("close", (code: number) => {
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
  });

  child.on("error", (err: unknown) => {
    if (callback) {
      const error: ExecError = err instanceof Error ? err : new Error(String(err));
      error.code = 1;
      error.stdout = stdout;
      error.stderr = stderr;
      callback(error, stdout, stderr);
    }
  });

  return child;
}

// execSync - synchronous shell execution
// Uses spawnSync("bash", ["-c", command]) internally
function execSync(
  command: string,
  options?: nodeChildProcess.ExecSyncOptions
): string | Buffer {
  const opts = options || {};

  if (typeof _childProcessSpawnSync === "undefined") {
    throw new Error("child_process.execSync requires CommandExecutor to be configured");
  }

  // Use synchronous bridge call - result is JSON string
  const jsonResult = _childProcessSpawnSync.applySyncPromise(undefined, [
    "bash",
    JSON.stringify(["-c", command]),
    JSON.stringify({ cwd: opts.cwd, env: opts.env as Record<string, string> }),
  ]);
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

  // Check if streaming mode is available
  if (typeof _childProcessSpawnStart !== "undefined") {
    // Use process.cwd() as default if no cwd specified
    // This ensures process.chdir() changes are reflected in child processes
    const effectiveCwd = opts.cwd ?? (typeof process !== "undefined" ? process.cwd() : "/");

    // Streaming mode - spawn immediately
    const sessionId = _childProcessSpawnStart.applySync(undefined, [
      command,
      JSON.stringify(argsArray),
      JSON.stringify({ cwd: effectiveCwd, env: opts.env }),
    ]);

    activeChildren.set(sessionId, child);

    // Register handle to keep sandbox alive until child exits
    // See: docs/ACTIVE_HANDLES.md
    if (typeof _registerHandle === "function") {
      _registerHandle(`child:${sessionId}`, `child_process: ${command} ${argsArray.join(" ")}`);
    }

    // Override stdin methods for streaming
    child.stdin.write = (data: unknown): boolean => {
      if (typeof _childProcessStdinWrite === "undefined") return false;
      const bytes =
        typeof data === "string" ? new TextEncoder().encode(data) : (data as Uint8Array);
      _childProcessStdinWrite.applySync(undefined, [sessionId, bytes]);
      return true;
    };

    child.stdin.end = (): void => {
      if (typeof _childProcessStdinClose !== "undefined") {
        _childProcessStdinClose.applySync(undefined, [sessionId]);
      }
      child.stdin.writable = false;
    };

    // Override kill method
    child.kill = (signal?: NodeJS.Signals | number): boolean => {
      if (typeof _childProcessKill === "undefined") return false;
      const sig =
        signal === "SIGKILL" || signal === 9
          ? 9
          : signal === "SIGINT" || signal === 2
            ? 2
            : 15;
      _childProcessKill.applySync(undefined, [sessionId, sig]);
      child.killed = true;
      child.signalCode = (
        typeof signal === "string" ? signal : "SIGTERM"
      ) as NodeJS.Signals;
      return true;
    };

    return child;
  }

  // Fallback: no CommandExecutor available
  const err = new Error(
    "child_process.spawn requires CommandExecutor to be configured"
  );
  // Emit error asynchronously to match Node.js behavior
  setTimeout(() => {
    child.emit("error", err);
    child._complete("", err.message, 1);
  }, 0);

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
  let opts: nodeChildProcess.SpawnSyncOptions = {};

  if (!Array.isArray(args)) {
    opts = (args as nodeChildProcess.SpawnSyncOptions) || {};
  } else {
    argsArray = args as string[];
    opts = options || {};
  }

  if (typeof _childProcessSpawnSync === "undefined") {
    return {
      pid: 0,
      output: [null, "", "child_process.spawnSync requires CommandExecutor to be configured"],
      stdout: "",
      stderr: "child_process.spawnSync requires CommandExecutor to be configured",
      status: 1,
      signal: null,
      error: new Error("child_process.spawnSync requires CommandExecutor to be configured"),
    };
  }

  try {
    // Use process.cwd() as default if no cwd specified
    // This ensures process.chdir() changes are reflected in child processes
    const effectiveCwd = opts.cwd ?? (typeof process !== "undefined" ? process.cwd() : "/");

    // Args passed as JSON string for transferability
    const jsonResult = _childProcessSpawnSync.applySyncPromise(undefined, [
      command,
      JSON.stringify(argsArray),
      JSON.stringify({ cwd: effectiveCwd, env: opts.env as Record<string, string> }),
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

// fork - intentionally not implemented (IPC between processes not supported in sandbox)
function fork(
  _modulePath: string,
  _args?: readonly string[] | nodeChildProcess.ForkOptions,
  _options?: nodeChildProcess.ForkOptions
): never {
  throw new Error("child_process.fork is not implemented in sandbox (IPC not supported)");
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
