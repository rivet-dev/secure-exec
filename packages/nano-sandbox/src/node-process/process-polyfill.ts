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
  const version = config.version ?? "v22.0.0";
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
      // Return stub implementations for common bindings
      const stubs = {
        fs: {},
        buffer: { Buffer: globalThis.Buffer },
        process_wrap: {},
        natives: {},
        config: {},
        uv: { UV_UDP_REUSEADDR: 4 },
        constants: {},
        crypto: {},
        string_decoder: {},
        os: {}
      };
      return stubs[name] || {};
    },

    _linkedBinding: function(name) {
      // Same as binding
      return process.binding(name);
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

  // Timer implementation
  // These are simple implementations that work synchronously within script execution
  let _timerId = 0;
  const _timers = new Map();
  const _intervals = new Map();

  // Use Promise.resolve().then() for microtask scheduling since queueMicrotask may not be available
  const _queueMicrotask = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : function(fn) { Promise.resolve().then(fn); };

  // Timer handle class that mimics Node.js Timeout object
  class TimerHandle {
    constructor(id) {
      this._id = id;
      this._destroyed = false;
    }
    ref() { return this; }
    unref() { return this; }
    hasRef() { return true; }
    refresh() { return this; }
    [Symbol.toPrimitive]() { return this._id; }
  }

  globalThis.setTimeout = function(callback, delay, ...args) {
    const id = ++_timerId;
    const handle = new TimerHandle(id);
    // In sandbox, we'll queue via microtask since we don't have a real event loop
    // For npm's use case (progress bars), a no-op delay is acceptable
    _queueMicrotask(() => {
      if (_timers.has(id)) {
        _timers.delete(id);
        try {
          callback(...args);
        } catch (e) {
          // Ignore timer callback errors
        }
      }
    });
    _timers.set(id, handle);
    return handle;
  };

  globalThis.clearTimeout = function(timer) {
    const id = timer && timer._id !== undefined ? timer._id : timer;
    _timers.delete(id);
  };

  globalThis.setInterval = function(callback, delay, ...args) {
    const id = ++_timerId;
    const handle = new TimerHandle(id);
    // For sandbox, interval just runs once (like setTimeout)
    // Real intervals would require an event loop
    _intervals.set(id, handle);
    _queueMicrotask(() => {
      if (_intervals.has(id)) {
        try {
          callback(...args);
        } catch (e) {
          // Ignore timer callback errors
        }
      }
    });
    return handle;
  };

  globalThis.clearInterval = function(timer) {
    const id = timer && timer._id !== undefined ? timer._id : timer;
    _intervals.delete(id);
  };

  globalThis.setImmediate = function(callback, ...args) {
    return globalThis.setTimeout(callback, 0, ...args);
  };

  globalThis.clearImmediate = function(id) {
    globalThis.clearTimeout(id);
  };

  // Also expose queueMicrotask globally
  if (typeof globalThis.queueMicrotask === 'undefined') {
    globalThis.queueMicrotask = _queueMicrotask;
  }

  // Provide URL if not available (used by npm for registry URLs)
  if (typeof globalThis.URL === 'undefined') {
    // Minimal URL implementation for npm
    globalThis.URL = class URL {
      constructor(url, base) {
        // Ensure url is a string (might be a URL object)
        let urlStr = typeof url === 'object' && url !== null && typeof url.toString === 'function'
          ? url.toString()
          : String(url);
        let fullUrl = urlStr;

        if (base) {
          // Ensure base is a string
          const baseStr = typeof base === 'object' && base !== null && typeof base.toString === 'function'
            ? base.toString()
            : String(base);

          // Check if urlStr is already absolute (has a protocol with proper URL structure)
          // Note: "file:." and "file:./path" are NOT absolute - they're relative file refs
          // Only "file://..." is truly absolute
          let isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr);

          // Special case: "file:" without "//" is a relative file reference
          if (urlStr.startsWith('file:') && !urlStr.startsWith('file://')) {
            isAbsolute = false;
            // Strip the "file:" prefix to get the relative path
            urlStr = urlStr.slice(5);
          }

          if (!isAbsolute) {
            // Handle file:// base URLs specially
            if (baseStr.startsWith('file://')) {
              // Extract the path from file:// URL
              let basePath = baseStr.slice(7); // Remove 'file://'
              // Handle file:/// (3 slashes for Unix absolute paths)
              if (basePath.startsWith('/')) {
                basePath = basePath; // Keep leading slash
              }

              // Resolve the relative path
              let resolvedPath;
              if (urlStr.startsWith('/')) {
                // Absolute path
                resolvedPath = urlStr;
              } else {
                // Relative path - resolve against base directory
                // Get directory of base path (remove trailing filename if any)
                let baseDir = basePath;
                if (!baseDir.endsWith('/')) {
                  const lastSlash = baseDir.lastIndexOf('/');
                  baseDir = lastSlash >= 0 ? baseDir.slice(0, lastSlash + 1) : '/';
                }

                // Combine and normalize path
                const combined = baseDir + urlStr;
                const parts = combined.split('/');
                const normalized = [];
                for (const part of parts) {
                  if (part === '..') {
                    normalized.pop();
                  } else if (part !== '.' && part !== '') {
                    normalized.push(part);
                  }
                }
                resolvedPath = '/' + normalized.join('/');
              }

              fullUrl = 'file://' + resolvedPath;
            } else {
              // HTTP/HTTPS base URL handling
              const baseUrl = new URL(baseStr);
              if (urlStr.startsWith('/')) {
                fullUrl = baseUrl.origin + urlStr;
              } else {
                fullUrl = baseStr.replace(/[^/]*$/, '') + urlStr;
              }
            }
          }
        }

        // Parse the URL (support http, https, and file protocols)
        let match = fullUrl.match(/^(https?:)\\/\\/([^/:]+)(?::(\\d+))?(\\/[^?#]*)?(\\?[^#]*)?(#.*)?$/);

        if (!match) {
          // Try file:// URLs (full form)
          const fileMatch = fullUrl.match(/^file:\\/\\/(\\/[^?#]*)?(\\?[^#]*)?(#.*)?$/);
          if (fileMatch) {
            this.protocol = 'file:';
            this.host = '';
            this.hostname = '';
            this.port = '';
            this.pathname = fileMatch[1] || '/';
            this.search = fileMatch[2] || '';
            this.hash = fileMatch[3] || '';
            this.origin = 'null';
            this.href = 'file://' + this.pathname + this.search + this.hash;
            this.searchParams = new URLSearchParams(this.search);
            return;
          }

          // Try bare "file:" or "file:path" (without //)
          // Only accept absolute paths (starting with /) - relative paths require a base
          const bareFileMatch = fullUrl.match(/^file:(\\/[^?#]*)?(\\?[^#]*)?(#.*)?$/);
          if (bareFileMatch) {
            this.protocol = 'file:';
            this.host = '';
            this.hostname = '';
            this.port = '';
            this.pathname = bareFileMatch[1] || '/';
            this.search = bareFileMatch[2] || '';
            this.hash = bareFileMatch[3] || '';
            this.origin = 'null';
            this.href = 'file://' + this.pathname + this.search + this.hash;
            this.searchParams = new URLSearchParams(this.search);
            return;
          }

          throw new TypeError('Invalid URL: ' + urlStr);
        }

        this.href = fullUrl;
        this.protocol = match[1] || '';
        this.host = match[2] + (match[3] ? ':' + match[3] : '');
        this.hostname = match[2] || '';
        this.port = match[3] || '';
        this.pathname = match[4] || '/';
        this.search = match[5] || '';
        this.hash = match[6] || '';
        this.origin = this.protocol + '//' + this.host;
        this.searchParams = new URLSearchParams(this.search);
      }
      toString() { return this.href; }
      toJSON() { return this.href; }
    };
  }

  if (typeof globalThis.URLSearchParams === 'undefined') {
    globalThis.URLSearchParams = class URLSearchParams {
      constructor(init) {
        this._params = new Map();
        if (typeof init === 'string') {
          const params = init.startsWith('?') ? init.slice(1) : init;
          for (const pair of params.split('&')) {
            const [key, value] = pair.split('=').map(decodeURIComponent);
            if (key) this._params.set(key, value || '');
          }
        } else if (init && typeof init === 'object') {
          for (const [key, value] of Object.entries(init)) {
            this._params.set(key, value);
          }
        }
      }
      get(key) { return this._params.get(key) || null; }
      set(key, value) { this._params.set(key, value); }
      has(key) { return this._params.has(key); }
      delete(key) { this._params.delete(key); }
      append(key, value) { this._params.set(key, value); }
      toString() {
        return Array.from(this._params.entries())
          .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
          .join('&');
      }
      *entries() { yield* this._params.entries(); }
      *keys() { yield* this._params.keys(); }
      *values() { yield* this._params.values(); }
      forEach(cb) { this._params.forEach(cb); }
      [Symbol.iterator]() { return this._params[Symbol.iterator](); }
    };
  }

  // Provide TextEncoder/TextDecoder if not available (needed for Buffer)
  if (typeof globalThis.TextEncoder === 'undefined') {
    // Simple UTF-8 only TextEncoder
    globalThis.TextEncoder = class TextEncoder {
      get encoding() { return 'utf-8'; }
      encode(str) {
        const utf8 = [];
        for (let i = 0; i < str.length; i++) {
          let charCode = str.charCodeAt(i);
          if (charCode < 0x80) {
            utf8.push(charCode);
          } else if (charCode < 0x800) {
            utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
          } else if (charCode < 0xd800 || charCode >= 0xe000) {
            utf8.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
          } else {
            // surrogate pair
            i++;
            charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
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
      encodeInto(str, dest) {
        const encoded = this.encode(str);
        const len = Math.min(encoded.length, dest.length);
        dest.set(encoded.subarray(0, len));
        return { read: str.length, written: len };
      }
    };
  }

  if (typeof globalThis.TextDecoder === 'undefined') {
    // Simple UTF-8 only TextDecoder
    globalThis.TextDecoder = class TextDecoder {
      constructor(encoding) {
        this._encoding = encoding || 'utf-8';
      }
      get encoding() { return this._encoding; }
      decode(input) {
        if (!input) return '';
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        let result = '';
        let i = 0;
        while (i < bytes.length) {
          const byte = bytes[i];
          if (byte < 0x80) {
            result += String.fromCharCode(byte);
            i++;
          } else if ((byte & 0xe0) === 0xc0) {
            result += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 2;
          } else if ((byte & 0xf0) === 0xe0) {
            result += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
            i += 3;
          } else if ((byte & 0xf8) === 0xf0) {
            const codePoint = ((byte & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            // Convert to surrogate pair
            const offset = codePoint - 0x10000;
            result += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
            i += 4;
          } else {
            result += '?';
            i++;
          }
        }
        return result;
      }
    };
  }

  // Provide a basic Buffer global if not already defined
  // This is a minimal implementation - the full buffer polyfill is loaded via require('buffer')
  if (typeof globalThis.Buffer === 'undefined') {
    class Buffer extends Uint8Array {
      static isBuffer(obj) {
        return obj instanceof Buffer || obj instanceof Uint8Array;
      }

      static from(value, encodingOrOffset, length) {
        if (typeof value === 'string') {
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

      static alloc(size, fill, encoding) {
        const buf = new Buffer(size);
        if (fill !== undefined) {
          buf.fill(typeof fill === 'number' ? fill : 0);
        }
        return buf;
      }

      static allocUnsafe(size) {
        return new Buffer(size);
      }

      static concat(list, totalLength) {
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

      static byteLength(string, encoding) {
        if (typeof string !== 'string') {
          return string.length;
        }
        const encoder = new TextEncoder();
        return encoder.encode(string).length;
      }

      toString(encoding, start, end) {
        const decoder = new TextDecoder(encoding === 'utf8' || encoding === 'utf-8' ? 'utf-8' : 'utf-8');
        const slice = start !== undefined || end !== undefined
          ? this.subarray(start || 0, end)
          : this;
        return decoder.decode(slice);
      }

      write(string, offset, length, encoding) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(string);
        const writeLen = Math.min(bytes.length, length !== undefined ? length : this.length - (offset || 0));
        this.set(bytes.subarray(0, writeLen), offset || 0);
        return writeLen;
      }

      copy(target, targetStart, sourceStart, sourceEnd) {
        targetStart = targetStart || 0;
        sourceStart = sourceStart || 0;
        sourceEnd = sourceEnd || this.length;
        const bytes = this.subarray(sourceStart, sourceEnd);
        target.set(bytes, targetStart);
        return bytes.length;
      }

      slice(start, end) {
        return new Buffer(this.buffer, this.byteOffset + (start || 0),
          (end !== undefined ? end : this.length) - (start || 0));
      }

      equals(other) {
        if (this.length !== other.length) return false;
        for (let i = 0; i < this.length; i++) {
          if (this[i] !== other[i]) return false;
        }
        return true;
      }

      compare(other) {
        const len = Math.min(this.length, other.length);
        for (let i = 0; i < len; i++) {
          if (this[i] < other[i]) return -1;
          if (this[i] > other[i]) return 1;
        }
        if (this.length < other.length) return -1;
        if (this.length > other.length) return 1;
        return 0;
      }

      fill(value, start, end, encoding) {
        start = start || 0;
        end = end !== undefined ? end : this.length;
        const fillValue = typeof value === 'number' ? value : 0;
        for (let i = start; i < end; i++) {
          this[i] = fillValue;
        }
        return this;
      }
    }

    globalThis.Buffer = Buffer;
  }

  // Provide crypto.getRandomValues if not available (needed for uuid generation)
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues === 'undefined') {
    const cryptoPolyfill = {
      getRandomValues: function(array) {
        // Use a simple PRNG since we don't have access to secure random
        // This is NOT cryptographically secure but works for npm's use cases
        for (let i = 0; i < array.length; i++) {
          if (array instanceof Uint8Array) {
            array[i] = Math.floor(Math.random() * 256);
          } else if (array instanceof Uint16Array) {
            array[i] = Math.floor(Math.random() * 65536);
          } else if (array instanceof Uint32Array) {
            array[i] = Math.floor(Math.random() * 4294967296);
          } else {
            array[i] = Math.floor(Math.random() * 256);
          }
        }
        return array;
      },
      randomUUID: function() {
        // Generate a v4 UUID using Math.random
        const bytes = new Uint8Array(16);
        cryptoPolyfill.getRandomValues(bytes);
        // Set version (4) and variant (RFC4122)
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
      },
      // SubtleCrypto stub (not implemented but prevents errors)
      subtle: {
        digest: function() { throw new Error('crypto.subtle.digest not supported in sandbox'); },
        encrypt: function() { throw new Error('crypto.subtle.encrypt not supported in sandbox'); },
        decrypt: function() { throw new Error('crypto.subtle.decrypt not supported in sandbox'); },
      }
    };

    if (typeof globalThis.crypto === 'undefined') {
      globalThis.crypto = cryptoPolyfill;
    } else {
      // crypto exists but getRandomValues doesn't
      globalThis.crypto.getRandomValues = cryptoPolyfill.getRandomValues;
      globalThis.crypto.randomUUID = cryptoPolyfill.randomUUID;
    }
  }

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
