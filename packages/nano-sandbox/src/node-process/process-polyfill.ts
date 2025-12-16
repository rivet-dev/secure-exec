/**
 * Process polyfill code to be injected into isolated-vm context.
 * This provides comprehensive Node.js process object emulation for npm compatibility.
 */

export interface ProcessConfig {
  platform?: string;
  arch?: string;
  version?: string;
  cwd?: string;
  env?: Record<string, string>;
  argv?: string[];
  execPath?: string;
  homedir?: string;
}

/**
 * Generate the process polyfill code to inject into the isolate.
 * This code runs inside the isolated VM context.
 */
export function generateProcessPolyfill(config: ProcessConfig = {}): string {
  const platform = config.platform ?? "linux";
  const arch = config.arch ?? "x64";
  const version = config.version ?? "v20.0.0";
  const cwd = config.cwd ?? "/";
  const env = config.env ?? {};
  const argv = config.argv ?? ["node", "script.js"];
  const execPath = config.execPath ?? "/usr/bin/node";

  return `
(function() {
  // Start time for uptime calculation
  const _processStartTime = Date.now();

  // Exit code tracking
  let _exitCode = 0;
  let _exited = false;

  // ProcessExitError class for controlled exits
  class ProcessExitError extends Error {
    constructor(code) {
      super('process.exit(' + code + ')');
      this.name = 'ProcessExitError';
      this.code = code;
    }
  }
  globalThis.ProcessExitError = ProcessExitError;

  // EventEmitter implementation for process
  const _processListeners = {};
  const _processOnceListeners = {};

  function _addListener(event, listener, once = false) {
    const target = once ? _processOnceListeners : _processListeners;
    if (!target[event]) {
      target[event] = [];
    }
    target[event].push(listener);
    return process;
  }

  function _removeListener(event, listener) {
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

  function _emit(event, ...args) {
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

  // Stdout stream (captures to result.stdout)
  const _stdout = {
    write(data) {
      if (typeof _log !== 'undefined') {
        _log.applySync(undefined, [String(data).replace(/\\n$/, '')]);
      }
      return true;
    },
    end() { return this; },
    on() { return this; },
    once() { return this; },
    emit() { return false; },
    writable: true,
    isTTY: false,
    columns: 80,
    rows: 24
  };

  // Stderr stream (captures to result.stderr)
  const _stderr = {
    write(data) {
      if (typeof _error !== 'undefined') {
        _error.applySync(undefined, [String(data).replace(/\\n$/, '')]);
      }
      return true;
    },
    end() { return this; },
    on() { return this; },
    once() { return this; },
    emit() { return false; },
    writable: true,
    isTTY: false,
    columns: 80,
    rows: 24
  };

  // Stdin stream (read-only, paused)
  const _stdin = {
    readable: true,
    paused: true,
    encoding: null,
    read() { return null; },
    on() { return this; },
    once() { return this; },
    emit() { return false; },
    pause() { this.paused = true; return this; },
    resume() { this.paused = false; return this; },
    setEncoding(enc) { this.encoding = enc; return this; },
    isTTY: false
  };

  // The process object
  const process = {
    // Static properties
    platform: ${JSON.stringify(platform)},
    arch: ${JSON.stringify(arch)},
    version: ${JSON.stringify(version)},
    versions: {
      node: ${JSON.stringify(version.replace(/^v/, ""))},
      v8: '11.3.244.8',
      uv: '1.44.2',
      zlib: '1.2.13',
      brotli: '1.0.9',
      ares: '1.19.0',
      modules: '108',
      nghttp2: '1.52.0',
      napi: '8',
      llhttp: '8.1.0',
      openssl: '3.0.8',
      cldr: '42.0',
      icu: '72.1',
      tz: '2022g',
      unicode: '15.0'
    },
    pid: 1,
    ppid: 0,
    execPath: ${JSON.stringify(execPath)},
    execArgv: [],
    argv: ${JSON.stringify(argv)},
    argv0: ${JSON.stringify(argv[0] || "node")},
    title: 'node',
    env: ${JSON.stringify(env)},

    // Config stubs
    config: {
      target_defaults: {
        cflags: [],
        default_configuration: 'Release',
        defines: [],
        include_dirs: [],
        libraries: []
      },
      variables: {
        node_prefix: '/usr',
        node_shared_libuv: false
      }
    },

    release: {
      name: 'node',
      sourceUrl: 'https://nodejs.org/download/release/v20.0.0/node-v20.0.0.tar.gz',
      headersUrl: 'https://nodejs.org/download/release/v20.0.0/node-v20.0.0-headers.tar.gz'
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
      tls: true
    },

    // Methods
    cwd: function() { return ${JSON.stringify(cwd)}; },

    chdir: function(dir) {
      // No-op in sandbox, but track it
      process._cwd = dir;
    },

    get exitCode() { return _exitCode; },
    set exitCode(code) { _exitCode = code; },

    exit: function(code) {
      const exitCode = code !== undefined ? code : _exitCode;
      _exitCode = exitCode;
      _exited = true;

      // Fire exit event
      try {
        _emit('exit', exitCode);
      } catch (e) {
        // Ignore errors in exit handlers
      }

      // Throw to stop execution
      throw new ProcessExitError(exitCode);
    },

    abort: function() {
      process.exit(1);
    },

    nextTick: function(callback, ...args) {
      // Use queueMicrotask if available, otherwise use Promise.resolve
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => callback(...args));
      } else {
        Promise.resolve().then(() => callback(...args));
      }
    },

    hrtime: function(prev) {
      // Use performance.now() if available, otherwise Date.now()
      const now = typeof performance !== 'undefined' && performance.now
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
    },

    getuid: function() { return 0; },
    getgid: function() { return 0; },
    geteuid: function() { return 0; },
    getegid: function() { return 0; },
    getgroups: function() { return [0]; },

    setuid: function() {},
    setgid: function() {},
    seteuid: function() {},
    setegid: function() {},
    setgroups: function() {},

    umask: function(mask) {
      const oldMask = process._umask || 0o022;
      if (mask !== undefined) {
        process._umask = mask;
      }
      return oldMask;
    },

    uptime: function() {
      return (Date.now() - _processStartTime) / 1000;
    },

    memoryUsage: function() {
      return {
        rss: 50 * 1024 * 1024,
        heapTotal: 20 * 1024 * 1024,
        heapUsed: 10 * 1024 * 1024,
        external: 1 * 1024 * 1024,
        arrayBuffers: 500 * 1024
      };
    },

    memoryUsage$rss: function() {
      return 50 * 1024 * 1024;
    },

    cpuUsage: function(prev) {
      const usage = {
        user: 1000000,
        system: 500000
      };

      if (prev) {
        return {
          user: usage.user - prev.user,
          system: usage.system - prev.system
        };
      }

      return usage;
    },

    resourceUsage: function() {
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
        involuntaryContextSwitches: 0
      };
    },

    kill: function(pid, signal) {
      if (pid !== process.pid) {
        const err = new Error('Operation not permitted');
        err.code = 'EPERM';
        err.errno = -1;
        err.syscall = 'kill';
        throw err;
      }
      // Self-kill - treat as exit
      if (!signal || signal === 'SIGTERM' || signal === 15) {
        process.exit(143);
      }
      return true;
    },

    // EventEmitter methods
    on: function(event, listener) {
      return _addListener(event, listener);
    },

    once: function(event, listener) {
      return _addListener(event, listener, true);
    },

    off: function(event, listener) {
      return _removeListener(event, listener);
    },

    removeListener: function(event, listener) {
      return _removeListener(event, listener);
    },

    removeAllListeners: function(event) {
      if (event) {
        delete _processListeners[event];
        delete _processOnceListeners[event];
      } else {
        Object.keys(_processListeners).forEach(k => delete _processListeners[k]);
        Object.keys(_processOnceListeners).forEach(k => delete _processOnceListeners[k]);
      }
      return process;
    },

    addListener: function(event, listener) {
      return _addListener(event, listener);
    },

    emit: function(event, ...args) {
      return _emit(event, ...args);
    },

    listeners: function(event) {
      return [
        ...(_processListeners[event] || []),
        ...(_processOnceListeners[event] || [])
      ];
    },

    listenerCount: function(event) {
      return ((_processListeners[event] || []).length +
              (_processOnceListeners[event] || []).length);
    },

    prependListener: function(event, listener) {
      if (!_processListeners[event]) {
        _processListeners[event] = [];
      }
      _processListeners[event].unshift(listener);
      return process;
    },

    prependOnceListener: function(event, listener) {
      if (!_processOnceListeners[event]) {
        _processOnceListeners[event] = [];
      }
      _processOnceListeners[event].unshift(listener);
      return process;
    },

    eventNames: function() {
      return [...new Set([
        ...Object.keys(_processListeners),
        ...Object.keys(_processOnceListeners)
      ])];
    },

    setMaxListeners: function() { return process; },
    getMaxListeners: function() { return 10; },
    rawListeners: function(event) { return process.listeners(event); },

    // Stdio streams
    stdout: _stdout,
    stderr: _stderr,
    stdin: _stdin,

    // Process state
    connected: false,

    // Module info (will be set by createRequire)
    mainModule: undefined,

    // No-op methods for compatibility
    emitWarning: function(warning, options) {
      const msg = typeof warning === 'string' ? warning : warning.message;
      _emit('warning', { message: msg, name: 'Warning' });
    },

    binding: function(name) {
      throw new Error('process.binding is not supported');
    },

    _linkedBinding: function(name) {
      throw new Error('process._linkedBinding is not supported');
    },

    dlopen: function() {
      throw new Error('process.dlopen is not supported');
    },

    hasUncaughtExceptionCaptureCallback: function() { return false; },
    setUncaughtExceptionCaptureCallback: function() {},

    // Send for IPC (no-op)
    send: function() { return false; },
    disconnect: function() {},

    // Report
    report: {
      directory: '',
      filename: '',
      compact: false,
      signal: 'SIGUSR2',
      reportOnFatalError: false,
      reportOnSignal: false,
      reportOnUncaughtException: false,
      getReport: function() { return {}; },
      writeReport: function() { return ''; }
    },

    // Debug port
    debugPort: 9229,

    // Allow customization
    _cwd: ${JSON.stringify(cwd)},
    _umask: 0o022
  };

  // Add hrtime.bigint
  process.hrtime.bigint = function() {
    const now = typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
    return BigInt(Math.floor(now * 1e6));
  };

  // Make process.off an alias for removeListener
  process.off = process.removeListener;

  // Expose globally
  globalThis.process = process;

  return process;
})();
`;
}

/**
 * Minimal process setup for backwards compatibility.
 * Use generateProcessPolyfill for full npm compatibility.
 */
export const MINIMAL_PROCESS_SETUP = `
  globalThis.process = globalThis.process || {};
  globalThis.process.cwd = function() { return '/'; };
  globalThis.process.env = globalThis.process.env || {};
`;
