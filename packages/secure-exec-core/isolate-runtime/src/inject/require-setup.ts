// @ts-nocheck
// This file is executed inside the isolate runtime.
      const __requireExposeCustomGlobal =
        typeof globalThis.__runtimeExposeCustomGlobal === "function"
          ? globalThis.__runtimeExposeCustomGlobal
          : function exposeCustomGlobal(name, value) {
              Object.defineProperty(globalThis, name, {
                value,
                writable: false,
                configurable: false,
                enumerable: true,
              });
            };

      if (
        typeof globalThis.AbortController === 'undefined' ||
        typeof globalThis.AbortSignal === 'undefined'
      ) {
        class AbortSignal {
          constructor() {
            this.aborted = false;
            this.reason = undefined;
            this.onabort = null;
            this._listeners = [];
          }

          addEventListener(type, listener) {
            if (type !== 'abort' || typeof listener !== 'function') return;
            this._listeners.push(listener);
          }

          removeEventListener(type, listener) {
            if (type !== 'abort' || typeof listener !== 'function') return;
            const index = this._listeners.indexOf(listener);
            if (index !== -1) {
              this._listeners.splice(index, 1);
            }
          }

          dispatchEvent(event) {
            if (!event || event.type !== 'abort') return false;
            if (typeof this.onabort === 'function') {
              try {
                this.onabort.call(this, event);
              } catch {}
            }
            const listeners = this._listeners.slice();
            for (const listener of listeners) {
              try {
                listener.call(this, event);
              } catch {}
            }
            return true;
          }
        }

        class AbortController {
          constructor() {
            this.signal = new AbortSignal();
          }

          abort(reason) {
            if (this.signal.aborted) return;
            this.signal.aborted = true;
            this.signal.reason = reason;
            this.signal.dispatchEvent({ type: 'abort' });
          }
        }

        __requireExposeCustomGlobal('AbortSignal', AbortSignal);
        __requireExposeCustomGlobal('AbortController', AbortController);
      }

      if (typeof globalThis.structuredClone !== 'function') {
        function structuredClonePolyfill(value) {
          if (value === null || typeof value !== 'object') {
            return value;
          }
          if (value instanceof ArrayBuffer) {
            return value.slice(0);
          }
          if (ArrayBuffer.isView(value)) {
            if (value instanceof Uint8Array) {
              return new Uint8Array(value);
            }
            return new value.constructor(value);
          }
          return JSON.parse(JSON.stringify(value));
        }

        __requireExposeCustomGlobal('structuredClone', structuredClonePolyfill);
      }

      if (typeof globalThis.btoa !== 'function') {
        __requireExposeCustomGlobal('btoa', function btoa(input) {
          return Buffer.from(String(input), 'binary').toString('base64');
        });
      }

      if (typeof globalThis.atob !== 'function') {
        __requireExposeCustomGlobal('atob', function atob(input) {
          return Buffer.from(String(input), 'base64').toString('binary');
        });
      }

      // Path utilities
      function _dirname(p) {
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash === -1) return '.';
        if (lastSlash === 0) return '/';
        return p.slice(0, lastSlash);
      }

      // Patch known polyfill gaps in one place after evaluation.
      function _patchPolyfill(name, result) {
        if ((typeof result !== 'object' && typeof result !== 'function') || result === null) {
          return result;
        }

        if (name === 'buffer') {
          const maxLength =
            typeof result.kMaxLength === 'number'
              ? result.kMaxLength
              : 2147483647;
          const maxStringLength =
            typeof result.kStringMaxLength === 'number'
              ? result.kStringMaxLength
              : 536870888;

          if (typeof result.constants !== 'object' || result.constants === null) {
            result.constants = {};
          }
          if (typeof result.constants.MAX_LENGTH !== 'number') {
            result.constants.MAX_LENGTH = maxLength;
          }
          if (typeof result.constants.MAX_STRING_LENGTH !== 'number') {
            result.constants.MAX_STRING_LENGTH = maxStringLength;
          }
          if (typeof result.kMaxLength !== 'number') {
            result.kMaxLength = maxLength;
          }
          if (typeof result.kStringMaxLength !== 'number') {
            result.kStringMaxLength = maxStringLength;
          }

          const BufferCtor = result.Buffer;
          if (
            (typeof BufferCtor === 'function' || typeof BufferCtor === 'object') &&
            BufferCtor !== null
          ) {
            if (typeof BufferCtor.kMaxLength !== 'number') {
              BufferCtor.kMaxLength = maxLength;
            }
            if (typeof BufferCtor.kStringMaxLength !== 'number') {
              BufferCtor.kStringMaxLength = maxStringLength;
            }
            if (
              typeof BufferCtor.constants !== 'object' ||
              BufferCtor.constants === null
            ) {
              BufferCtor.constants = result.constants;
            }
          }

          return result;
        }

        if (
          name === 'util' &&
          typeof result.formatWithOptions === 'undefined' &&
          typeof result.format === 'function'
        ) {
          result.formatWithOptions = function formatWithOptions(inspectOptions, ...args) {
            return result.format.apply(null, args);
          };
          return result;
        }

	        if (name === 'url') {
	          const OriginalURL = result.URL;
	          if (typeof OriginalURL !== 'function' || OriginalURL._patched) {
	            return result;
	          }

          const PatchedURL = function PatchedURL(url, base) {
            if (
              typeof url === 'string' &&
              url.startsWith('file:') &&
              !url.startsWith('file://') &&
              base === undefined
            ) {
              if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                const cwd = process.cwd();
                if (cwd) {
                  try {
                    return new OriginalURL(url, 'file://' + cwd + '/');
                  } catch (e) {
                    // Fall through to original behavior.
                  }
                }
              }
            }
            return base !== undefined ? new OriginalURL(url, base) : new OriginalURL(url);
          };

	          Object.keys(OriginalURL).forEach(function(key) {
	            try {
	              PatchedURL[key] = OriginalURL[key];
	            } catch {
	              // Ignore read-only static properties on URL.
	            }
	          });
	          Object.setPrototypeOf(PatchedURL, OriginalURL);
	          PatchedURL.prototype = OriginalURL.prototype;
	          PatchedURL._patched = true;
	          const descriptor = Object.getOwnPropertyDescriptor(result, 'URL');
	          if (
	            descriptor &&
	            descriptor.configurable !== true &&
	            descriptor.writable !== true &&
	            typeof descriptor.set !== 'function'
	          ) {
	            return result;
	          }
	          try {
	            result.URL = PatchedURL;
	          } catch {
	            try {
	              Object.defineProperty(result, 'URL', {
	                value: PatchedURL,
	                writable: true,
	                configurable: true,
	                enumerable: descriptor?.enumerable ?? true,
	              });
	            } catch {
	              // Keep original URL implementation if it is not writable.
	            }
	          }
	          return result;
	        }

        if (name === 'crypto') {
          // Overlay host-backed createHash on top of crypto-browserify polyfill
          if (typeof _cryptoHashDigest !== 'undefined') {
            function SandboxHash(algorithm) {
              this._algorithm = algorithm;
              this._chunks = [];
            }
            SandboxHash.prototype.update = function update(data, inputEncoding) {
              if (typeof data === 'string') {
                this._chunks.push(Buffer.from(data, inputEncoding || 'utf8'));
              } else {
                this._chunks.push(Buffer.from(data));
              }
              return this;
            };
            SandboxHash.prototype.digest = function digest(encoding) {
              var combined = Buffer.concat(this._chunks);
              var resultBase64 = _cryptoHashDigest.applySync(undefined, [
                this._algorithm,
                combined.toString('base64'),
              ]);
              var resultBuffer = Buffer.from(resultBase64, 'base64');
              if (!encoding || encoding === 'buffer') return resultBuffer;
              return resultBuffer.toString(encoding);
            };
            SandboxHash.prototype.copy = function copy() {
              var c = new SandboxHash(this._algorithm);
              c._chunks = this._chunks.slice();
              return c;
            };
            // Minimal stream interface
            SandboxHash.prototype.write = function write(data, encoding) {
              this.update(data, encoding);
              return true;
            };
            SandboxHash.prototype.end = function end(data, encoding) {
              if (data) this.update(data, encoding);
            };
            result.createHash = function createHash(algorithm) {
              return new SandboxHash(algorithm);
            };
            result.Hash = SandboxHash;
          }

          // Overlay host-backed createHmac on top of crypto-browserify polyfill
          if (typeof _cryptoHmacDigest !== 'undefined') {
            function SandboxHmac(algorithm, key) {
              this._algorithm = algorithm;
              if (typeof key === 'string') {
                this._key = Buffer.from(key, 'utf8');
              } else {
                this._key = Buffer.from(key);
              }
              this._chunks = [];
            }
            SandboxHmac.prototype.update = function update(data, inputEncoding) {
              if (typeof data === 'string') {
                this._chunks.push(Buffer.from(data, inputEncoding || 'utf8'));
              } else {
                this._chunks.push(Buffer.from(data));
              }
              return this;
            };
            SandboxHmac.prototype.digest = function digest(encoding) {
              var combined = Buffer.concat(this._chunks);
              var resultBase64 = _cryptoHmacDigest.applySync(undefined, [
                this._algorithm,
                this._key.toString('base64'),
                combined.toString('base64'),
              ]);
              var resultBuffer = Buffer.from(resultBase64, 'base64');
              if (!encoding || encoding === 'buffer') return resultBuffer;
              return resultBuffer.toString(encoding);
            };
            SandboxHmac.prototype.copy = function copy() {
              var c = new SandboxHmac(this._algorithm, this._key);
              c._chunks = this._chunks.slice();
              return c;
            };
            // Minimal stream interface
            SandboxHmac.prototype.write = function write(data, encoding) {
              this.update(data, encoding);
              return true;
            };
            SandboxHmac.prototype.end = function end(data, encoding) {
              if (data) this.update(data, encoding);
            };
            result.createHmac = function createHmac(algorithm, key) {
              return new SandboxHmac(algorithm, key);
            };
            result.Hmac = SandboxHmac;
          }

          // Overlay host-backed randomBytes/randomInt/randomFill/randomFillSync
          if (typeof _cryptoRandomFill !== 'undefined') {
            result.randomBytes = function randomBytes(size, callback) {
              if (typeof size !== 'number' || size < 0 || size !== (size | 0)) {
                var err = new TypeError('The "size" argument must be of type number. Received type ' + typeof size);
                if (typeof callback === 'function') { callback(err); return; }
                throw err;
              }
              if (size > 2147483647) {
                var rangeErr = new RangeError('The value of "size" is out of range. It must be >= 0 && <= 2147483647. Received ' + size);
                if (typeof callback === 'function') { callback(rangeErr); return; }
                throw rangeErr;
              }
              // Generate in 65536-byte chunks (Web Crypto spec limit)
              var buf = Buffer.alloc(size);
              var offset = 0;
              while (offset < size) {
                var chunk = Math.min(size - offset, 65536);
                var base64 = _cryptoRandomFill.applySync(undefined, [chunk]);
                var hostBytes = Buffer.from(base64, 'base64');
                hostBytes.copy(buf, offset);
                offset += chunk;
              }
              if (typeof callback === 'function') {
                callback(null, buf);
                return;
              }
              return buf;
            };

            result.randomFillSync = function randomFillSync(buffer, offset, size) {
              if (offset === undefined) offset = 0;
              var byteLength = buffer.byteLength !== undefined ? buffer.byteLength : buffer.length;
              if (size === undefined) size = byteLength - offset;
              if (offset < 0 || size < 0 || offset + size > byteLength) {
                throw new RangeError('The value of "offset + size" is out of range.');
              }
              var bytes = new Uint8Array(buffer.buffer || buffer, buffer.byteOffset ? buffer.byteOffset + offset : offset, size);
              var filled = 0;
              while (filled < size) {
                var chunk = Math.min(size - filled, 65536);
                var base64 = _cryptoRandomFill.applySync(undefined, [chunk]);
                var hostBytes = Buffer.from(base64, 'base64');
                bytes.set(hostBytes, filled);
                filled += chunk;
              }
              return buffer;
            };

            result.randomFill = function randomFill(buffer, offsetOrCb, sizeOrCb, callback) {
              var offset = 0;
              var size;
              var cb;
              if (typeof offsetOrCb === 'function') {
                cb = offsetOrCb;
              } else if (typeof sizeOrCb === 'function') {
                offset = offsetOrCb || 0;
                cb = sizeOrCb;
              } else {
                offset = offsetOrCb || 0;
                size = sizeOrCb;
                cb = callback;
              }
              if (typeof cb !== 'function') {
                throw new TypeError('Callback must be a function');
              }
              try {
                result.randomFillSync(buffer, offset, size);
                cb(null, buffer);
              } catch (e) {
                cb(e);
              }
            };

            result.randomInt = function randomInt(minOrMax, maxOrCb, callback) {
              var min, max, cb;
              if (typeof maxOrCb === 'function' || maxOrCb === undefined) {
                // randomInt(max[, callback])
                min = 0;
                max = minOrMax;
                cb = maxOrCb;
              } else {
                // randomInt(min, max[, callback])
                min = minOrMax;
                max = maxOrCb;
                cb = callback;
              }
              if (!Number.isSafeInteger(min)) {
                var minErr = new TypeError('The "min" argument must be a safe integer');
                if (typeof cb === 'function') { cb(minErr); return; }
                throw minErr;
              }
              if (!Number.isSafeInteger(max)) {
                var maxErr = new TypeError('The "max" argument must be a safe integer');
                if (typeof cb === 'function') { cb(maxErr); return; }
                throw maxErr;
              }
              if (max <= min) {
                var rangeErr2 = new RangeError('The value of "max" is out of range. It must be greater than the value of "min" (' + min + ')');
                if (typeof cb === 'function') { cb(rangeErr2); return; }
                throw rangeErr2;
              }
              var range = max - min;
              // Use rejection sampling for uniform distribution
              var bytes = 6; // 48-bit entropy
              var maxValid = Math.pow(2, 48) - (Math.pow(2, 48) % range);
              var val;
              do {
                var base64 = _cryptoRandomFill.applySync(undefined, [bytes]);
                var buf = Buffer.from(base64, 'base64');
                val = buf.readUIntBE(0, bytes);
              } while (val >= maxValid);
              var result2 = min + (val % range);
              if (typeof cb === 'function') {
                cb(null, result2);
                return;
              }
              return result2;
            };
          }

          // Overlay host-backed pbkdf2/pbkdf2Sync
          if (typeof _cryptoPbkdf2 !== 'undefined') {
            result.pbkdf2Sync = function pbkdf2Sync(password, salt, iterations, keylen, digest) {
              var pwBuf = typeof password === 'string' ? Buffer.from(password, 'utf8') : Buffer.from(password);
              var saltBuf = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : Buffer.from(salt);
              var resultBase64 = _cryptoPbkdf2.applySync(undefined, [
                pwBuf.toString('base64'),
                saltBuf.toString('base64'),
                iterations,
                keylen,
                digest,
              ]);
              return Buffer.from(resultBase64, 'base64');
            };
            result.pbkdf2 = function pbkdf2(password, salt, iterations, keylen, digest, callback) {
              try {
                var derived = result.pbkdf2Sync(password, salt, iterations, keylen, digest);
                callback(null, derived);
              } catch (e) {
                callback(e);
              }
            };
          }

          // Overlay host-backed scrypt/scryptSync
          if (typeof _cryptoScrypt !== 'undefined') {
            result.scryptSync = function scryptSync(password, salt, keylen, options) {
              var pwBuf = typeof password === 'string' ? Buffer.from(password, 'utf8') : Buffer.from(password);
              var saltBuf = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : Buffer.from(salt);
              var opts = {};
              if (options) {
                if (options.N !== undefined) opts.N = options.N;
                if (options.r !== undefined) opts.r = options.r;
                if (options.p !== undefined) opts.p = options.p;
                if (options.maxmem !== undefined) opts.maxmem = options.maxmem;
                if (options.cost !== undefined) opts.N = options.cost;
                if (options.blockSize !== undefined) opts.r = options.blockSize;
                if (options.parallelization !== undefined) opts.p = options.parallelization;
              }
              var resultBase64 = _cryptoScrypt.applySync(undefined, [
                pwBuf.toString('base64'),
                saltBuf.toString('base64'),
                keylen,
                JSON.stringify(opts),
              ]);
              return Buffer.from(resultBase64, 'base64');
            };
            result.scrypt = function scrypt(password, salt, keylen, optionsOrCb, callback) {
              var opts = optionsOrCb;
              var cb = callback;
              if (typeof optionsOrCb === 'function') {
                opts = undefined;
                cb = optionsOrCb;
              }
              try {
                var derived = result.scryptSync(password, salt, keylen, opts);
                cb(null, derived);
              } catch (e) {
                cb(e);
              }
            };
          }

          return result;
        }

        if (name === 'path') {
          if (result.win32 === null || result.win32 === undefined) {
            result.win32 = result.posix || result;
          }
          if (result.posix === null || result.posix === undefined) {
            result.posix = result;
          }

          const hasAbsoluteSegment = function(args) {
            return args.some(function(arg) {
              return (
                typeof arg === 'string' &&
                arg.length > 0 &&
                arg.charAt(0) === '/'
              );
            });
          };

          const prependCwd = function(args) {
            if (hasAbsoluteSegment(args)) return;
            if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
              const cwd = process.cwd();
              if (cwd && cwd.charAt(0) === '/') {
                args.unshift(cwd);
              }
            }
          };

          const originalResolve = result.resolve;
          if (typeof originalResolve === 'function' && !originalResolve._patchedForCwd) {
            const patchedResolve = function resolve() {
              const args = Array.from(arguments);
              prependCwd(args);
              return originalResolve.apply(this, args);
            };
            patchedResolve._patchedForCwd = true;
            result.resolve = patchedResolve;
          }

          if (
            result.posix &&
            typeof result.posix.resolve === 'function' &&
            !result.posix.resolve._patchedForCwd
          ) {
            const originalPosixResolve = result.posix.resolve;
            const patchedPosixResolve = function resolve() {
              const args = Array.from(arguments);
              prependCwd(args);
              return originalPosixResolve.apply(this, args);
            };
            patchedPosixResolve._patchedForCwd = true;
            result.posix.resolve = patchedPosixResolve;
          }
        }

        return result;
      }

      // Set up support-tier policy for unimplemented core modules
      const _deferredCoreModules = new Set([
        'net',
        'tls',
        'readline',
        'perf_hooks',
        'async_hooks',
        'worker_threads',
        'diagnostics_channel',
      ]);
      const _unsupportedCoreModules = new Set([
        'dgram',
        'cluster',
        'wasi',
        'inspector',
        'repl',
        'trace_events',
        'domain',
      ]);

      // Get deterministic unsupported API errors
      function _unsupportedApiError(moduleName, apiName) {
        return new Error(moduleName + '.' + apiName + ' is not supported in sandbox');
      }

      // Create deferred module stubs that throw on API calls
      function _createDeferredModuleStub(moduleName) {
        const methodCache = {};
        let stub = null;
        stub = new Proxy({}, {
          get(_target, prop) {
            if (prop === '__esModule') return false;
            if (prop === 'default') return stub;
            if (prop === Symbol.toStringTag) return 'Module';
            if (prop === 'then') return undefined;
            if (typeof prop !== 'string') return undefined;
            if (!methodCache[prop]) {
              methodCache[prop] = function deferredApiStub() {
                throw _unsupportedApiError(moduleName, prop);
              };
            }
            return methodCache[prop];
          },
        });
        return stub;
      }

      // Capture the real module cache for internal use before exposing a read-only view
      const __internalModuleCache = _moduleCache;

      const __require = function require(moduleName) {
        return _requireFrom(moduleName, _currentModule.dirname);
      };
      __requireExposeCustomGlobal("require", __require);

      function _resolveFrom(moduleName, fromDir) {
        const resolved = _resolveModule.applySyncPromise(undefined, [moduleName, fromDir]);
        if (resolved === null) {
          const err = new Error("Cannot find module '" + moduleName + "'");
          err.code = 'MODULE_NOT_FOUND';
          throw err;
        }
        return resolved;
      }

      globalThis.require.resolve = function resolve(moduleName) {
        return _resolveFrom(moduleName, _currentModule.dirname);
      };

      function _debugRequire(phase, moduleName, extra) {
        if (globalThis.__sandboxRequireDebug !== true) {
          return;
        }
        if (
          moduleName !== 'rivetkit' &&
          moduleName !== '@rivetkit/traces' &&
          moduleName !== '@rivetkit/on-change' &&
          moduleName !== 'async_hooks' &&
          !moduleName.startsWith('rivetkit/') &&
          !moduleName.startsWith('@rivetkit/')
        ) {
          return;
        }
        if (typeof console !== 'undefined' && typeof console.log === 'function') {
          console.log(
            '[sandbox.require] ' +
              phase +
              ' ' +
              moduleName +
              (extra ? ' ' + extra : ''),
          );
        }
      }

      function _requireFrom(moduleName, fromDir) {
        _debugRequire('start', moduleName, fromDir);
        // Strip node: prefix
        const name = moduleName.replace(/^node:/, '');

        // For absolute paths (resolved paths), use as cache key
        // For relative/bare imports, resolve first
        let cacheKey = name;
        let resolved = null;

        // Check if it's a relative import
        const isRelative = name.startsWith('./') || name.startsWith('../');

        // Get cached modules for bare/absolute specifiers up front.
        if (!isRelative && __internalModuleCache[name]) {
          _debugRequire('cache-hit', name, name);
          return __internalModuleCache[name];
        }

        // Special handling for fs module
        if (name === 'fs') {
          if (__internalModuleCache['fs']) return __internalModuleCache['fs'];
          const fsModule = globalThis.bridge?.fs || globalThis.bridge?.default || globalThis._fsModule || {};
          __internalModuleCache['fs'] = fsModule;
          _debugRequire('loaded', name, 'fs-special');
          return fsModule;
        }

        // Special handling for fs/promises module
        if (name === 'fs/promises') {
          if (__internalModuleCache['fs/promises']) return __internalModuleCache['fs/promises'];
          // Get fs module first, then extract promises
          const fsModule = _requireFrom('fs', fromDir);
          __internalModuleCache['fs/promises'] = fsModule.promises;
          _debugRequire('loaded', name, 'fs-promises-special');
          return fsModule.promises;
        }

        // Special handling for stream/promises module.
        // Expose promise-based wrappers backed by stream callback APIs.
        if (name === 'stream/promises') {
          if (__internalModuleCache['stream/promises']) return __internalModuleCache['stream/promises'];
          const streamModule = _requireFrom('stream', fromDir);
          const promisesModule = {
            finished(stream, options) {
              return new Promise(function(resolve, reject) {
                if (typeof streamModule.finished !== 'function') {
                  resolve();
                  return;
                }

                if (
                  options &&
                  typeof options === 'object' &&
                  !Array.isArray(options)
                ) {
                  streamModule.finished(stream, options, function(error) {
                    if (error) {
                      reject(error);
                      return;
                    }
                    resolve();
                  });
                  return;
                }

                streamModule.finished(stream, function(error) {
                  if (error) {
                    reject(error);
                    return;
                  }
                  resolve();
                });
              });
            },
            pipeline() {
              const args = Array.prototype.slice.call(arguments);
              return new Promise(function(resolve, reject) {
                if (typeof streamModule.pipeline !== 'function') {
                  reject(new Error('stream.pipeline is not supported in sandbox'));
                  return;
                }
                args.push(function(error) {
                  if (error) {
                    reject(error);
                    return;
                  }
                  resolve();
                });
                streamModule.pipeline.apply(streamModule, args);
              });
            },
          };
          __internalModuleCache['stream/promises'] = promisesModule;
          _debugRequire('loaded', name, 'stream-promises-special');
          return promisesModule;
        }

        // Special handling for child_process module
        if (name === 'child_process') {
          if (__internalModuleCache['child_process']) return __internalModuleCache['child_process'];
          __internalModuleCache['child_process'] = _childProcessModule;
          _debugRequire('loaded', name, 'child-process-special');
          return _childProcessModule;
        }

        // Special handling for http module
        if (name === 'http') {
          if (__internalModuleCache['http']) return __internalModuleCache['http'];
          __internalModuleCache['http'] = _httpModule;
          _debugRequire('loaded', name, 'http-special');
          return _httpModule;
        }

        // Special handling for https module
        if (name === 'https') {
          if (__internalModuleCache['https']) return __internalModuleCache['https'];
          __internalModuleCache['https'] = _httpsModule;
          _debugRequire('loaded', name, 'https-special');
          return _httpsModule;
        }

        // Special handling for http2 module
        if (name === 'http2') {
          if (__internalModuleCache['http2']) return __internalModuleCache['http2'];
          __internalModuleCache['http2'] = _http2Module;
          _debugRequire('loaded', name, 'http2-special');
          return _http2Module;
        }

        // Special handling for dns module
        if (name === 'dns') {
          if (__internalModuleCache['dns']) return __internalModuleCache['dns'];
          __internalModuleCache['dns'] = _dnsModule;
          _debugRequire('loaded', name, 'dns-special');
          return _dnsModule;
        }

        // Special handling for os module
        if (name === 'os') {
          if (__internalModuleCache['os']) return __internalModuleCache['os'];
          __internalModuleCache['os'] = _osModule;
          _debugRequire('loaded', name, 'os-special');
          return _osModule;
        }

        // Special handling for module module
        if (name === 'module') {
          if (__internalModuleCache['module']) return __internalModuleCache['module'];
          __internalModuleCache['module'] = _moduleModule;
          _debugRequire('loaded', name, 'module-special');
          return _moduleModule;
        }

        // Special handling for process module - return our bridge's process object.
        // This prevents node-stdlib-browser's process polyfill from overwriting it.
        if (name === 'process') {
          _debugRequire('loaded', name, 'process-special');
          return globalThis.process;
        }

        // Special handling for async_hooks.
        // This provides the minimum API surface needed by tracing libraries.
        if (name === 'async_hooks') {
          if (__internalModuleCache['async_hooks']) return __internalModuleCache['async_hooks'];

          class AsyncLocalStorage {
            constructor() {
              this._store = undefined;
            }

            run(store, callback) {
              const previousStore = this._store;
              this._store = store;
              try {
                const args = Array.prototype.slice.call(arguments, 2);
                return callback.apply(undefined, args);
              } finally {
                this._store = previousStore;
              }
            }

            enterWith(store) {
              this._store = store;
            }

            getStore() {
              return this._store;
            }

            disable() {
              this._store = undefined;
            }

            exit(callback) {
              const previousStore = this._store;
              this._store = undefined;
              try {
                const args = Array.prototype.slice.call(arguments, 1);
                return callback.apply(undefined, args);
              } finally {
                this._store = previousStore;
              }
            }
          }

          class AsyncResource {
            constructor(type) {
              this.type = type;
            }

            runInAsyncScope(callback, thisArg) {
              const args = Array.prototype.slice.call(arguments, 2);
              return callback.apply(thisArg, args);
            }

            emitDestroy() {}
          }

          const asyncHooksModule = {
            AsyncLocalStorage,
            AsyncResource,
            createHook() {
              return {
                enable() { return this; },
                disable() { return this; },
              };
            },
            executionAsyncId() { return 1; },
            triggerAsyncId() { return 0; },
            executionAsyncResource() { return null; },
          };

          __internalModuleCache['async_hooks'] = asyncHooksModule;
          _debugRequire('loaded', name, 'async-hooks-special');
          return asyncHooksModule;
        }

        // No-op diagnostics_channel stub — channels report no subscribers
        if (name === 'diagnostics_channel') {
          if (__internalModuleCache[name]) return __internalModuleCache[name];

          function _createChannel() {
            return {
              hasSubscribers: false,
              publish: function () {},
              subscribe: function () {},
              unsubscribe: function () {},
            };
          }

          const dcModule = {
            channel: function () { return _createChannel(); },
            hasSubscribers: function () { return false; },
            tracingChannel: function () {
              return {
                start: _createChannel(),
                end: _createChannel(),
                asyncStart: _createChannel(),
                asyncEnd: _createChannel(),
                error: _createChannel(),
              };
            },
            Channel: function Channel(name) {
              this.hasSubscribers = false;
              this.publish = function () {};
              this.subscribe = function () {};
              this.unsubscribe = function () {};
            },
          };

          __internalModuleCache[name] = dcModule;
          _debugRequire('loaded', name, 'diagnostics-channel-special');
          return dcModule;
        }

        // Get deferred module stubs
        if (_deferredCoreModules.has(name)) {
          if (__internalModuleCache[name]) return __internalModuleCache[name];
          const deferredStub = _createDeferredModuleStub(name);
          __internalModuleCache[name] = deferredStub;
          _debugRequire('loaded', name, 'deferred-stub');
          return deferredStub;
        }

        // Wait for unsupported modules to fail fast on require()
        if (_unsupportedCoreModules.has(name)) {
          throw new Error(name + ' is not supported in sandbox');
        }

        // Try to load polyfill first (for built-in modules like path, events, etc.)
        const polyfillCode = _loadPolyfill.applySyncPromise(undefined, [name]);
        if (polyfillCode !== null) {
          if (__internalModuleCache[name]) return __internalModuleCache[name];

          const moduleObj = { exports: {} };
          _pendingModules[name] = moduleObj;

          let result = eval(polyfillCode);
          result = _patchPolyfill(name, result);
          if (typeof result === 'object' && result !== null) {
            Object.assign(moduleObj.exports, result);
          } else {
            moduleObj.exports = result;
          }

          __internalModuleCache[name] = moduleObj.exports;
          delete _pendingModules[name];
          _debugRequire('loaded', name, 'polyfill');
          return __internalModuleCache[name];
        }

        // Resolve module path using host-side resolution
        resolved = _resolveFrom(name, fromDir);

        // Use resolved path as cache key
        cacheKey = resolved;

        // Check cache with resolved path
        if (__internalModuleCache[cacheKey]) {
          _debugRequire('cache-hit', name, cacheKey);
          return __internalModuleCache[cacheKey];
        }

        // Check if we're currently loading this module (circular dep)
        if (_pendingModules[cacheKey]) {
          _debugRequire('pending-hit', name, cacheKey);
          return _pendingModules[cacheKey].exports;
        }

        // Load file content
        const source = _loadFile.applySyncPromise(undefined, [resolved]);
        if (source === null) {
          const err = new Error("Cannot find module '" + resolved + "'");
          err.code = 'MODULE_NOT_FOUND';
          throw err;
        }

	        // Handle JSON files
	        if (resolved.endsWith('.json')) {
	          const parsed = JSON.parse(source);
	          __internalModuleCache[cacheKey] = parsed;
	          return parsed;
	        }

	        // Some CJS artifacts include import.meta.url probes that are valid in
	        // ESM but a syntax error in Function()-compiled CJS wrappers.
	        const normalizedSource =
	          typeof source === 'string'
	            ? source
	                .replace(/import\.meta\.url/g, '__filename')
	                .replace(/fileURLToPath\(__filename\)/g, '__filename')
	                .replace(/url\.fileURLToPath\(__filename\)/g, '__filename')
	                .replace(/fileURLToPath\.call\(void 0, __filename\)/g, '__filename')
	            : source;

        // Create module object
        const module = {
          exports: {},
          filename: resolved,
          dirname: _dirname(resolved),
          id: resolved,
          loaded: false,
        };
        _pendingModules[cacheKey] = module;

        // Track current module for nested requires
        const prevModule = _currentModule;
        _currentModule = module;

        try {
          // Wrap and execute the code
          let wrapper;
          try {
	            wrapper = new Function(
	              'exports',
	              'require',
	              'module',
	              '__filename',
	              '__dirname',
	              '__dynamicImport',
	              normalizedSource + '\n//# sourceURL=' + resolved
	            );
          } catch (error) {
            const details =
              error && error.stack ? error.stack : String(error);
            throw new Error('failed to compile module ' + resolved + ': ' + details);
          }

          // Create a require function that resolves from this module's directory
          const moduleRequire = function(request) {
            return _requireFrom(request, module.dirname);
          };
          moduleRequire.resolve = function(request) {
            return _resolveFrom(request, module.dirname);
          };

          // Create a module-local __dynamicImport that resolves from this module's directory.
          const moduleDynamicImport = function(specifier) {
            if (typeof globalThis.__dynamicImport === 'function') {
              return globalThis.__dynamicImport(specifier, module.dirname);
            }
            return Promise.reject(new Error('Dynamic import is not initialized'));
          };

          wrapper(
            module.exports,
            moduleRequire,
            module,
            resolved,
            module.dirname,
            moduleDynamicImport
          );

          module.loaded = true;
        } catch (error) {
          const details =
            error && error.stack ? error.stack : String(error);
          throw new Error('failed to execute module ' + resolved + ': ' + details);
        } finally {
          _currentModule = prevModule;
        }

        // Cache with resolved path
        __internalModuleCache[cacheKey] = module.exports;
        delete _pendingModules[cacheKey];
        _debugRequire('loaded', name, cacheKey);

        return module.exports;
      }

      // Expose _requireFrom globally so module polyfill can access it
      __requireExposeCustomGlobal("_requireFrom", _requireFrom);

      // Block module cache poisoning: create a read-only Proxy over the real cache.
      // Internal require writes go through __internalModuleCache (captured above);
      // sandbox code sees only this Proxy which rejects set/delete/defineProperty.
      const __moduleCacheProxy = new Proxy(__internalModuleCache, {
        get(target, prop, receiver) {
          return Reflect.get(target, prop, receiver);
        },
        set(_target, prop) {
          throw new TypeError("Cannot set require.cache['" + String(prop) + "']");
        },
        deleteProperty(_target, prop) {
          throw new TypeError("Cannot delete require.cache['" + String(prop) + "']");
        },
        defineProperty(_target, prop) {
          throw new TypeError("Cannot define property '" + String(prop) + "' on require.cache");
        },
        has(target, prop) {
          return Reflect.has(target, prop);
        },
        ownKeys(target) {
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, prop) {
          return Reflect.getOwnPropertyDescriptor(target, prop);
        },
      });

      // Expose read-only proxy as require.cache
      globalThis.require.cache = __moduleCacheProxy;

      // Replace _moduleCache global with read-only proxy so sandbox code
      // cannot bypass require.cache protection via the raw global.
      // Keep configurable:true — applyCustomGlobalExposurePolicy will lock it
      // down to non-configurable after all bridge setup completes.
      Object.defineProperty(globalThis, '_moduleCache', {
        value: __moduleCacheProxy,
        writable: false,
        configurable: true,
        enumerable: false,
      });

      // Update Module._cache references to use the read-only proxy
      if (typeof _moduleModule !== 'undefined') {
        if (_moduleModule.Module) {
          _moduleModule.Module._cache = __moduleCacheProxy;
        }
        _moduleModule._cache = __moduleCacheProxy;
      }
