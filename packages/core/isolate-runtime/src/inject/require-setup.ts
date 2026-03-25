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

      // Widen TextDecoder to accept common encodings beyond utf-8.
      // The text-encoding-utf-8 polyfill only supports utf-8 and throws for
      // anything else. Packages like ssh2 import modules that create TextDecoder
      // with 'ascii' or 'latin1' at module scope. We wrap the constructor to
      // normalize known labels to utf-8 (which is a safe superset for ASCII-range
      // data) and only throw for truly unsupported encodings.
      if (typeof globalThis.TextDecoder === 'function') {
        var _OrigTextDecoder = globalThis.TextDecoder;
        var _utf8Aliases = {
          'utf-8': true, 'utf8': true, 'unicode-1-1-utf-8': true,
          'ascii': true, 'us-ascii': true, 'iso-8859-1': true,
          'latin1': true, 'binary': true, 'windows-1252': true,
          'utf-16le': true, 'utf-16': true, 'ucs-2': true, 'ucs2': true,
        };
        globalThis.TextDecoder = function TextDecoder(encoding, options) {
          var label = encoding !== undefined ? String(encoding).toLowerCase().replace(/\s/g, '') : 'utf-8';
          if (_utf8Aliases[label]) {
            return new _OrigTextDecoder('utf-8', options);
          }
          // Fall through to original for unknown encodings (will throw).
          return new _OrigTextDecoder(encoding, options);
        };
        globalThis.TextDecoder.prototype = _OrigTextDecoder.prototype;
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

            // Shim encoding-specific slice/write methods that Node.js exposes
            // on Buffer.prototype via internal V8 bindings. Packages like ssh2
            // call these directly for performance.
            var proto = BufferCtor.prototype;
            if (proto && typeof proto.utf8Slice !== 'function') {
              var encodings = ['utf8', 'latin1', 'ascii', 'hex', 'base64', 'ucs2', 'utf16le'];
              for (var ei = 0; ei < encodings.length; ei++) {
                var enc = encodings[ei];
                (function(e) {
                  if (typeof proto[e + 'Slice'] !== 'function') {
                    proto[e + 'Slice'] = function(start, end) {
                      return this.toString(e, start, end);
                    };
                  }
                  if (typeof proto[e + 'Write'] !== 'function') {
                    proto[e + 'Write'] = function(string, offset, length) {
                      return this.write(string, offset, length, e);
                    };
                  }
                })(enc);
              }
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
        }

        if (name === 'util') {
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

        if (name === 'zlib') {
          // browserify-zlib exposes Z_* values as flat exports but not as a
          // constants object. Node.js zlib.constants bundles all Z_ values plus
          // DEFLATE (1), INFLATE (2), GZIP (3), DEFLATERAW (4), INFLATERAW (5),
          // UNZIP (6), GUNZIP (7). Packages like ssh2 destructure constants.
          if (typeof result.constants !== 'object' || result.constants === null) {
            var zlibConstants = {};
            var constKeys = Object.keys(result);
            for (var ci = 0; ci < constKeys.length; ci++) {
              var ck = constKeys[ci];
              if (ck.indexOf('Z_') === 0 && typeof result[ck] === 'number') {
                zlibConstants[ck] = result[ck];
              }
            }
            // Add mode constants that Node.js exposes but browserify-zlib does not.
            if (typeof zlibConstants.DEFLATE !== 'number') zlibConstants.DEFLATE = 1;
            if (typeof zlibConstants.INFLATE !== 'number') zlibConstants.INFLATE = 2;
            if (typeof zlibConstants.GZIP !== 'number') zlibConstants.GZIP = 3;
            if (typeof zlibConstants.DEFLATERAW !== 'number') zlibConstants.DEFLATERAW = 4;
            if (typeof zlibConstants.INFLATERAW !== 'number') zlibConstants.INFLATERAW = 5;
            if (typeof zlibConstants.UNZIP !== 'number') zlibConstants.UNZIP = 6;
            if (typeof zlibConstants.GUNZIP !== 'number') zlibConstants.GUNZIP = 7;
            result.constants = zlibConstants;
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
              } else if (key && typeof key === 'object' && key._pem !== undefined) {
                // SandboxKeyObject — extract underlying key material
                this._key = Buffer.from(key._pem, 'utf8');
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

          // Overlay host-backed createCipheriv/createDecipheriv.
          // When session handlers are available (_cryptoCipherivCreate), use streaming
          // mode where update() returns real data. Otherwise fall back to one-shot mode.
          if (typeof _cryptoCipheriv !== 'undefined') {
            var _useSessionCipher = typeof _cryptoCipherivCreate !== 'undefined';

            function SandboxCipher(algorithm, key, iv) {
              this._algorithm = algorithm;
              this._key = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
              this._iv = typeof iv === 'string' ? Buffer.from(iv, 'utf8') : Buffer.from(iv);
              this._authTag = null;
              this._finalized = false;
              if (_useSessionCipher) {
                this._sessionId = _cryptoCipherivCreate.applySync(undefined, [
                  'cipher', algorithm,
                  this._key.toString('base64'),
                  this._iv.toString('base64'),
                  '',
                ]);
              } else {
                this._chunks = [];
              }
            }
            SandboxCipher.prototype.update = function update(data, inputEncoding, outputEncoding) {
              var buf;
              if (typeof data === 'string') {
                buf = Buffer.from(data, inputEncoding || 'utf8');
              } else {
                buf = Buffer.from(data);
              }
              if (_useSessionCipher) {
                var resultBase64 = _cryptoCipherivUpdate.applySync(undefined, [this._sessionId, buf.toString('base64')]);
                var resultBuffer = Buffer.from(resultBase64, 'base64');
                if (outputEncoding && outputEncoding !== 'buffer') return resultBuffer.toString(outputEncoding);
                return resultBuffer;
              }
              this._chunks.push(buf);
              if (outputEncoding && outputEncoding !== 'buffer') return '';
              return Buffer.alloc(0);
            };
            SandboxCipher.prototype.final = function final(outputEncoding) {
              if (this._finalized) throw new Error('Attempting to call final() after already finalized');
              this._finalized = true;
              var parsed;
              if (_useSessionCipher) {
                var resultJson = _cryptoCipherivFinal.applySync(undefined, [this._sessionId]);
                parsed = JSON.parse(resultJson);
              } else {
                var combined = Buffer.concat(this._chunks);
                var resultJson2 = _cryptoCipheriv.applySync(undefined, [
                  this._algorithm,
                  this._key.toString('base64'),
                  this._iv.toString('base64'),
                  combined.toString('base64'),
                ]);
                parsed = JSON.parse(resultJson2);
              }
              if (parsed.authTag) {
                this._authTag = Buffer.from(parsed.authTag, 'base64');
              }
              var resultBuffer = Buffer.from(parsed.data, 'base64');
              if (outputEncoding && outputEncoding !== 'buffer') return resultBuffer.toString(outputEncoding);
              return resultBuffer;
            };
            SandboxCipher.prototype.getAuthTag = function getAuthTag() {
              if (!this._finalized) throw new Error('Cannot call getAuthTag before final()');
              if (!this._authTag) throw new Error('Auth tag is only available for GCM ciphers');
              return this._authTag;
            };
            SandboxCipher.prototype.setAAD = function setAAD() { return this; };
            SandboxCipher.prototype.setAutoPadding = function setAutoPadding() { return this; };
            result.createCipheriv = function createCipheriv(algorithm, key, iv) {
              return new SandboxCipher(algorithm, key, iv);
            };
            result.Cipheriv = SandboxCipher;
          }

          if (typeof _cryptoDecipheriv !== 'undefined') {
            function SandboxDecipher(algorithm, key, iv) {
              this._algorithm = algorithm;
              this._key = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
              this._iv = typeof iv === 'string' ? Buffer.from(iv, 'utf8') : Buffer.from(iv);
              this._authTag = null;
              this._finalized = false;
              this._sessionCreated = false;
              if (!_useSessionCipher) {
                this._chunks = [];
              }
            }
            SandboxDecipher.prototype._ensureSession = function _ensureSession() {
              if (_useSessionCipher && !this._sessionCreated) {
                this._sessionCreated = true;
                var options = {};
                if (this._authTag) {
                  options.authTag = this._authTag.toString('base64');
                }
                this._sessionId = _cryptoCipherivCreate.applySync(undefined, [
                  'decipher', this._algorithm,
                  this._key.toString('base64'),
                  this._iv.toString('base64'),
                  JSON.stringify(options),
                ]);
              }
            };
            SandboxDecipher.prototype.update = function update(data, inputEncoding, outputEncoding) {
              var buf;
              if (typeof data === 'string') {
                buf = Buffer.from(data, inputEncoding || 'utf8');
              } else {
                buf = Buffer.from(data);
              }
              if (_useSessionCipher) {
                this._ensureSession();
                var resultBase64 = _cryptoCipherivUpdate.applySync(undefined, [this._sessionId, buf.toString('base64')]);
                var resultBuffer = Buffer.from(resultBase64, 'base64');
                if (outputEncoding && outputEncoding !== 'buffer') return resultBuffer.toString(outputEncoding);
                return resultBuffer;
              }
              this._chunks.push(buf);
              if (outputEncoding && outputEncoding !== 'buffer') return '';
              return Buffer.alloc(0);
            };
            SandboxDecipher.prototype.final = function final(outputEncoding) {
              if (this._finalized) throw new Error('Attempting to call final() after already finalized');
              this._finalized = true;
              var resultBuffer;
              if (_useSessionCipher) {
                this._ensureSession();
                var resultJson = _cryptoCipherivFinal.applySync(undefined, [this._sessionId]);
                var parsed = JSON.parse(resultJson);
                resultBuffer = Buffer.from(parsed.data, 'base64');
              } else {
                var combined = Buffer.concat(this._chunks);
                var options = {};
                if (this._authTag) {
                  options.authTag = this._authTag.toString('base64');
                }
                var resultBase64 = _cryptoDecipheriv.applySync(undefined, [
                  this._algorithm,
                  this._key.toString('base64'),
                  this._iv.toString('base64'),
                  combined.toString('base64'),
                  JSON.stringify(options),
                ]);
                resultBuffer = Buffer.from(resultBase64, 'base64');
              }
              if (outputEncoding && outputEncoding !== 'buffer') return resultBuffer.toString(outputEncoding);
              return resultBuffer;
            };
            SandboxDecipher.prototype.setAuthTag = function setAuthTag(tag) {
              this._authTag = typeof tag === 'string' ? Buffer.from(tag, 'base64') : Buffer.from(tag);
              return this;
            };
            SandboxDecipher.prototype.setAAD = function setAAD() { return this; };
            SandboxDecipher.prototype.setAutoPadding = function setAutoPadding() { return this; };
            result.createDecipheriv = function createDecipheriv(algorithm, key, iv) {
              return new SandboxDecipher(algorithm, key, iv);
            };
            result.Decipheriv = SandboxDecipher;
          }

          // Overlay host-backed sign/verify
          if (typeof _cryptoSign !== 'undefined') {
            result.sign = function sign(algorithm, data, key) {
              var dataBuf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
              var sigBase64;
              try {
                sigBase64 = _cryptoSign.applySync(undefined, [
                  algorithm === undefined ? null : algorithm,
                  dataBuf.toString('base64'),
                  JSON.stringify(serializeBridgeValue(key)),
                ]);
              } catch (error) {
                throw normalizeCryptoBridgeError(error);
              }
              return Buffer.from(sigBase64, 'base64');
            };
          }

          if (typeof _cryptoVerify !== 'undefined') {
            result.verify = function verify(algorithm, data, key, signature) {
              var dataBuf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
              var sigBuf = typeof signature === 'string' ? Buffer.from(signature, 'base64') : Buffer.from(signature);
              try {
                return _cryptoVerify.applySync(undefined, [
                  algorithm === undefined ? null : algorithm,
                  dataBuf.toString('base64'),
                  JSON.stringify(serializeBridgeValue(key)),
                  sigBuf.toString('base64'),
                ]);
              } catch (error) {
                throw normalizeCryptoBridgeError(error);
              }
            };
          }

          if (typeof _cryptoAsymmetricOp !== 'undefined') {
            function asymmetricBridgeCall(operation, key, data) {
              var dataBuf = toRawBuffer(data);
              var resultBase64;
              try {
                resultBase64 = _cryptoAsymmetricOp.applySync(undefined, [
                  operation,
                  JSON.stringify(serializeBridgeValue(key)),
                  dataBuf.toString('base64'),
                ]);
              } catch (error) {
                throw normalizeCryptoBridgeError(error);
              }
              return Buffer.from(resultBase64, 'base64');
            }

            result.publicEncrypt = function publicEncrypt(key, data) {
              return asymmetricBridgeCall('publicEncrypt', key, data);
            };

            result.privateDecrypt = function privateDecrypt(key, data) {
              return asymmetricBridgeCall('privateDecrypt', key, data);
            };

            result.privateEncrypt = function privateEncrypt(key, data) {
              return asymmetricBridgeCall('privateEncrypt', key, data);
            };

            result.publicDecrypt = function publicDecrypt(key, data) {
              return asymmetricBridgeCall('publicDecrypt', key, data);
            };
          }

          if (
            typeof _cryptoDiffieHellmanSessionCreate !== 'undefined' &&
            typeof _cryptoDiffieHellmanSessionCall !== 'undefined'
          ) {
            function serializeDhKeyObject(value) {
              if (value.type === 'secret') {
                return {
                  type: 'secret',
                  raw: Buffer.from(value.export()).toString('base64'),
                };
              }
              return {
                type: value.type,
                pem: value._pem || value.export({
                  type: value.type === 'private' ? 'pkcs8' : 'spki',
                  format: 'pem',
                }),
              };
            }

            function serializeDhValue(value) {
              if (
                value === null ||
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
              ) {
                return value;
              }
              if (Buffer.isBuffer(value)) {
                return {
                  __type: 'buffer',
                  value: Buffer.from(value).toString('base64'),
                };
              }
              if (value instanceof ArrayBuffer) {
                return {
                  __type: 'buffer',
                  value: Buffer.from(new Uint8Array(value)).toString('base64'),
                };
              }
              if (ArrayBuffer.isView(value)) {
                return {
                  __type: 'buffer',
                  value: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64'),
                };
              }
              if (typeof value === 'bigint') {
                return {
                  __type: 'bigint',
                  value: value.toString(),
                };
              }
              if (
                value &&
                typeof value === 'object' &&
                (value.type === 'public' || value.type === 'private' || value.type === 'secret') &&
                typeof value.export === 'function'
              ) {
                return {
                  __type: 'keyObject',
                  value: serializeDhKeyObject(value),
                };
              }
              if (Array.isArray(value)) {
                return value.map(serializeDhValue);
              }
              if (value && typeof value === 'object') {
                var output = {};
                var keys = Object.keys(value);
                for (var i = 0; i < keys.length; i++) {
                  if (value[keys[i]] !== undefined) {
                    output[keys[i]] = serializeDhValue(value[keys[i]]);
                  }
                }
                return output;
              }
              return String(value);
            }

            function restoreDhValue(value) {
              if (!value || typeof value !== 'object') {
                return value;
              }
              if (value.__type === 'buffer') {
                return Buffer.from(value.value, 'base64');
              }
              if (value.__type === 'bigint') {
                return BigInt(value.value);
              }
              if (Array.isArray(value)) {
                return value.map(restoreDhValue);
              }
              var output = {};
              var keys = Object.keys(value);
              for (var i = 0; i < keys.length; i++) {
                output[keys[i]] = restoreDhValue(value[keys[i]]);
              }
              return output;
            }

            function createDhSession(type, name, argsLike) {
              var args = [];
              for (var i = 0; i < argsLike.length; i++) {
                args.push(serializeDhValue(argsLike[i]));
              }
              return _cryptoDiffieHellmanSessionCreate.applySync(undefined, [
                JSON.stringify({
                  type: type,
                  name: name,
                  args: args,
                }),
              ]);
            }

            function callDhSession(sessionId, method, argsLike) {
              var args = [];
              for (var i = 0; i < argsLike.length; i++) {
                args.push(serializeDhValue(argsLike[i]));
              }
              var response = JSON.parse(_cryptoDiffieHellmanSessionCall.applySync(undefined, [
                sessionId,
                JSON.stringify({
                  method: method,
                  args: args,
                }),
              ]));
              if (response && response.hasResult === false) {
                return undefined;
              }
              return restoreDhValue(response && response.result);
            }

            function SandboxDiffieHellman(sessionId) {
              this._sessionId = sessionId;
            }

            Object.defineProperty(SandboxDiffieHellman.prototype, 'verifyError', {
              get: function getVerifyError() {
                return callDhSession(this._sessionId, 'verifyError', []);
              },
            });

            SandboxDiffieHellman.prototype.generateKeys = function generateKeys(encoding) {
              if (arguments.length === 0) return callDhSession(this._sessionId, 'generateKeys', []);
              return callDhSession(this._sessionId, 'generateKeys', [encoding]);
            };
            SandboxDiffieHellman.prototype.computeSecret = function computeSecret(key, inputEncoding, outputEncoding) {
              return callDhSession(this._sessionId, 'computeSecret', Array.prototype.slice.call(arguments));
            };
            SandboxDiffieHellman.prototype.getPrime = function getPrime(encoding) {
              if (arguments.length === 0) return callDhSession(this._sessionId, 'getPrime', []);
              return callDhSession(this._sessionId, 'getPrime', [encoding]);
            };
            SandboxDiffieHellman.prototype.getGenerator = function getGenerator(encoding) {
              if (arguments.length === 0) return callDhSession(this._sessionId, 'getGenerator', []);
              return callDhSession(this._sessionId, 'getGenerator', [encoding]);
            };
            SandboxDiffieHellman.prototype.getPublicKey = function getPublicKey(encoding) {
              if (arguments.length === 0) return callDhSession(this._sessionId, 'getPublicKey', []);
              return callDhSession(this._sessionId, 'getPublicKey', [encoding]);
            };
            SandboxDiffieHellman.prototype.getPrivateKey = function getPrivateKey(encoding) {
              if (arguments.length === 0) return callDhSession(this._sessionId, 'getPrivateKey', []);
              return callDhSession(this._sessionId, 'getPrivateKey', [encoding]);
            };
            SandboxDiffieHellman.prototype.setPublicKey = function setPublicKey(key, encoding) {
              return callDhSession(this._sessionId, 'setPublicKey', Array.prototype.slice.call(arguments));
            };
            SandboxDiffieHellman.prototype.setPrivateKey = function setPrivateKey(key, encoding) {
              return callDhSession(this._sessionId, 'setPrivateKey', Array.prototype.slice.call(arguments));
            };

            function SandboxECDH(sessionId) {
              SandboxDiffieHellman.call(this, sessionId);
            }
            SandboxECDH.prototype = Object.create(SandboxDiffieHellman.prototype);
            SandboxECDH.prototype.constructor = SandboxECDH;
            SandboxECDH.prototype.getPublicKey = function getPublicKey(encoding, format) {
              return callDhSession(this._sessionId, 'getPublicKey', Array.prototype.slice.call(arguments));
            };

            result.createDiffieHellman = function createDiffieHellman() {
              return new SandboxDiffieHellman(createDhSession('dh', undefined, arguments));
            };

            result.getDiffieHellman = function getDiffieHellman(name) {
              return new SandboxDiffieHellman(createDhSession('group', name, []));
            };

            result.createDiffieHellmanGroup = result.getDiffieHellman;

            result.createECDH = function createECDH(curve) {
              return new SandboxECDH(createDhSession('ecdh', curve, []));
            };

            if (typeof _cryptoDiffieHellman !== 'undefined') {
              result.diffieHellman = function diffieHellman(options) {
                var resultJson = _cryptoDiffieHellman.applySync(undefined, [
                  JSON.stringify(serializeDhValue(options)),
                ]);
                return restoreDhValue(JSON.parse(resultJson));
              };
            }

            result.DiffieHellman = SandboxDiffieHellman;
            result.DiffieHellmanGroup = SandboxDiffieHellman;
            result.ECDH = SandboxECDH;
          }

          // Overlay host-backed generateKeyPairSync/generateKeyPair and KeyObject helpers
          if (typeof _cryptoGenerateKeyPairSync !== 'undefined') {
            function restoreBridgeValue(value) {
              if (!value || typeof value !== 'object') {
                return value;
              }
              if (value.__type === 'buffer') {
                return Buffer.from(value.value, 'base64');
              }
              if (value.__type === 'bigint') {
                return BigInt(value.value);
              }
              if (Array.isArray(value)) {
                return value.map(restoreBridgeValue);
              }
              var output = {};
              var keys = Object.keys(value);
              for (var i = 0; i < keys.length; i++) {
                output[keys[i]] = restoreBridgeValue(value[keys[i]]);
              }
              return output;
            }

            function cloneObject(value) {
              if (!value || typeof value !== 'object') {
                return value;
              }
              if (Array.isArray(value)) {
                return value.map(cloneObject);
              }
              var output = {};
              var keys = Object.keys(value);
              for (var i = 0; i < keys.length; i++) {
                output[keys[i]] = cloneObject(value[keys[i]]);
              }
              return output;
            }

            function createDomException(message, name) {
              if (typeof DOMException === 'function') {
                return new DOMException(message, name);
              }
              var error = new Error(message);
              error.name = name;
              return error;
            }

            function toRawBuffer(data, encoding) {
              if (Buffer.isBuffer(data)) {
                return Buffer.from(data);
              }
              if (data instanceof ArrayBuffer) {
                return Buffer.from(new Uint8Array(data));
              }
              if (ArrayBuffer.isView(data)) {
                return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
              }
              if (typeof data === 'string') {
                return Buffer.from(data, encoding || 'utf8');
              }
              return Buffer.from(data);
            }

            function serializeBridgeValue(value) {
              if (value === null) {
                return null;
              }
              if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
              ) {
                return value;
              }
              if (typeof value === 'bigint') {
                return {
                  __type: 'bigint',
                  value: value.toString(),
                };
              }
              if (Buffer.isBuffer(value)) {
                return {
                  __type: 'buffer',
                  value: Buffer.from(value).toString('base64'),
                };
              }
              if (value instanceof ArrayBuffer) {
                return {
                  __type: 'buffer',
                  value: Buffer.from(new Uint8Array(value)).toString('base64'),
                };
              }
              if (ArrayBuffer.isView(value)) {
                return {
                  __type: 'buffer',
                  value: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64'),
                };
              }
              if (Array.isArray(value)) {
                return value.map(serializeBridgeValue);
              }
              if (
                value &&
                typeof value === 'object' &&
                (value.type === 'public' || value.type === 'private' || value.type === 'secret') &&
                typeof value.export === 'function'
              ) {
                if (value.type === 'secret') {
                  return {
                    __type: 'keyObject',
                    value: {
                      type: 'secret',
                      raw: Buffer.from(value.export()).toString('base64'),
                    },
                  };
                }
                return {
                  __type: 'keyObject',
                  value: {
                    type: value.type,
                    pem: value._pem,
                  },
                };
              }
              if (value && typeof value === 'object') {
                var output = {};
                var keys = Object.keys(value);
                for (var i = 0; i < keys.length; i++) {
                  var entry = value[keys[i]];
                  if (entry !== undefined) {
                    output[keys[i]] = serializeBridgeValue(entry);
                  }
                }
                return output;
              }
              return String(value);
            }

            function normalizeCryptoBridgeError(error) {
              if (!error || typeof error !== 'object') {
                return error;
              }
              if (
                error.code === undefined &&
                error.message === 'error:07880109:common libcrypto routines::interrupted or cancelled'
              ) {
                error.code = 'ERR_OSSL_CRYPTO_INTERRUPTED_OR_CANCELLED';
              }
              return error;
            }

            function deserializeGeneratedKeyValue(value) {
              if (!value || typeof value !== 'object') {
                return value;
              }
              if (value.kind === 'string') {
                return value.value;
              }
              if (value.kind === 'buffer') {
                return Buffer.from(value.value, 'base64');
              }
              if (value.kind === 'keyObject') {
                return createGeneratedKeyObject(value.value);
              }
              if (value.kind === 'object') {
                return value.value;
              }
              return value;
            }

            function serializeBridgeOptions(options) {
              return JSON.stringify({
                hasOptions: options !== undefined,
                options: options === undefined ? null : serializeBridgeValue(options),
              });
            }

            function createInvalidArgTypeError(name, expected, value) {
              var received;
              if (value === undefined) {
                received = 'undefined';
              } else if (value === null) {
                received = 'null';
              } else {
                received = 'type ' + typeof value;
              }
              var error = new TypeError('The "' + name + '" argument must be ' + expected + '. Received ' + received);
              error.code = 'ERR_INVALID_ARG_TYPE';
              return error;
            }

            function scheduleCryptoCallback(callback, args) {
              setTimeout(function() {
                callback.apply(undefined, args);
              }, 0);
            }

            function shouldThrowCryptoValidationError(error) {
              if (!error || typeof error !== 'object') {
                return false;
              }
              if (error.name === 'TypeError' || error.name === 'RangeError') {
                return true;
              }
              var code = error.code;
              return code === 'ERR_MISSING_OPTION' ||
                code === 'ERR_CRYPTO_UNKNOWN_DH_GROUP' ||
                code === 'ERR_OUT_OF_RANGE' ||
                (typeof code === 'string' && code.indexOf('ERR_INVALID_ARG_') === 0);
            }

            function ensureCryptoCallback(callback, syncValidator) {
              if (typeof callback === 'function') {
                return callback;
              }
              if (typeof syncValidator === 'function') {
                syncValidator();
              }
              throw createInvalidArgTypeError('callback', 'of type function', callback);
            }

            function SandboxKeyObject(type, handle) {
              this.type = type;
              this._pem = handle && handle.pem !== undefined ? handle.pem : undefined;
              this._raw = handle && handle.raw !== undefined ? handle.raw : undefined;
              this._jwk = handle && handle.jwk !== undefined ? cloneObject(handle.jwk) : undefined;
              this.asymmetricKeyType = handle && handle.asymmetricKeyType !== undefined ? handle.asymmetricKeyType : undefined;
              this.asymmetricKeyDetails = handle && handle.asymmetricKeyDetails !== undefined ?
                restoreBridgeValue(handle.asymmetricKeyDetails) :
                undefined;
              this.symmetricKeySize = type === 'secret' && handle && handle.raw !== undefined ?
                Buffer.from(handle.raw, 'base64').byteLength :
                undefined;
            }

            Object.defineProperty(SandboxKeyObject.prototype, Symbol.toStringTag, {
              value: 'KeyObject',
              configurable: true,
            });

            SandboxKeyObject.prototype.export = function exportKey(options) {
              if (this.type === 'secret') {
                return Buffer.from(this._raw || '', 'base64');
              }
              if (!options || typeof options !== 'object') {
                throw new TypeError('The "options" argument must be of type object.');
              }
              if (options.format === 'jwk') {
                return cloneObject(this._jwk);
              }
              if (options.format === 'der') {
                var lines = String(this._pem || '').split('\n').filter(function(l) {
                  return l && l.indexOf('-----') !== 0;
                });
                return Buffer.from(lines.join(''), 'base64');
              }
              return this._pem;
            };

            SandboxKeyObject.prototype.toString = function() {
              return '[object KeyObject]';
            };

            SandboxKeyObject.prototype.equals = function equals(other) {
              if (!(other instanceof SandboxKeyObject)) {
                return false;
              }
              if (this.type !== other.type) {
                return false;
              }
              if (this.type === 'secret') {
                return (this._raw || '') === (other._raw || '');
              }
              return (
                (this._pem || '') === (other._pem || '') &&
                this.asymmetricKeyType === other.asymmetricKeyType
              );
            };

            function normalizeNamedCurve(namedCurve) {
              if (!namedCurve) {
                return namedCurve;
              }
              var upper = String(namedCurve).toUpperCase();
              if (upper === 'PRIME256V1' || upper === 'SECP256R1') return 'P-256';
              if (upper === 'SECP384R1') return 'P-384';
              if (upper === 'SECP521R1') return 'P-521';
              return namedCurve;
            }

            function normalizeAlgorithmInput(algorithm) {
              if (typeof algorithm === 'string') {
                return { name: algorithm };
              }
              return Object.assign({}, algorithm);
            }

            function createCompatibleCryptoKey(keyData) {
              var key;
              if (
                globalThis.CryptoKey &&
                globalThis.CryptoKey.prototype &&
                globalThis.CryptoKey.prototype !== SandboxCryptoKey.prototype
              ) {
                key = Object.create(globalThis.CryptoKey.prototype);
                key.type = keyData.type;
                key.extractable = keyData.extractable;
                key.algorithm = keyData.algorithm;
                key.usages = keyData.usages;
                key._keyData = keyData;
                key._pem = keyData._pem;
                key._jwk = keyData._jwk;
                key._raw = keyData._raw;
                key._sourceKeyObjectData = keyData._sourceKeyObjectData;
                return key;
              }
              return new SandboxCryptoKey(keyData);
            }

            function buildCryptoKeyFromKeyObject(keyObject, algorithm, extractable, usages) {
              var algo = normalizeAlgorithmInput(algorithm);
              var name = algo.name;

              if (keyObject.type === 'secret') {
                var secretBytes = Buffer.from(keyObject._raw || '', 'base64');
                if (name === 'PBKDF2') {
                  if (extractable) {
                    throw new SyntaxError('PBKDF2 keys are not extractable');
                  }
                  if (usages.some(function(usage) { return usage !== 'deriveBits' && usage !== 'deriveKey'; })) {
                    throw new SyntaxError('Unsupported key usage for a PBKDF2 key');
                  }
                  return createCompatibleCryptoKey({
                    type: 'secret',
                    extractable: extractable,
                    algorithm: { name: name },
                    usages: Array.from(usages),
                    _raw: keyObject._raw,
                    _sourceKeyObjectData: {
                      type: 'secret',
                      raw: keyObject._raw,
                    },
                  });
                }
                if (name === 'HMAC') {
                  if (!secretBytes.byteLength || algo.length === 0) {
                    throw createDomException('Zero-length key is not supported', 'DataError');
                  }
                  if (!usages.length) {
                    throw new SyntaxError('Usages cannot be empty when importing a secret key.');
                  }
                  return createCompatibleCryptoKey({
                    type: 'secret',
                    extractable: extractable,
                    algorithm: {
                      name: name,
                      hash: typeof algo.hash === 'string' ? { name: algo.hash } : cloneObject(algo.hash),
                      length: secretBytes.byteLength * 8,
                    },
                    usages: Array.from(usages),
                    _raw: keyObject._raw,
                    _sourceKeyObjectData: {
                      type: 'secret',
                      raw: keyObject._raw,
                    },
                  });
                }
                return createCompatibleCryptoKey({
                  type: 'secret',
                  extractable: extractable,
                  algorithm: {
                    name: name,
                    length: secretBytes.byteLength * 8,
                  },
                  usages: Array.from(usages),
                  _raw: keyObject._raw,
                  _sourceKeyObjectData: {
                    type: 'secret',
                    raw: keyObject._raw,
                  },
                });
              }

              var keyType = String(keyObject.asymmetricKeyType || '').toLowerCase();
              var algorithmName = String(name || '');

              if (
                (keyType === 'ed25519' || keyType === 'ed448' || keyType === 'x25519' || keyType === 'x448') &&
                keyType !== algorithmName.toLowerCase()
              ) {
                throw createDomException('Invalid key type', 'DataError');
              }

              if (algorithmName === 'ECDH') {
                if (keyObject.type === 'private' && !usages.length) {
                  throw new SyntaxError('Usages cannot be empty when importing a private key.');
                }
                var actualCurve = normalizeNamedCurve(
                  keyObject.asymmetricKeyDetails && keyObject.asymmetricKeyDetails.namedCurve
                );
                if (
                  algo.namedCurve &&
                  actualCurve &&
                  normalizeNamedCurve(algo.namedCurve) !== actualCurve
                ) {
                  throw createDomException('Named curve mismatch', 'DataError');
                }
              }

              var normalizedAlgo = cloneObject(algo);
              if (typeof normalizedAlgo.hash === 'string') {
                normalizedAlgo.hash = { name: normalizedAlgo.hash };
              }

              return createCompatibleCryptoKey({
                type: keyObject.type,
                extractable: extractable,
                algorithm: normalizedAlgo,
                usages: Array.from(usages),
                _pem: keyObject._pem,
                _jwk: cloneObject(keyObject._jwk),
                _sourceKeyObjectData: {
                  type: keyObject.type,
                  pem: keyObject._pem,
                  jwk: cloneObject(keyObject._jwk),
                  asymmetricKeyType: keyObject.asymmetricKeyType,
                  asymmetricKeyDetails: cloneObject(keyObject.asymmetricKeyDetails),
                },
              });
            }

            SandboxKeyObject.prototype.toCryptoKey = function toCryptoKey(algorithm, extractable, usages) {
              return buildCryptoKeyFromKeyObject(this, algorithm, extractable, Array.from(usages || []));
            };

            function createAsymmetricKeyObject(type, key) {
              if (typeof key === 'string') {
                if (key.indexOf('-----BEGIN') === -1) {
                  throw new TypeError('error:0900006e:PEM routines:OPENSSL_internal:NO_START_LINE');
                }
                return new SandboxKeyObject(type, { pem: key });
              }
              if (key && typeof key === 'object' && key._pem) {
                return new SandboxKeyObject(type, {
                  pem: key._pem,
                  jwk: key._jwk,
                  asymmetricKeyType: key.asymmetricKeyType,
                  asymmetricKeyDetails: key.asymmetricKeyDetails,
                });
              }
              if (key && typeof key === 'object' && key.key) {
                var keyData = typeof key.key === 'string' ? key.key : key.key.toString('utf8');
                return new SandboxKeyObject(type, { pem: keyData });
              }
              if (Buffer.isBuffer(key)) {
                var keyStr = key.toString('utf8');
                if (keyStr.indexOf('-----BEGIN') === -1) {
                  throw new TypeError('error:0900006e:PEM routines:OPENSSL_internal:NO_START_LINE');
                }
                return new SandboxKeyObject(type, { pem: keyStr });
              }
              return new SandboxKeyObject(type, { pem: String(key) });
            }

            function createGeneratedKeyObject(value) {
              return new SandboxKeyObject(value.type, {
                pem: value.pem,
                raw: value.raw,
                jwk: value.jwk,
                asymmetricKeyType: value.asymmetricKeyType,
                asymmetricKeyDetails: value.asymmetricKeyDetails,
              });
            }

            result.generateKeyPairSync = function generateKeyPairSync(type, options) {
              var resultJson = _cryptoGenerateKeyPairSync.applySync(undefined, [
                type,
                serializeBridgeOptions(options),
              ]);
              var parsed = JSON.parse(resultJson);

              if (parsed.publicKey && parsed.publicKey.kind) {
                return {
                  publicKey: deserializeGeneratedKeyValue(parsed.publicKey),
                  privateKey: deserializeGeneratedKeyValue(parsed.privateKey),
                };
              }

              return {
                publicKey: createGeneratedKeyObject(parsed.publicKey),
                privateKey: createGeneratedKeyObject(parsed.privateKey),
              };
            };

            result.generateKeyPair = function generateKeyPair(type, options, callback) {
              if (typeof options === 'function') {
                callback = options;
                options = undefined;
              }
              callback = ensureCryptoCallback(callback, function() {
                result.generateKeyPairSync(type, options);
              });
              try {
                var pair = result.generateKeyPairSync(type, options);
                scheduleCryptoCallback(callback, [null, pair.publicKey, pair.privateKey]);
              } catch (e) {
                if (shouldThrowCryptoValidationError(e)) {
                  throw e;
                }
                scheduleCryptoCallback(callback, [e]);
              }
            };

            if (typeof _cryptoGenerateKeySync !== 'undefined') {
              result.generateKeySync = function generateKeySync(type, options) {
                var resultJson;
                try {
                  resultJson = _cryptoGenerateKeySync.applySync(undefined, [
                    type,
                    serializeBridgeOptions(options),
                  ]);
                } catch (error) {
                  throw normalizeCryptoBridgeError(error);
                }
                return createGeneratedKeyObject(JSON.parse(resultJson));
              };

              result.generateKey = function generateKey(type, options, callback) {
                callback = ensureCryptoCallback(callback, function() {
                  result.generateKeySync(type, options);
                });
                try {
                  var key = result.generateKeySync(type, options);
                  scheduleCryptoCallback(callback, [null, key]);
                } catch (e) {
                  if (shouldThrowCryptoValidationError(e)) {
                    throw e;
                  }
                  scheduleCryptoCallback(callback, [e]);
                }
              };
            }

            if (typeof _cryptoGeneratePrimeSync !== 'undefined') {
              result.generatePrimeSync = function generatePrimeSync(size, options) {
                var resultJson;
                try {
                  resultJson = _cryptoGeneratePrimeSync.applySync(undefined, [
                    size,
                    serializeBridgeOptions(options),
                  ]);
                } catch (error) {
                  throw normalizeCryptoBridgeError(error);
                }
                return restoreBridgeValue(JSON.parse(resultJson));
              };

              result.generatePrime = function generatePrime(size, options, callback) {
                if (typeof options === 'function') {
                  callback = options;
                  options = undefined;
                }
                callback = ensureCryptoCallback(callback, function() {
                  result.generatePrimeSync(size, options);
                });
                try {
                  var prime = result.generatePrimeSync(size, options);
                  scheduleCryptoCallback(callback, [null, prime]);
                } catch (e) {
                  if (shouldThrowCryptoValidationError(e)) {
                    throw e;
                  }
                  scheduleCryptoCallback(callback, [e]);
                }
              };
            }

            result.createPublicKey = function createPublicKey(key) {
              if (typeof _cryptoCreateKeyObject !== 'undefined') {
                var resultJson;
                try {
                  resultJson = _cryptoCreateKeyObject.applySync(undefined, [
                    'createPublicKey',
                    JSON.stringify(serializeBridgeValue(key)),
                  ]);
                } catch (error) {
                  throw normalizeCryptoBridgeError(error);
                }
                return createGeneratedKeyObject(JSON.parse(resultJson));
              }
              return createAsymmetricKeyObject('public', key);
            };

            result.createPrivateKey = function createPrivateKey(key) {
              if (typeof _cryptoCreateKeyObject !== 'undefined') {
                var resultJson;
                try {
                  resultJson = _cryptoCreateKeyObject.applySync(undefined, [
                    'createPrivateKey',
                    JSON.stringify(serializeBridgeValue(key)),
                  ]);
                } catch (error) {
                  throw normalizeCryptoBridgeError(error);
                }
                return createGeneratedKeyObject(JSON.parse(resultJson));
              }
              return createAsymmetricKeyObject('private', key);
            };

            result.createSecretKey = function createSecretKey(key, encoding) {
              return new SandboxKeyObject('secret', {
                raw: toRawBuffer(key, encoding).toString('base64'),
              });
            };

            SandboxKeyObject.from = function from(key) {
              if (!key || typeof key !== 'object' || key[Symbol.toStringTag] !== 'CryptoKey') {
                throw new TypeError('The "key" argument must be an instance of CryptoKey.');
              }
              if (key._sourceKeyObjectData && key._sourceKeyObjectData.type === 'secret') {
                return new SandboxKeyObject('secret', {
                  raw: key._sourceKeyObjectData.raw,
                });
              }
              return new SandboxKeyObject(key.type, {
                pem: key._pem,
                jwk: key._jwk,
                asymmetricKeyType: key._sourceKeyObjectData && key._sourceKeyObjectData.asymmetricKeyType,
                asymmetricKeyDetails: key._sourceKeyObjectData && key._sourceKeyObjectData.asymmetricKeyDetails,
              });
            };

            result.KeyObject = SandboxKeyObject;
          }

          // Overlay host-backed crypto.subtle (Web Crypto API)
          if (typeof _cryptoSubtle !== 'undefined') {
            function SandboxCryptoKey(keyData) {
              this.type = keyData.type;
              this.extractable = keyData.extractable;
              this.algorithm = keyData.algorithm;
              this.usages = keyData.usages;
              this._keyData = keyData;
              this._pem = keyData._pem;
              this._jwk = keyData._jwk;
              this._raw = keyData._raw;
              this._sourceKeyObjectData = keyData._sourceKeyObjectData;
            }

            Object.defineProperty(SandboxCryptoKey.prototype, Symbol.toStringTag, {
              value: 'CryptoKey',
              configurable: true,
            });

            Object.defineProperty(SandboxCryptoKey, Symbol.hasInstance, {
              value: function(candidate) {
                return !!(
                  candidate &&
                  typeof candidate === 'object' &&
                  (
                    candidate._keyData ||
                    candidate[Symbol.toStringTag] === 'CryptoKey'
                  )
                );
              },
              configurable: true,
            });

            if (
              globalThis.CryptoKey &&
              globalThis.CryptoKey.prototype &&
              globalThis.CryptoKey.prototype !== SandboxCryptoKey.prototype
            ) {
              Object.setPrototypeOf(SandboxCryptoKey.prototype, globalThis.CryptoKey.prototype);
            }

            if (typeof globalThis.CryptoKey === 'undefined') {
              __requireExposeCustomGlobal('CryptoKey', SandboxCryptoKey);
            } else if (globalThis.CryptoKey !== SandboxCryptoKey) {
              globalThis.CryptoKey = SandboxCryptoKey;
            }

            function toBase64(data) {
              if (typeof data === 'string') return Buffer.from(data).toString('base64');
              if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('base64');
              if (ArrayBuffer.isView(data)) return Buffer.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)).toString('base64');
              return Buffer.from(data).toString('base64');
            }

            function subtleCall(reqObj) {
              return _cryptoSubtle.applySync(undefined, [JSON.stringify(reqObj)]);
            }

            function normalizeAlgo(algorithm) {
              if (typeof algorithm === 'string') return { name: algorithm };
              return algorithm;
            }

            var SandboxSubtle = {};

            SandboxSubtle.digest = function digest(algorithm, data) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var result2 = JSON.parse(subtleCall({
                  op: 'digest',
                  algorithm: algo.name,
                  data: toBase64(data),
                }));
                var buf = Buffer.from(result2.data, 'base64');
                return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
              });
            };

            SandboxSubtle.generateKey = function generateKey(algorithm, extractable, keyUsages) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var reqAlgo = Object.assign({}, algo);
                if (reqAlgo.hash) reqAlgo.hash = normalizeAlgo(reqAlgo.hash);
                if (reqAlgo.publicExponent) {
                  reqAlgo.publicExponent = Buffer.from(new Uint8Array(reqAlgo.publicExponent.buffer || reqAlgo.publicExponent)).toString('base64');
                }
                var result2 = JSON.parse(subtleCall({
                  op: 'generateKey',
                  algorithm: reqAlgo,
                  extractable: extractable,
                  usages: Array.from(keyUsages),
                }));
                if (result2.publicKey && result2.privateKey) {
                  return {
                    publicKey: new SandboxCryptoKey(result2.publicKey),
                    privateKey: new SandboxCryptoKey(result2.privateKey),
                  };
                }
                return new SandboxCryptoKey(result2.key);
              });
            };

            SandboxSubtle.importKey = function importKey(format, keyData, algorithm, extractable, keyUsages) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var reqAlgo = Object.assign({}, algo);
                if (reqAlgo.hash) reqAlgo.hash = normalizeAlgo(reqAlgo.hash);
                var serializedKeyData;
                if (format === 'jwk') {
                  serializedKeyData = keyData;
                } else if (format === 'raw') {
                  serializedKeyData = toBase64(keyData);
                } else {
                  serializedKeyData = toBase64(keyData);
                }
                var result2 = JSON.parse(subtleCall({
                  op: 'importKey',
                  format: format,
                  keyData: serializedKeyData,
                  algorithm: reqAlgo,
                  extractable: extractable,
                  usages: Array.from(keyUsages),
                }));
                return new SandboxCryptoKey(result2.key);
              });
            };

            SandboxSubtle.exportKey = function exportKey(format, key) {
              return Promise.resolve().then(function() {
                var result2 = JSON.parse(subtleCall({
                  op: 'exportKey',
                  format: format,
                  key: key._keyData,
                }));
                if (format === 'jwk') return result2.jwk;
                var buf = Buffer.from(result2.data, 'base64');
                return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
              });
            };

            SandboxSubtle.encrypt = function encrypt(algorithm, key, data) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var reqAlgo = Object.assign({}, algo);
                if (reqAlgo.iv) reqAlgo.iv = toBase64(reqAlgo.iv);
                if (reqAlgo.additionalData) reqAlgo.additionalData = toBase64(reqAlgo.additionalData);
                var result2 = JSON.parse(subtleCall({
                  op: 'encrypt',
                  algorithm: reqAlgo,
                  key: key._keyData,
                  data: toBase64(data),
                }));
                var buf = Buffer.from(result2.data, 'base64');
                return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
              });
            };

            SandboxSubtle.decrypt = function decrypt(algorithm, key, data) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var reqAlgo = Object.assign({}, algo);
                if (reqAlgo.iv) reqAlgo.iv = toBase64(reqAlgo.iv);
                if (reqAlgo.additionalData) reqAlgo.additionalData = toBase64(reqAlgo.additionalData);
                var result2 = JSON.parse(subtleCall({
                  op: 'decrypt',
                  algorithm: reqAlgo,
                  key: key._keyData,
                  data: toBase64(data),
                }));
                var buf = Buffer.from(result2.data, 'base64');
                return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
              });
            };

            SandboxSubtle.sign = function sign(algorithm, key, data) {
              return Promise.resolve().then(function() {
                var result2 = JSON.parse(subtleCall({
                  op: 'sign',
                  algorithm: normalizeAlgo(algorithm),
                  key: key._keyData,
                  data: toBase64(data),
                }));
                var buf = Buffer.from(result2.data, 'base64');
                return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
              });
            };

            SandboxSubtle.verify = function verify(algorithm, key, signature, data) {
              return Promise.resolve().then(function() {
                var result2 = JSON.parse(subtleCall({
                  op: 'verify',
                  algorithm: normalizeAlgo(algorithm),
                  key: key._keyData,
                  signature: toBase64(signature),
                  data: toBase64(data),
                }));
                return result2.result;
              });
            };

            SandboxSubtle.deriveBits = function deriveBits(algorithm, baseKey, length) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var reqAlgo = Object.assign({}, algo);
                if (reqAlgo.salt) reqAlgo.salt = toBase64(reqAlgo.salt);
                if (reqAlgo.info) reqAlgo.info = toBase64(reqAlgo.info);
                var result2 = JSON.parse(subtleCall({
                  op: 'deriveBits',
                  algorithm: reqAlgo,
                  baseKey: baseKey._keyData,
                  length: length,
                }));
                return Buffer.from(result2.data, 'base64').buffer;
              });
            };

            SandboxSubtle.deriveKey = function deriveKey(algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) {
              return Promise.resolve().then(function() {
                var algo = normalizeAlgo(algorithm);
                var reqAlgo = Object.assign({}, algo);
                if (reqAlgo.salt) reqAlgo.salt = toBase64(reqAlgo.salt);
                if (reqAlgo.info) reqAlgo.info = toBase64(reqAlgo.info);
                var result2 = JSON.parse(subtleCall({
                  op: 'deriveKey',
                  algorithm: reqAlgo,
                  baseKey: baseKey._keyData,
                  derivedKeyAlgorithm: normalizeAlgo(derivedKeyAlgorithm),
                  extractable: extractable,
                  usages: keyUsages,
                }));
                return new SandboxCryptoKey(result2.key);
              });
            };

            if (
              globalThis.crypto &&
              globalThis.crypto.subtle &&
              typeof globalThis.crypto.subtle.importKey === 'function'
            ) {
              result.subtle = globalThis.crypto.subtle;
              result.webcrypto = globalThis.crypto;
            } else {
              result.subtle = SandboxSubtle;
              result.webcrypto = { subtle: SandboxSubtle, getRandomValues: result.randomFillSync };
            }
          }

          // Enumeration functions: getCurves, getCiphers, getHashes.
          // Packages like ssh2 call these at module scope to build capability tables.
          if (typeof result.getCurves !== 'function') {
            result.getCurves = function getCurves() {
              return [
                'prime256v1', 'secp256r1', 'secp384r1', 'secp521r1',
                'secp256k1', 'secp224r1', 'secp192k1',
              ];
            };
          }
          if (typeof result.getCiphers !== 'function') {
            result.getCiphers = function getCiphers() {
              return [
                'aes-128-cbc', 'aes-128-gcm', 'aes-192-cbc', 'aes-192-gcm',
                'aes-256-cbc', 'aes-256-gcm', 'aes-128-ctr', 'aes-192-ctr',
                'aes-256-ctr',
              ];
            };
          }
          if (typeof result.getHashes !== 'function') {
            result.getHashes = function getHashes() {
              return ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
            };
          }
          if (typeof result.timingSafeEqual !== 'function') {
            result.timingSafeEqual = function timingSafeEqual(a, b) {
              if (a.length !== b.length) {
                throw new RangeError('Input buffers must have the same byte length');
              }
              var out = 0;
              for (var i = 0; i < a.length; i++) {
                out |= a[i] ^ b[i];
              }
              return out === 0;
            };
          }

          return result;
        }

        // Fix stream prototype chain broken by esbuild's circular-dep resolution.
        // stream-browserify → readable-stream → require('stream') creates a cycle;
        // esbuild gives Readable a stale Stream ref, so Readable extends EventEmitter
        // directly instead of Stream. Insert Stream.prototype into the chain so
        // `passThrough instanceof Stream` works (node-fetch, undici, etc. depend on this).
        if (name === 'stream') {
          if (
            typeof result === 'function' &&
            result.prototype &&
            typeof result.Readable === 'function'
          ) {
            var readableProto = result.Readable.prototype;
            var streamProto = result.prototype;
            // Only patch if Stream.prototype is not already in the chain
            if (
              readableProto &&
              streamProto &&
              !(readableProto instanceof result)
            ) {
              // Insert Stream.prototype between Readable.prototype and its current parent
              var currentParent = Object.getPrototypeOf(readableProto);
              Object.setPrototypeOf(streamProto, currentParent);
              Object.setPrototypeOf(readableProto, streamProto);
            }
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
        // Prefer truly synchronous handler when available — the async
        // applySyncPromise pattern can't nest inside synchronous bridge
        // callbacks (e.g. net socket data events that trigger require()).
        // Fall back to the async handler if sync returns null (e.g. virtual FS).
        var resolved;
        if (typeof _resolveModuleSync !== 'undefined') {
          resolved = _resolveModuleSync.applySync(undefined, [moduleName, fromDir]);
        }
        if (resolved === null || resolved === undefined) {
          resolved = _resolveModule.applySyncPromise(undefined, [moduleName, fromDir, 'require']);
        }
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

        // Special handling for net module
        if (name === 'net') {
          if (__internalModuleCache['net']) return __internalModuleCache['net'];
          __internalModuleCache['net'] = _netModule;
          _debugRequire('loaded', name, 'net-special');
          return _netModule;
        }

        // Special handling for tls module
        if (name === 'tls') {
          if (__internalModuleCache['tls']) return __internalModuleCache['tls'];
          __internalModuleCache['tls'] = _tlsModule;
          _debugRequire('loaded', name, 'tls-special');
          return _tlsModule;
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
                traceSync: function (fn, context, thisArg) {
                  var args = Array.prototype.slice.call(arguments, 3);
                  return fn.apply(thisArg, args);
                },
                tracePromise: function (fn, context, thisArg) {
                  var args = Array.prototype.slice.call(arguments, 3);
                  return fn.apply(thisArg, args);
                },
                traceCallback: function (fn, context, thisArg) {
                  var args = Array.prototype.slice.call(arguments, 3);
                  return fn.apply(thisArg, args);
                },
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

        // Load file content — prefer sync handler when available, fall back to async
        var source;
        if (typeof _loadFileSync !== 'undefined') {
          source = _loadFileSync.applySync(undefined, [resolved]);
        }
        if (source === null || source === undefined) {
          source = _loadFile.applySyncPromise(undefined, [resolved, 'require']);
        }
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
