// @ts-nocheck
// This file is executed inside the isolate runtime.
      const REQUIRE_TRANSFORM_MARKER = '/*__secure_exec_require_esm__*/';
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

      if (typeof globalThis.global === 'undefined') {
        globalThis.global = globalThis;
      }

      if (typeof globalThis.RegExp === 'function' && !globalThis.RegExp.__secureExecRgiEmojiCompat) {
        const NativeRegExp = globalThis.RegExp;
        const RGI_EMOJI_PATTERN = '^\\p{RGI_Emoji}$';
        const RGI_EMOJI_BASE_CLASS = '[\\u{00A9}\\u{00AE}\\u{203C}\\u{2049}\\u{2122}\\u{2139}\\u{2194}-\\u{21AA}\\u{231A}-\\u{23FF}\\u{24C2}\\u{25AA}-\\u{27BF}\\u{2934}-\\u{2935}\\u{2B05}-\\u{2B55}\\u{3030}\\u{303D}\\u{3297}\\u{3299}\\u{1F000}-\\u{1FAFF}]';
        const RGI_EMOJI_KEYCAP = '[#*0-9]\\uFE0F?\\u20E3';
        const RGI_EMOJI_FALLBACK_SOURCE =
          '^(?:' +
          RGI_EMOJI_KEYCAP +
          '|\\p{Regional_Indicator}{2}|' +
          RGI_EMOJI_BASE_CLASS +
          '(?:\\uFE0F|\\u200D(?:' +
          RGI_EMOJI_KEYCAP +
          '|' +
          RGI_EMOJI_BASE_CLASS +
          ')|[\\u{1F3FB}-\\u{1F3FF}])*)$';
        try {
          new NativeRegExp(RGI_EMOJI_PATTERN, 'v');
        } catch (error) {
          if (String(error && error.message || error).includes('RGI_Emoji')) {
            function CompatRegExp(pattern, flags) {
              const normalizedPattern =
                pattern instanceof NativeRegExp && flags === undefined
                  ? pattern.source
                  : String(pattern);
              const normalizedFlags =
                flags === undefined
                  ? (pattern instanceof NativeRegExp ? pattern.flags : '')
                  : String(flags);
              try {
                return new NativeRegExp(pattern, flags);
              } catch (innerError) {
                if (normalizedPattern === RGI_EMOJI_PATTERN && normalizedFlags === 'v') {
                  return new NativeRegExp(RGI_EMOJI_FALLBACK_SOURCE, 'u');
                }
                throw innerError;
              }
            }
            Object.setPrototypeOf(CompatRegExp, NativeRegExp);
            CompatRegExp.prototype = NativeRegExp.prototype;
            Object.defineProperty(CompatRegExp.prototype, 'constructor', {
              value: CompatRegExp,
              writable: true,
              configurable: true,
            });
            CompatRegExp.__secureExecRgiEmojiCompat = true;
            globalThis.RegExp = CompatRegExp;
          }
        }
      }

      if (
        typeof globalThis.AbortController === 'undefined' ||
        typeof globalThis.AbortSignal === 'undefined' ||
        typeof globalThis.AbortSignal?.prototype?.addEventListener !== 'function' ||
        typeof globalThis.AbortSignal?.prototype?.removeEventListener !== 'function'
      ) {
        const abortSignalState = new WeakMap();
        function getAbortSignalState(signal) {
          const state = abortSignalState.get(signal);
          if (!state) {
            throw new Error('Invalid AbortSignal');
          }
          return state;
        }

        class AbortSignal {
          constructor() {
            this.onabort = null;
            abortSignalState.set(this, {
              aborted: false,
              reason: undefined,
              listeners: [],
            });
          }

          get aborted() {
            return getAbortSignalState(this).aborted;
          }

          get reason() {
            return getAbortSignalState(this).reason;
          }

          get _listeners() {
            return getAbortSignalState(this).listeners.slice();
          }

          getEventListeners(type) {
            if (type !== 'abort') return [];
            return getAbortSignalState(this).listeners.slice();
          }

          addEventListener(type, listener) {
            if (type !== 'abort' || typeof listener !== 'function') return;
            getAbortSignalState(this).listeners.push(listener);
          }

          removeEventListener(type, listener) {
            if (type !== 'abort' || typeof listener !== 'function') return;
            const listeners = getAbortSignalState(this).listeners;
            const index = listeners.indexOf(listener);
            if (index !== -1) {
              listeners.splice(index, 1);
            }
          }

          dispatchEvent(event) {
            if (!event || event.type !== 'abort') return false;
            if (typeof this.onabort === 'function') {
              try {
                this.onabort.call(this, event);
              } catch {}
            }
            const listeners = getAbortSignalState(this).listeners.slice();
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
            const state = getAbortSignalState(this.signal);
            if (state.aborted) return;
            state.aborted = true;
            state.reason = reason;
            this.signal.dispatchEvent({ type: 'abort' });
          }
        }

        __requireExposeCustomGlobal('AbortSignal', AbortSignal);
        __requireExposeCustomGlobal('AbortController', AbortController);
      }

      if (
        typeof globalThis.AbortSignal === 'function' &&
        typeof globalThis.AbortController === 'function' &&
        typeof globalThis.AbortSignal.abort !== 'function'
      ) {
        globalThis.AbortSignal.abort = function abort(reason) {
          const controller = new globalThis.AbortController();
          controller.abort(reason);
          return controller.signal;
        };
      }

      if (
        typeof globalThis.AbortSignal === 'function' &&
        typeof globalThis.AbortController === 'function' &&
        typeof globalThis.AbortSignal.timeout !== 'function'
      ) {
        globalThis.AbortSignal.timeout = function timeout(milliseconds) {
          var delay = Number(milliseconds);
          if (!Number.isFinite(delay) || delay < 0) {
            throw new RangeError('The value of "milliseconds" is out of range. It must be a finite, non-negative number.');
          }

          var controller = new globalThis.AbortController();
          var timer = setTimeout(function() {
            controller.abort(
              new globalThis.DOMException(
                'The operation was aborted due to timeout',
                'TimeoutError',
              ),
            );
          }, delay);
          if (timer && typeof timer.unref === 'function') {
            timer.unref();
          }
          return controller.signal;
        };
      }

      if (
        typeof globalThis.AbortSignal === 'function' &&
        typeof globalThis.AbortController === 'function' &&
        typeof globalThis.AbortSignal.any !== 'function'
      ) {
        globalThis.AbortSignal.any = function any(signals) {
          if (
            signals === null ||
            signals === undefined ||
            typeof signals[Symbol.iterator] !== 'function'
          ) {
            throw new TypeError('The "signals" argument must be an iterable.');
          }

          var controller = new globalThis.AbortController();
          var cleanup = [];
          var abortFromSignal = function abortFromSignal(signal) {
            for (var index = 0; index < cleanup.length; index += 1) {
              cleanup[index]();
            }
            cleanup.length = 0;
            controller.abort(signal.reason);
          };

          for (const signal of signals) {
            if (
              !signal ||
              typeof signal.aborted !== 'boolean' ||
              typeof signal.addEventListener !== 'function' ||
              typeof signal.removeEventListener !== 'function'
            ) {
              throw new TypeError('The "signals" argument must contain only AbortSignal instances.');
            }
            if (signal.aborted) {
              abortFromSignal(signal);
              break;
            }
            var listener = function() {
              abortFromSignal(signal);
            };
            signal.addEventListener('abort', listener, { once: true });
            cleanup.push(function() {
              signal.removeEventListener('abort', listener);
            });
          }

          return controller.signal;
        };
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

      if (typeof globalThis.SharedArrayBuffer === 'undefined') {
        globalThis.SharedArrayBuffer = ArrayBuffer;
        __requireExposeCustomGlobal('SharedArrayBuffer', ArrayBuffer);
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

      (function installWhatwgEncodingAndEvents() {
        function _withCode(error, code) {
          error.code = code;
          return error;
        }

        function _trimAsciiWhitespace(value) {
          return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
        }

        function _normalizeEncodingLabel(label) {
          var normalized = _trimAsciiWhitespace(
            label === undefined ? 'utf-8' : String(label),
          ).toLowerCase();
          switch (normalized) {
            case 'utf-8':
            case 'utf8':
            case 'unicode-1-1-utf-8':
            case 'unicode11utf8':
            case 'unicode20utf8':
            case 'x-unicode20utf8':
              return 'utf-8';
            case 'utf-16':
            case 'utf-16le':
            case 'ucs-2':
            case 'ucs2':
            case 'csunicode':
            case 'iso-10646-ucs-2':
            case 'unicode':
            case 'unicodefeff':
              return 'utf-16le';
            case 'utf-16be':
            case 'unicodefffe':
              return 'utf-16be';
            default:
              throw _withCode(
                new RangeError('The "' + normalized + '" encoding is not supported'),
                'ERR_ENCODING_NOT_SUPPORTED',
              );
          }
        }

        function _toUint8Array(input) {
          if (input === undefined) {
            return new Uint8Array(0);
          }
          if (ArrayBuffer.isView(input)) {
            return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
          }
          if (input instanceof ArrayBuffer) {
            return new Uint8Array(input);
          }
          if (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer) {
            return new Uint8Array(input);
          }
          throw _withCode(
            new TypeError(
              'The "input" argument must be an instance of ArrayBuffer, SharedArrayBuffer, or ArrayBufferView.',
            ),
            'ERR_INVALID_ARG_TYPE',
          );
        }

        function _encodeUtf8ScalarValue(codePoint, bytes) {
          if (codePoint <= 0x7f) {
            bytes.push(codePoint);
            return;
          }
          if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
            return;
          }
          if (codePoint <= 0xffff) {
            bytes.push(
              0xe0 | (codePoint >> 12),
              0x80 | ((codePoint >> 6) & 0x3f),
              0x80 | (codePoint & 0x3f),
            );
            return;
          }
          bytes.push(
            0xf0 | (codePoint >> 18),
            0x80 | ((codePoint >> 12) & 0x3f),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f),
          );
        }

        function _encodeUtf8(input) {
          var value = String(input === undefined ? '' : input);
          var bytes = [];
          for (var index = 0; index < value.length; index += 1) {
            var codeUnit = value.charCodeAt(index);
            if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
              var nextIndex = index + 1;
              if (nextIndex < value.length) {
                var nextCodeUnit = value.charCodeAt(nextIndex);
                if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
                  _encodeUtf8ScalarValue(
                    0x10000 + ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00),
                    bytes,
                  );
                  index = nextIndex;
                  continue;
                }
              }
              _encodeUtf8ScalarValue(0xfffd, bytes);
              continue;
            }
            if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
              _encodeUtf8ScalarValue(0xfffd, bytes);
              continue;
            }
            _encodeUtf8ScalarValue(codeUnit, bytes);
          }
          return new Uint8Array(bytes);
        }

        function _appendCodePoint(output, codePoint) {
          if (codePoint <= 0xffff) {
            output.push(String.fromCharCode(codePoint));
            return;
          }
          var adjusted = codePoint - 0x10000;
          output.push(
            String.fromCharCode(0xd800 + (adjusted >> 10)),
            String.fromCharCode(0xdc00 + (adjusted & 0x3ff)),
          );
        }

        function _isContinuationByte(value) {
          return value >= 0x80 && value <= 0xbf;
        }

        function _createInvalidDataError(encoding) {
          return _withCode(
            new TypeError('The encoded data was not valid for encoding ' + encoding),
            'ERR_ENCODING_INVALID_ENCODED_DATA',
          );
        }

        function _decodeUtf8(bytes, fatal, stream, encoding) {
          var output = [];
          for (var index = 0; index < bytes.length;) {
            var first = bytes[index];
            if (first <= 0x7f) {
              output.push(String.fromCharCode(first));
              index += 1;
              continue;
            }

            var needed = 0;
            var codePoint = 0;
            if (first >= 0xc2 && first <= 0xdf) {
              needed = 1;
              codePoint = first & 0x1f;
            } else if (first >= 0xe0 && first <= 0xef) {
              needed = 2;
              codePoint = first & 0x0f;
            } else if (first >= 0xf0 && first <= 0xf4) {
              needed = 3;
              codePoint = first & 0x07;
            } else {
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              index += 1;
              continue;
            }

            if (index + needed >= bytes.length) {
              if (stream) {
                return { text: output.join(''), pending: Array.from(bytes.slice(index)) };
              }
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              break;
            }

            var second = bytes[index + 1];
            if (!_isContinuationByte(second)) {
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              index += 1;
              continue;
            }

            if (
              (first === 0xe0 && second < 0xa0) ||
              (first === 0xed && second > 0x9f) ||
              (first === 0xf0 && second < 0x90) ||
              (first === 0xf4 && second > 0x8f)
            ) {
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              index += 1;
              continue;
            }

            codePoint = (codePoint << 6) | (second & 0x3f);

            if (needed >= 2) {
              var third = bytes[index + 2];
              if (!_isContinuationByte(third)) {
                if (fatal) throw _createInvalidDataError(encoding);
                output.push('\ufffd');
                index += 1;
                continue;
              }
              codePoint = (codePoint << 6) | (third & 0x3f);
            }

            if (needed === 3) {
              var fourth = bytes[index + 3];
              if (!_isContinuationByte(fourth)) {
                if (fatal) throw _createInvalidDataError(encoding);
                output.push('\ufffd');
                index += 1;
                continue;
              }
              codePoint = (codePoint << 6) | (fourth & 0x3f);
            }

            if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              index += needed + 1;
              continue;
            }

            _appendCodePoint(output, codePoint);
            index += needed + 1;
          }

          return { text: output.join(''), pending: [] };
        }

        function _decodeUtf16(bytes, encoding, fatal, stream, bomSeen) {
          var output = [];
          var endian = encoding === 'utf-16be' ? 'be' : 'le';

          if (!bomSeen && encoding === 'utf-16le' && bytes.length >= 2) {
            if (bytes[0] === 0xfe && bytes[1] === 0xff) {
              endian = 'be';
            }
          }

          for (var index = 0; index < bytes.length;) {
            if (index + 1 >= bytes.length) {
              if (stream) {
                return { text: output.join(''), pending: Array.from(bytes.slice(index)) };
              }
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              break;
            }

            var first = bytes[index];
            var second = bytes[index + 1];
            var codeUnit = endian === 'le' ? first | (second << 8) : (first << 8) | second;
            index += 2;

            if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
              if (index + 1 >= bytes.length) {
                if (stream) {
                  return { text: output.join(''), pending: Array.from(bytes.slice(index - 2)) };
                }
                if (fatal) throw _createInvalidDataError(encoding);
                output.push('\ufffd');
                continue;
              }

              var nextFirst = bytes[index];
              var nextSecond = bytes[index + 1];
              var nextCodeUnit =
                endian === 'le'
                  ? nextFirst | (nextSecond << 8)
                  : (nextFirst << 8) | nextSecond;

              if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
                _appendCodePoint(
                  output,
                  0x10000 + ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00),
                );
                index += 2;
                continue;
              }

              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              continue;
            }

            if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
              if (fatal) throw _createInvalidDataError(encoding);
              output.push('\ufffd');
              continue;
            }

            output.push(String.fromCharCode(codeUnit));
          }

          return { text: output.join(''), pending: [] };
        }

        function TextEncoder() {}
        TextEncoder.prototype.encode = function encode(input) {
          return _encodeUtf8(input === undefined ? '' : input);
        };
        TextEncoder.prototype.encodeInto = function encodeInto(input, destination) {
          var value = String(input);
          var read = 0;
          var written = 0;
          for (var index = 0; index < value.length; index += 1) {
            var codeUnit = value.charCodeAt(index);
            var chunk = value[index] || '';
            if (
              codeUnit >= 0xd800 &&
              codeUnit <= 0xdbff &&
              index + 1 < value.length
            ) {
              var nextCodeUnit = value.charCodeAt(index + 1);
              if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
                chunk = value.slice(index, index + 2);
              }
            }
            var encoded = _encodeUtf8(chunk);
            if (written + encoded.length > destination.length) break;
            destination.set(encoded, written);
            written += encoded.length;
            read += chunk.length;
            if (chunk.length === 2) index += 1;
          }
          return { read: read, written: written };
        };
        Object.defineProperty(TextEncoder.prototype, 'encoding', {
          get: function() { return 'utf-8'; },
        });

        function TextDecoder(label, options) {
          var normalizedOptions = options == null ? {} : Object(options);
          this._encoding = _normalizeEncodingLabel(label);
          this._fatal = Boolean(normalizedOptions.fatal);
          this._ignoreBOM = Boolean(normalizedOptions.ignoreBOM);
          this._pendingBytes = [];
          this._bomSeen = false;
        }
        Object.defineProperty(TextDecoder.prototype, 'encoding', {
          get: function() { return this._encoding; },
        });
        Object.defineProperty(TextDecoder.prototype, 'fatal', {
          get: function() { return this._fatal; },
        });
        Object.defineProperty(TextDecoder.prototype, 'ignoreBOM', {
          get: function() { return this._ignoreBOM; },
        });
        TextDecoder.prototype.decode = function decode(input, options) {
          var normalizedOptions = options == null ? {} : Object(options);
          var stream = Boolean(normalizedOptions.stream);
          var incoming = _toUint8Array(input);
          var merged = new Uint8Array(this._pendingBytes.length + incoming.length);
          merged.set(this._pendingBytes, 0);
          merged.set(incoming, this._pendingBytes.length);

          var decoded =
            this._encoding === 'utf-8'
              ? _decodeUtf8(merged, this._fatal, stream, this._encoding)
              : _decodeUtf16(merged, this._encoding, this._fatal, stream, this._bomSeen);

          this._pendingBytes = decoded.pending;
          var text = decoded.text;

          if (!this._bomSeen && text.length > 0) {
            if (!this._ignoreBOM && text.charCodeAt(0) === 0xfeff) {
              text = text.slice(1);
            }
            this._bomSeen = true;
          }

          if (!stream && this._pendingBytes.length > 0) {
            var pendingLength = this._pendingBytes.length;
            this._pendingBytes = [];
            if (this._fatal) throw _createInvalidDataError(this._encoding);
            return text + '\ufffd'.repeat(Math.ceil(pendingLength / 2));
          }

          return text;
        };

        function _normalizeAddEventListenerOptions(options) {
          if (typeof options === 'boolean') {
            return { capture: options, once: false, passive: false };
          }
          if (options == null) {
            return { capture: false, once: false, passive: false };
          }
          var normalized = Object(options);
          return {
            capture: Boolean(normalized.capture),
            once: Boolean(normalized.once),
            passive: Boolean(normalized.passive),
            signal: normalized.signal,
          };
        }

        function _normalizeRemoveEventListenerOptions(options) {
          if (typeof options === 'boolean') return options;
          if (options == null) return false;
          return Boolean(Object(options).capture);
        }

        function _isAbortSignalLike(value) {
          return (
            typeof value === 'object' &&
            value !== null &&
            'aborted' in value &&
            typeof value.addEventListener === 'function' &&
            typeof value.removeEventListener === 'function'
          );
        }

        function Event(type, init) {
          if (arguments.length === 0) {
            throw new TypeError('The event type must be provided');
          }
          var normalizedInit = init == null ? {} : Object(init);
          this.type = String(type);
          this.bubbles = Boolean(normalizedInit.bubbles);
          this.cancelable = Boolean(normalizedInit.cancelable);
          this.composed = Boolean(normalizedInit.composed);
          this.detail = null;
          this.defaultPrevented = false;
          this.target = null;
          this.currentTarget = null;
          this.eventPhase = 0;
          this.returnValue = true;
          this.cancelBubble = false;
          this.timeStamp = Date.now();
          this.isTrusted = false;
          this.srcElement = null;
          this._inPassiveListener = false;
          this._propagationStopped = false;
          this._immediatePropagationStopped = false;
        }
        Event.NONE = 0;
        Event.CAPTURING_PHASE = 1;
        Event.AT_TARGET = 2;
        Event.BUBBLING_PHASE = 3;
        Event.prototype.preventDefault = function preventDefault() {
          if (this.cancelable && !this._inPassiveListener) {
            this.defaultPrevented = true;
            this.returnValue = false;
          }
        };
        Event.prototype.stopPropagation = function stopPropagation() {
          this._propagationStopped = true;
          this.cancelBubble = true;
        };
        Event.prototype.stopImmediatePropagation = function stopImmediatePropagation() {
          this._propagationStopped = true;
          this._immediatePropagationStopped = true;
          this.cancelBubble = true;
        };
        Event.prototype.composedPath = function composedPath() {
          return this.target ? [this.target] : [];
        };

        function CustomEvent(type, init) {
          Event.call(this, type, init);
          var normalizedInit = init == null ? null : Object(init);
          this.detail =
            normalizedInit && 'detail' in normalizedInit ? normalizedInit.detail : null;
        }
        CustomEvent.prototype = Object.create(Event.prototype);
        CustomEvent.prototype.constructor = CustomEvent;

        function EventTarget() {
          this._listeners = new Map();
        }
        EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
          var normalized = _normalizeAddEventListenerOptions(options);

          if (normalized.signal !== undefined && !_isAbortSignalLike(normalized.signal)) {
            throw new TypeError('The "signal" option must be an instance of AbortSignal.');
          }

          if (listener == null) return undefined;
          if (typeof listener !== 'function' && (typeof listener !== 'object' || listener === null)) {
            return undefined;
          }
          if (normalized.signal && normalized.signal.aborted) return undefined;

          var records = this._listeners.get(type) || [];
          for (var i = 0; i < records.length; i += 1) {
            if (records[i].listener === listener && records[i].capture === normalized.capture) {
              return undefined;
            }
          }

          var record = {
            listener: listener,
            capture: normalized.capture,
            once: normalized.once,
            passive: normalized.passive,
            kind: typeof listener === 'function' ? 'function' : 'object',
            signal: normalized.signal,
            abortListener: undefined,
          };

          if (normalized.signal) {
            var self = this;
            record.abortListener = function() {
              self.removeEventListener(type, listener, normalized.capture);
            };
            normalized.signal.addEventListener('abort', record.abortListener, { once: true });
          }

          records.push(record);
          this._listeners.set(type, records);
          return undefined;
        };
        EventTarget.prototype.removeEventListener = function removeEventListener(type, listener, options) {
          if (listener == null) return;

          var capture = _normalizeRemoveEventListenerOptions(options);
          var records = this._listeners.get(type);
          if (!records) return;

          var nextRecords = [];
          for (var i = 0; i < records.length; i += 1) {
            var record = records[i];
            var match = record.listener === listener && record.capture === capture;
            if (match) {
              if (record.signal && record.abortListener) {
                record.signal.removeEventListener('abort', record.abortListener);
              }
            } else {
              nextRecords.push(record);
            }
          }

          if (nextRecords.length === 0) {
            this._listeners.delete(type);
          } else {
            this._listeners.set(type, nextRecords);
          }
        };
        EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
          if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
            throw new TypeError('Argument 1 must be an Event');
          }

          var records = (this._listeners.get(event.type) || []).slice();
          event.target = this;
          event.currentTarget = this;
          event.eventPhase = 2;

          for (var i = 0; i < records.length; i += 1) {
            var record = records[i];
            var active = this._listeners.get(event.type);
            if (!active || active.indexOf(record) === -1) continue;

            if (record.once) {
              this.removeEventListener(event.type, record.listener, record.capture);
            }

            event._inPassiveListener = record.passive;
            if (record.kind === 'function') {
              record.listener.call(this, event);
            } else {
              var handleEvent = record.listener.handleEvent;
              if (typeof handleEvent === 'function') {
                handleEvent.call(record.listener, event);
              }
            }
            event._inPassiveListener = false;

            if (event._immediatePropagationStopped || event._propagationStopped) {
              break;
            }
          }

          event.currentTarget = null;
          event.eventPhase = 0;
          return !event.defaultPrevented;
        };

        globalThis.TextEncoder = TextEncoder;
        globalThis.TextDecoder = TextDecoder;
        globalThis.Event = Event;
        globalThis.CustomEvent = CustomEvent;
        globalThis.EventTarget = EventTarget;

        if (typeof globalThis.DOMException === 'undefined') {
          var DOM_EXCEPTION_LEGACY_CODES = {
            IndexSizeError: 1,
            DOMStringSizeError: 2,
            HierarchyRequestError: 3,
            WrongDocumentError: 4,
            InvalidCharacterError: 5,
            NoDataAllowedError: 6,
            NoModificationAllowedError: 7,
            NotFoundError: 8,
            NotSupportedError: 9,
            InUseAttributeError: 10,
            InvalidStateError: 11,
            SyntaxError: 12,
            InvalidModificationError: 13,
            NamespaceError: 14,
            InvalidAccessError: 15,
            ValidationError: 16,
            TypeMismatchError: 17,
            SecurityError: 18,
            NetworkError: 19,
            AbortError: 20,
            URLMismatchError: 21,
            QuotaExceededError: 22,
            TimeoutError: 23,
            InvalidNodeTypeError: 24,
            DataCloneError: 25,
          };

          function DOMException(message, name) {
            if (!(this instanceof DOMException)) {
              throw new TypeError("Class constructor DOMException cannot be invoked without 'new'");
            }

            Error.call(this, message);
            this.message = message === undefined ? '' : String(message);
            this.name = name === undefined ? 'Error' : String(name);
            this.code = DOM_EXCEPTION_LEGACY_CODES[this.name] || 0;

            if (typeof Error.captureStackTrace === 'function') {
              Error.captureStackTrace(this, DOMException);
            }
          }

          DOMException.prototype = Object.create(Error.prototype);
          Object.defineProperty(DOMException.prototype, 'constructor', {
            value: DOMException,
            writable: true,
            configurable: true,
          });
          Object.defineProperty(DOMException.prototype, Symbol.toStringTag, {
            value: 'DOMException',
            writable: false,
            enumerable: false,
            configurable: true,
          });

          for (var codeName in DOM_EXCEPTION_LEGACY_CODES) {
            if (!Object.prototype.hasOwnProperty.call(DOM_EXCEPTION_LEGACY_CODES, codeName)) {
              continue;
            }
            var codeValue = DOM_EXCEPTION_LEGACY_CODES[codeName];
            var constantName = codeName
              .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
              .toUpperCase();
            Object.defineProperty(DOMException, constantName, {
              value: codeValue,
              writable: false,
              enumerable: true,
              configurable: false,
            });
            Object.defineProperty(DOMException.prototype, constantName, {
              value: codeValue,
              writable: false,
              enumerable: true,
              configurable: false,
            });
          }

          __requireExposeCustomGlobal('DOMException', DOMException);
        }

        if (typeof globalThis.Blob === 'undefined') {
          function Blob(parts, options) {
            if (!(this instanceof Blob)) {
              throw new TypeError("Class constructor Blob cannot be invoked without 'new'");
            }
            this._parts = Array.isArray(parts) ? parts.slice() : [];
            this.type = options && options.type ? String(options.type).toLowerCase() : '';
            var size = 0;
            for (var index = 0; index < this._parts.length; index += 1) {
              var part = this._parts[index];
              if (typeof part === 'string') {
                size += part.length;
              } else if (part && typeof part.byteLength === 'number') {
                size += part.byteLength;
              }
            }
            this.size = size;
          }

          Blob.prototype.arrayBuffer = function arrayBuffer() {
            return Promise.resolve(new ArrayBuffer(0));
          };
          Blob.prototype.text = function text() {
            return Promise.resolve('');
          };
          Blob.prototype.slice = function slice() {
            return new Blob();
          };
          Blob.prototype.stream = function stream() {
            throw new Error('Blob.stream is not supported in sandbox');
          };
          Object.defineProperty(Blob.prototype, Symbol.toStringTag, {
            value: 'Blob',
            writable: false,
            enumerable: false,
            configurable: true,
          });

          __requireExposeCustomGlobal('Blob', Blob);
        }

        if (typeof globalThis.File === 'undefined') {
          function File(parts, name, options) {
            if (!(this instanceof File)) {
              throw new TypeError("Class constructor File cannot be invoked without 'new'");
            }
            globalThis.Blob.call(this, parts, options);
            this.name = String(name);
            this.lastModified =
              options && typeof options.lastModified === 'number'
                ? options.lastModified
                : Date.now();
            this.webkitRelativePath = '';
          }

          File.prototype = Object.create(globalThis.Blob.prototype);
          Object.defineProperty(File.prototype, 'constructor', {
            value: File,
            writable: true,
            configurable: true,
          });
          Object.defineProperty(File.prototype, Symbol.toStringTag, {
            value: 'File',
            writable: false,
            enumerable: false,
            configurable: true,
          });

          __requireExposeCustomGlobal('File', File);
        }

        if (typeof globalThis.FormData === 'undefined') {
          function FormData() {
            if (!(this instanceof FormData)) {
              throw new TypeError("Class constructor FormData cannot be invoked without 'new'");
            }
            this._entries = [];
          }

          FormData.prototype.append = function append(name, value) {
            this._entries.push([String(name), value]);
          };
          FormData.prototype.get = function get(name) {
            var key = String(name);
            for (var index = 0; index < this._entries.length; index += 1) {
              if (this._entries[index][0] === key) {
                return this._entries[index][1];
              }
            }
            return null;
          };
          FormData.prototype.getAll = function getAll(name) {
            var key = String(name);
            var values = [];
            for (var index = 0; index < this._entries.length; index += 1) {
              if (this._entries[index][0] === key) {
                values.push(this._entries[index][1]);
              }
            }
            return values;
          };
          FormData.prototype.has = function has(name) {
            return this.get(name) !== null;
          };
          FormData.prototype.delete = function del(name) {
            var key = String(name);
            this._entries = this._entries.filter(function(entry) {
              return entry[0] !== key;
            });
          };
          FormData.prototype.entries = function entries() {
            return this._entries[Symbol.iterator]();
          };
          FormData.prototype[Symbol.iterator] = function iterator() {
            return this.entries();
          };
          Object.defineProperty(FormData.prototype, Symbol.toStringTag, {
            value: 'FormData',
            writable: false,
            enumerable: false,
            configurable: true,
          });

          __requireExposeCustomGlobal('FormData', FormData);
        }

        if (typeof globalThis.MessageEvent === 'undefined') {
          function MessageEvent(type, options) {
            if (!(this instanceof MessageEvent)) {
              throw new TypeError("Class constructor MessageEvent cannot be invoked without 'new'");
            }
            globalThis.Event.call(this, type, options);
            this.data = options && 'data' in options ? options.data : undefined;
          }

          MessageEvent.prototype = Object.create(globalThis.Event.prototype);
          Object.defineProperty(MessageEvent.prototype, 'constructor', {
            value: MessageEvent,
            writable: true,
            configurable: true,
          });

          globalThis.MessageEvent = MessageEvent;
        }

        if (typeof globalThis.MessagePort === 'undefined') {
          function MessagePort() {
            if (!(this instanceof MessagePort)) {
              throw new TypeError("Class constructor MessagePort cannot be invoked without 'new'");
            }
            globalThis.EventTarget.call(this);
            this.onmessage = null;
            this._pairedPort = null;
          }

          MessagePort.prototype = Object.create(globalThis.EventTarget.prototype);
          Object.defineProperty(MessagePort.prototype, 'constructor', {
            value: MessagePort,
            writable: true,
            configurable: true,
          });
          MessagePort.prototype.postMessage = function postMessage(data) {
            var target = this._pairedPort;
            if (!target) {
              return;
            }
            var event = new globalThis.MessageEvent('message', { data: data });
            target.dispatchEvent(event);
            if (typeof target.onmessage === 'function') {
              target.onmessage.call(target, event);
            }
          };
          MessagePort.prototype.start = function start() {};
          MessagePort.prototype.close = function close() {
            this._pairedPort = null;
          };

          globalThis.MessagePort = MessagePort;
        }

        if (typeof globalThis.MessageChannel === 'undefined') {
          function MessageChannel() {
            if (!(this instanceof MessageChannel)) {
              throw new TypeError("Class constructor MessageChannel cannot be invoked without 'new'");
            }
            this.port1 = new globalThis.MessagePort();
            this.port2 = new globalThis.MessagePort();
            this.port1._pairedPort = this.port2;
            this.port2._pairedPort = this.port1;
          }

          globalThis.MessageChannel = MessageChannel;
        }
      })();

      (function installWebStreamsGlobals() {
        if (typeof globalThis.ReadableStream !== 'undefined') {
          return;
        }
        if (typeof _loadPolyfill === 'undefined') {
          return;
        }

        const polyfillCode = _loadPolyfill.applySyncPromise(undefined, ['stream/web']);
        if (polyfillCode === null) {
          return;
        }

        const webStreams = Function('"use strict"; return (' + polyfillCode + ');')();
        const names = [
          'ReadableStream',
          'ReadableStreamDefaultReader',
          'ReadableStreamBYOBReader',
          'ReadableStreamBYOBRequest',
          'ReadableByteStreamController',
          'ReadableStreamDefaultController',
          'TransformStream',
          'TransformStreamDefaultController',
          'WritableStream',
          'WritableStreamDefaultWriter',
          'WritableStreamDefaultController',
          'ByteLengthQueuingStrategy',
          'CountQueuingStrategy',
          'TextEncoderStream',
          'TextDecoderStream',
          'CompressionStream',
          'DecompressionStream',
        ];

        for (const name of names) {
          if (typeof webStreams?.[name] !== 'undefined') {
            globalThis[name] = webStreams[name];
          }
        }
      })();

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

          var BufferCtor = result.Buffer;
          if (
            typeof globalThis.Buffer === 'function' &&
            globalThis.Buffer !== BufferCtor
          ) {
            BufferCtor = globalThis.Buffer;
            result.Buffer = BufferCtor;
          } else if (typeof globalThis.Buffer !== 'function' && typeof BufferCtor === 'function') {
            globalThis.Buffer = BufferCtor;
          }
          if (
            (typeof BufferCtor === 'function' || typeof BufferCtor === 'object') &&
            BufferCtor !== null
          ) {
            if (typeof result.SlowBuffer !== 'function') {
              result.SlowBuffer = BufferCtor;
            }
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

            if (typeof BufferCtor.allocUnsafe === 'function' && !BufferCtor.allocUnsafe._secureExecPatched) {
              var _origAllocUnsafe = BufferCtor.allocUnsafe;
              BufferCtor.allocUnsafe = function(size) {
                try {
                  return _origAllocUnsafe.apply(this, arguments);
                } catch (error) {
                  if (
                    error &&
                    error.name === 'RangeError' &&
                    typeof size === 'number' &&
                    size > maxLength
                  ) {
                    throw new Error('Array buffer allocation failed');
                  }
                  throw error;
                }
              };
              BufferCtor.allocUnsafe._secureExecPatched = true;
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
          if (typeof result.types === 'undefined' && typeof _requireFrom === 'function') {
            try {
              result.types = _requireFrom('util/types', '/');
            } catch {
              // Keep the util polyfill usable even if the util/types helper fails to load.
            }
          }
          if (
            (typeof result.MIMEType === 'undefined' || typeof result.MIMEParams === 'undefined') &&
            typeof _requireFrom === 'function'
          ) {
            try {
              const mimeModule = _requireFrom('internal/mime', '/');
              if (typeof result.MIMEType === 'undefined') {
                result.MIMEType = mimeModule.MIMEType;
              }
              if (typeof result.MIMEParams === 'undefined') {
                result.MIMEParams = mimeModule.MIMEParams;
              }
            } catch {
              // Keep the util polyfill usable even if the MIME helper fails to load.
            }
          }
          if (
            typeof result.inspect === 'function' &&
            typeof result.inspect.custom === 'undefined'
          ) {
            result.inspect.custom = Symbol.for('nodejs.util.inspect.custom');
          }
          if (
            typeof result.inspect === 'function' &&
            !result.inspect._secureExecPatchedCustomInspect
          ) {
            const customInspectSymbol = result.inspect.custom || Symbol.for('nodejs.util.inspect.custom');
            const originalInspect = result.inspect;
            const formatObjectKey = function(key) {
              return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
                ? key
                : originalInspect(key);
            };
            const containsCustomInspectable = function(value, depth, seen) {
              if (value === null) {
                return false;
              }
              if (typeof value !== 'object' && typeof value !== 'function') {
                return false;
              }
              if (typeof value[customInspectSymbol] === 'function') {
                return true;
              }
              if (depth < 0 || seen.has(value)) {
                return false;
              }
              seen.add(value);
              if (Array.isArray(value)) {
                for (const entry of value) {
                  if (containsCustomInspectable(entry, depth - 1, seen)) {
                    seen.delete(value);
                    return true;
                  }
                }
                seen.delete(value);
                return false;
              }
              for (const key of Object.keys(value)) {
                if (containsCustomInspectable(value[key], depth - 1, seen)) {
                  seen.delete(value);
                  return true;
                }
              }
              seen.delete(value);
              return false;
            };
            const inspectWithCustom = function(value, depth, options, seen) {
              if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
                return originalInspect(value, options);
              }
              if (seen.has(value)) {
                return '[Circular]';
              }
              if (typeof value[customInspectSymbol] === 'function') {
                return value[customInspectSymbol](depth, options, result.inspect);
              }
              if (depth < 0) {
                return originalInspect(value, options);
              }
              seen.add(value);
              if (Array.isArray(value)) {
                const items = value.map((entry) => inspectWithCustom(entry, depth - 1, options, seen));
                seen.delete(value);
                return `[ ${items.join(', ')} ]`;
              }
              const proto = Object.getPrototypeOf(value);
              if (proto === Object.prototype || proto === null) {
                const entries = Object.keys(value).map(
                  (key) => `${formatObjectKey(key)}: ${inspectWithCustom(value[key], depth - 1, options, seen)}`
                );
                seen.delete(value);
                return `{ ${entries.join(', ')} }`;
              }
              seen.delete(value);
              return originalInspect(value, options);
            };
            result.inspect = function inspect(value, options) {
              const inspectOptions =
                typeof options === 'object' && options !== null ? options : {};
              const depth =
                typeof inspectOptions.depth === 'number' ? inspectOptions.depth : 2;
              if (typeof value === 'symbol') {
                return value.toString();
              }
              if (!containsCustomInspectable(value, depth, new Set())) {
                return originalInspect.call(this, value, options);
              }
              return inspectWithCustom(value, depth, inspectOptions, new Set());
            };
            result.inspect.custom = customInspectSymbol;
            result.inspect._secureExecPatchedCustomInspect = true;
          }
          return result;
        }

        if (name === 'events') {
          if (typeof result.getEventListeners !== 'function') {
            result.getEventListeners = function getEventListeners(target, eventName) {
              if (target && typeof target.listeners === 'function') {
                return target.listeners(eventName);
              }
              if (
                target &&
                typeof target.getEventListeners === 'function'
              ) {
                return target.getEventListeners(eventName);
              }
              if (
                target &&
                eventName === 'abort' &&
                Array.isArray(target._listeners)
              ) {
                return target._listeners.slice();
              }
              return [];
            };
          }
          return result;
        }

        if (name === 'stream' || name === 'node:stream') {
          const getWebStreamsState = function() {
            return globalThis.__secureExecWebStreams || null;
          };
          const webStreamsState = getWebStreamsState();
          if (typeof result.isReadable !== 'function') {
            result.isReadable = function(stream) {
              const stateKey = getWebStreamsState() && getWebStreamsState().kState;
              return Boolean(stateKey && stream && stream[stateKey] && stream[stateKey].state === 'readable');
            };
          }
          if (typeof result.isErrored !== 'function') {
            result.isErrored = function(stream) {
              const stateKey = getWebStreamsState() && getWebStreamsState().kState;
              return Boolean(stateKey && stream && stream[stateKey] && stream[stateKey].state === 'errored');
            };
          }
          if (typeof result.isDisturbed !== 'function') {
            result.isDisturbed = function(stream) {
              const stateKey = getWebStreamsState() && getWebStreamsState().kState;
              return Boolean(stateKey && stream && stream[stateKey] && stream[stateKey].disturbed === true);
            };
          }
          const ReadableCtor = result.Readable;
          const WritableCtor = result.Writable;
          const readableFrom =
            typeof ReadableCtor === 'function' ? ReadableCtor.from : undefined;
          const readableFromSource =
            typeof readableFrom === 'function'
              ? Function.prototype.toString.call(readableFrom)
              : '';
          const hasBrowserReadableFromStub =
            readableFromSource.indexOf(
              'Readable.from is not available in the browser',
            ) !== -1 ||
            readableFromSource.indexOf('require_from_browser') !== -1;
          if (
            typeof ReadableCtor === 'function' &&
            (typeof readableFrom !== 'function' || hasBrowserReadableFromStub)
          ) {
            ReadableCtor.from = function from(iterable, options) {
              const readable = new ReadableCtor(Object.assign({ read() {} }, options || {}));
              Promise.resolve().then(async function() {
                try {
                  if (
                    iterable &&
                    typeof iterable[Symbol.asyncIterator] === 'function'
                  ) {
                    for await (const chunk of iterable) {
                      readable.push(chunk);
                    }
                  } else if (
                    iterable &&
                    typeof iterable[Symbol.iterator] === 'function'
                  ) {
                    for (const chunk of iterable) {
                      readable.push(chunk);
                    }
                  } else {
                    readable.push(iterable);
                  }
                  readable.push(null);
                } catch (error) {
                  if (typeof readable.destroy === 'function') {
                    readable.destroy(error);
                  } else {
                    readable.emit('error', error);
                  }
                }
              });
              return readable;
            };
          }
          if (
            webStreamsState &&
            typeof ReadableCtor === 'function'
          ) {
            if (
              typeof ReadableCtor.fromWeb !== 'function' &&
              typeof webStreamsState.newStreamReadableFromReadableStream === 'function'
            ) {
              ReadableCtor.fromWeb = function fromWeb(readableStream, options) {
                return webStreamsState.newStreamReadableFromReadableStream(readableStream, options);
              };
            }
            if (
              typeof ReadableCtor.toWeb !== 'function' &&
              typeof webStreamsState.newReadableStreamFromStreamReadable === 'function'
            ) {
              ReadableCtor.toWeb = function toWeb(readable) {
                return webStreamsState.newReadableStreamFromStreamReadable(readable);
              };
            }
          }
          if (
            webStreamsState &&
            typeof WritableCtor === 'function'
          ) {
            if (
              typeof WritableCtor.fromWeb !== 'function' &&
              typeof webStreamsState.newStreamWritableFromWritableStream === 'function'
            ) {
              WritableCtor.fromWeb = function fromWeb(writableStream, options) {
                return webStreamsState.newStreamWritableFromWritableStream(writableStream, options);
              };
            }
            if (
              typeof WritableCtor.toWeb !== 'function' &&
              typeof webStreamsState.newWritableStreamFromStreamWritable === 'function'
            ) {
              WritableCtor.toWeb = function toWeb(writable) {
                return webStreamsState.newWritableStreamFromStreamWritable(writable);
              };
            }
          }
          if (
            webStreamsState &&
            typeof result.Duplex === 'function'
          ) {
            if (
              typeof result.Duplex.fromWeb !== 'function' &&
              typeof webStreamsState.newStreamDuplexFromReadableWritablePair === 'function'
            ) {
              result.Duplex.fromWeb = function fromWeb(pair, options) {
                return webStreamsState.newStreamDuplexFromReadableWritablePair(pair, options);
              };
            }
            if (
              typeof result.Duplex.toWeb !== 'function' &&
              typeof webStreamsState.newReadableWritablePairFromDuplex === 'function'
            ) {
              result.Duplex.toWeb = function toWeb(duplex) {
                return webStreamsState.newReadableWritablePairFromDuplex(duplex);
              };
            }
          }
          if (
            typeof ReadableCtor === 'function' &&
            !Object.getOwnPropertyDescriptor(ReadableCtor.prototype, 'readableObjectMode')
          ) {
            Object.defineProperty(ReadableCtor.prototype, 'readableObjectMode', {
              configurable: true,
              enumerable: false,
              get() {
                return Boolean(this?._readableState?.objectMode);
              },
            });
          }
          if (
            typeof WritableCtor === 'function' &&
            !Object.getOwnPropertyDescriptor(WritableCtor.prototype, 'writableObjectMode')
          ) {
            Object.defineProperty(WritableCtor.prototype, 'writableObjectMode', {
              configurable: true,
              enumerable: false,
              get() {
                return Boolean(this?._writableState?.objectMode);
              },
            });
          }
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
          // Avoid bare `require` here so built dist bundles don't rewrite it to
          // an ESM helper that throws before the sandbox installs globalThis.require.
          var _runtimeRequire = globalThis.require;
          var _streamModule = _runtimeRequire && _runtimeRequire('stream');
          var _utilModule = _runtimeRequire && _runtimeRequire('util');
          var _Transform = _streamModule && _streamModule.Transform;
          var _inherits = _utilModule && _utilModule.inherits;

          function createCryptoRangeError(name, message) {
            var error = new RangeError(message);
            error.code = 'ERR_OUT_OF_RANGE';
            error.name = 'RangeError';
            return error;
          }

          function createCryptoError(code, message) {
            var error = new Error(message);
            error.code = code;
            return error;
          }

          function encodeCryptoResult(buffer, encoding) {
            if (!encoding || encoding === 'buffer') return buffer;
            return buffer.toString(encoding);
          }

          function isSharedArrayBufferInstance(value) {
            return typeof SharedArrayBuffer !== 'undefined' &&
              value instanceof SharedArrayBuffer;
          }

          function isBinaryLike(value) {
            return Buffer.isBuffer(value) ||
              ArrayBuffer.isView(value) ||
              value instanceof ArrayBuffer ||
              isSharedArrayBufferInstance(value);
          }

          function normalizeByteSource(value, name, options) {
            var allowNull = options && options.allowNull;
            if (allowNull && value === null) {
              return null;
            }
            if (typeof value === 'string') {
              return Buffer.from(value, 'utf8');
            }
            if (Buffer.isBuffer(value)) {
              return Buffer.from(value);
            }
            if (ArrayBuffer.isView(value)) {
              return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            }
            if (value instanceof ArrayBuffer || isSharedArrayBufferInstance(value)) {
              return Buffer.from(value);
            }
            throw createInvalidArgTypeError(
              name,
              'of type string or an instance of ArrayBuffer, Buffer, TypedArray, or DataView',
              value,
            );
          }

          function serializeCipherBridgeOptions(options) {
            if (!options) {
              return '';
            }
            var serialized = {};
            if (options.authTagLength !== undefined) {
              serialized.authTagLength = options.authTagLength;
            }
            if (options.authTag) {
              serialized.authTag = options.authTag.toString('base64');
            }
            if (options.aad) {
              serialized.aad = options.aad.toString('base64');
            }
            if (options.aadOptions !== undefined) {
              serialized.aadOptions = options.aadOptions;
            }
            if (options.autoPadding !== undefined) {
              serialized.autoPadding = options.autoPadding;
            }
            if (options.validateOnly !== undefined) {
              serialized.validateOnly = options.validateOnly;
            }
            return JSON.stringify(serialized);
          }

          // Overlay host-backed createHash on top of crypto-browserify polyfill
          if (typeof _cryptoHashDigest !== 'undefined') {
            function SandboxHash(algorithm, options) {
              if (!(this instanceof SandboxHash)) {
                return new SandboxHash(algorithm, options);
              }
              if (!_Transform || !_inherits) {
                throw new Error('stream.Transform is required for crypto.Hash');
              }
              if (typeof algorithm !== 'string') {
                throw createInvalidArgTypeError('algorithm', 'of type string', algorithm);
              }
              _Transform.call(this, options);
              this._algorithm = algorithm;
              this._chunks = [];
              this._finalized = false;
              this._cachedDigest = null;
              this._allowCachedDigest = false;
            }
            _inherits(SandboxHash, _Transform);
            SandboxHash.prototype.update = function update(data, inputEncoding) {
              if (this._finalized) {
                throw createCryptoError('ERR_CRYPTO_HASH_FINALIZED', 'Digest already called');
              }
              if (typeof data === 'string') {
                this._chunks.push(Buffer.from(data, inputEncoding || 'utf8'));
              } else if (isBinaryLike(data)) {
                this._chunks.push(Buffer.from(data));
              } else {
                throw createInvalidArgTypeError(
                  'data',
                  'one of type string, Buffer, TypedArray, or DataView',
                  data,
                );
              }
              return this;
            };
            SandboxHash.prototype._finishDigest = function _finishDigest() {
              if (this._cachedDigest) {
                return this._cachedDigest;
              }
              var combined = Buffer.concat(this._chunks);
              var resultBase64 = _cryptoHashDigest.applySync(undefined, [
                this._algorithm,
                combined.toString('base64'),
              ]);
              this._cachedDigest = Buffer.from(resultBase64, 'base64');
              this._finalized = true;
              return this._cachedDigest;
            };
            SandboxHash.prototype.digest = function digest(encoding) {
              if (this._finalized && !this._allowCachedDigest) {
                throw createCryptoError('ERR_CRYPTO_HASH_FINALIZED', 'Digest already called');
              }
              var resultBuffer = this._finishDigest();
              this._allowCachedDigest = false;
              return encodeCryptoResult(resultBuffer, encoding);
            };
            SandboxHash.prototype.copy = function copy() {
              if (this._finalized) {
                throw createCryptoError('ERR_CRYPTO_HASH_FINALIZED', 'Digest already called');
              }
              var c = new SandboxHash(this._algorithm);
              c._chunks = this._chunks.slice();
              return c;
            };
            SandboxHash.prototype._transform = function _transform(chunk, encoding, callback) {
              try {
                this.update(chunk, encoding === 'buffer' ? undefined : encoding);
                callback();
              } catch (error) {
                callback(normalizeCryptoBridgeError(error));
              }
            };
            SandboxHash.prototype._flush = function _flush(callback) {
              try {
                var output = this._finishDigest();
                this._allowCachedDigest = true;
                this.push(output);
                callback();
              } catch (error) {
                callback(normalizeCryptoBridgeError(error));
              }
            };
            result.createHash = function createHash(algorithm, options) {
              return new SandboxHash(algorithm, options);
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

          if (typeof _cryptoRandomUUID !== 'undefined' && typeof result.randomUUID !== 'function') {
            result.randomUUID = function randomUUID(options) {
              if (options !== undefined) {
                if (options === null || typeof options !== 'object') {
                  throw createInvalidArgTypeError('options', 'of type object', options);
                }
                if (
                  Object.prototype.hasOwnProperty.call(options, 'disableEntropyCache') &&
                  typeof options.disableEntropyCache !== 'boolean'
                ) {
                  throw createInvalidArgTypeError(
                    'options.disableEntropyCache',
                    'of type boolean',
                    options.disableEntropyCache,
                  );
                }
              }
              var uuid = _cryptoRandomUUID.applySync(undefined, []);
              if (typeof uuid !== 'string') {
                throw new Error('invalid host uuid');
              }
              return uuid;
            };
          }

          // Overlay host-backed pbkdf2/pbkdf2Sync
          if (typeof _cryptoPbkdf2 !== 'undefined') {
            function createPbkdf2ArgTypeError(name, value) {
              var received;
              if (value == null) {
                received = ' Received ' + value;
              } else if (typeof value === 'object') {
                received = value.constructor && value.constructor.name ?
                  ' Received an instance of ' + value.constructor.name :
                  ' Received [object Object]';
              } else {
                var inspected = typeof value === 'string' ? "'" + value + "'" : String(value);
                received = ' Received type ' + typeof value + ' (' + inspected + ')';
              }
              var error = new TypeError('The "' + name + '" argument must be of type number.' + received);
              error.code = 'ERR_INVALID_ARG_TYPE';
              return error;
            }

            function validatePbkdf2Args(password, salt, iterations, keylen, digest) {
              var pwBuf = normalizeByteSource(password, 'password');
              var saltBuf = normalizeByteSource(salt, 'salt');
              if (typeof iterations !== 'number') {
                throw createPbkdf2ArgTypeError('iterations', iterations);
              }
              if (!Number.isInteger(iterations)) {
                throw createCryptoRangeError(
                  'iterations',
                  'The value of "iterations" is out of range. It must be an integer. Received ' + iterations,
                );
              }
              if (iterations < 1 || iterations > 2147483647) {
                throw createCryptoRangeError(
                  'iterations',
                  'The value of "iterations" is out of range. It must be >= 1 && <= 2147483647. Received ' + iterations,
                );
              }
              if (typeof keylen !== 'number') {
                throw createPbkdf2ArgTypeError('keylen', keylen);
              }
              if (!Number.isInteger(keylen)) {
                throw createCryptoRangeError(
                  'keylen',
                  'The value of "keylen" is out of range. It must be an integer. Received ' + keylen,
                );
              }
              if (keylen < 0 || keylen > 2147483647) {
                throw createCryptoRangeError(
                  'keylen',
                  'The value of "keylen" is out of range. It must be >= 0 && <= 2147483647. Received ' + keylen,
                );
              }
              if (typeof digest !== 'string') {
                throw createInvalidArgTypeError('digest', 'of type string', digest);
              }
              return {
                password: pwBuf,
                salt: saltBuf,
              };
            }

            result.pbkdf2Sync = function pbkdf2Sync(password, salt, iterations, keylen, digest) {
              var normalized = validatePbkdf2Args(password, salt, iterations, keylen, digest);
              try {
                var resultBase64 = _cryptoPbkdf2.applySync(undefined, [
                  normalized.password.toString('base64'),
                  normalized.salt.toString('base64'),
                  iterations,
                  keylen,
                  digest,
                ]);
                return Buffer.from(resultBase64, 'base64');
              } catch (error) {
                throw normalizeCryptoBridgeError(error);
              }
            };
            result.pbkdf2 = function pbkdf2(password, salt, iterations, keylen, digest, callback) {
              if (typeof digest === 'function' && callback === undefined) {
                callback = digest;
                digest = undefined;
              }
              if (typeof callback !== 'function') {
                throw createInvalidArgTypeError('callback', 'of type function', callback);
              }
              try {
                var derived = result.pbkdf2Sync(password, salt, iterations, keylen, digest);
                scheduleCryptoCallback(callback, [null, derived]);
              } catch (e) {
                throw normalizeCryptoBridgeError(e);
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

            function SandboxCipher(algorithm, key, iv, options) {
              if (!(this instanceof SandboxCipher)) {
                return new SandboxCipher(algorithm, key, iv, options);
              }
              if (typeof algorithm !== 'string') {
                throw createInvalidArgTypeError('cipher', 'of type string', algorithm);
              }
              _Transform.call(this);
              this._algorithm = algorithm;
              this._key = normalizeByteSource(key, 'key');
              this._iv = normalizeByteSource(iv, 'iv', { allowNull: true });
              this._options = options || undefined;
              this._authTag = null;
              this._finalized = false;
              this._sessionCreated = false;
              this._sessionId = undefined;
              this._aad = null;
              this._aadOptions = undefined;
              this._autoPadding = undefined;
              this._chunks = [];
              this._bufferedMode = !_useSessionCipher || !!options;
              if (!this._bufferedMode) {
                this._ensureSession();
              } else if (!options) {
                _cryptoCipheriv.applySync(undefined, [
                  this._algorithm,
                  this._key.toString('base64'),
                  this._iv === null ? null : this._iv.toString('base64'),
                  '',
                  serializeCipherBridgeOptions({ validateOnly: true }),
                ]);
              }
            }
            _inherits(SandboxCipher, _Transform);
            SandboxCipher.prototype._ensureSession = function _ensureSession() {
              if (this._bufferedMode || this._sessionCreated) {
                return;
              }
              this._sessionCreated = true;
              this._sessionId = _cryptoCipherivCreate.applySync(undefined, [
                'cipher',
                this._algorithm,
                this._key.toString('base64'),
                this._iv === null ? null : this._iv.toString('base64'),
                serializeCipherBridgeOptions(this._getBridgeOptions()),
              ]);
            };
            SandboxCipher.prototype._getBridgeOptions = function _getBridgeOptions() {
              var options = {};
              if (this._options && this._options.authTagLength !== undefined) {
                options.authTagLength = this._options.authTagLength;
              }
              if (this._aad) {
                options.aad = this._aad;
              }
              if (this._aadOptions !== undefined) {
                options.aadOptions = this._aadOptions;
              }
              if (this._autoPadding !== undefined) {
                options.autoPadding = this._autoPadding;
              }
              return Object.keys(options).length === 0 ? null : options;
            };
            SandboxCipher.prototype.update = function update(data, inputEncoding, outputEncoding) {
              if (this._finalized) {
                throw new Error('Attempting to call update() after final()');
              }
              var buf;
              if (typeof data === 'string') {
                buf = Buffer.from(data, inputEncoding || 'utf8');
              } else {
                buf = normalizeByteSource(data, 'data');
              }
              if (!this._bufferedMode) {
                this._ensureSession();
                var resultBase64 = _cryptoCipherivUpdate.applySync(undefined, [this._sessionId, buf.toString('base64')]);
                var resultBuffer = Buffer.from(resultBase64, 'base64');
                return encodeCryptoResult(resultBuffer, outputEncoding);
              }
              this._chunks.push(buf);
              return encodeCryptoResult(Buffer.alloc(0), outputEncoding);
            };
            SandboxCipher.prototype.final = function final(outputEncoding) {
              if (this._finalized) throw new Error('Attempting to call final() after already finalized');
              this._finalized = true;
              var parsed;
              if (!this._bufferedMode) {
                this._ensureSession();
                var resultJson = _cryptoCipherivFinal.applySync(undefined, [this._sessionId]);
                parsed = JSON.parse(resultJson);
              } else {
                var combined = Buffer.concat(this._chunks);
                var resultJson2 = _cryptoCipheriv.applySync(undefined, [
                  this._algorithm,
                  this._key.toString('base64'),
                  this._iv === null ? null : this._iv.toString('base64'),
                  combined.toString('base64'),
                  serializeCipherBridgeOptions(this._getBridgeOptions()),
                ]);
                parsed = JSON.parse(resultJson2);
              }
              if (parsed.authTag) {
                this._authTag = Buffer.from(parsed.authTag, 'base64');
              }
              var resultBuffer = Buffer.from(parsed.data, 'base64');
              return encodeCryptoResult(resultBuffer, outputEncoding);
            };
            SandboxCipher.prototype.getAuthTag = function getAuthTag() {
              if (!this._finalized) throw new Error('Cannot call getAuthTag before final()');
              if (!this._authTag) throw new Error('Auth tag is not available');
              return this._authTag;
            };
            SandboxCipher.prototype.setAAD = function setAAD(aad, options) {
              this._bufferedMode = true;
              this._aad = normalizeByteSource(aad, 'buffer');
              this._aadOptions = options;
              return this;
            };
            SandboxCipher.prototype.setAutoPadding = function setAutoPadding(autoPadding) {
              this._bufferedMode = true;
              this._autoPadding = autoPadding !== false;
              return this;
            };
            SandboxCipher.prototype._transform = function _transform(chunk, encoding, callback) {
              try {
                var output = this.update(chunk, encoding === 'buffer' ? undefined : encoding);
                if (output.length) {
                  this.push(output);
                }
                callback();
              } catch (error) {
                callback(normalizeCryptoBridgeError(error));
              }
            };
            SandboxCipher.prototype._flush = function _flush(callback) {
              try {
                var output = this.final();
                if (output.length) {
                  this.push(output);
                }
                callback();
              } catch (error) {
                callback(normalizeCryptoBridgeError(error));
              }
            };
            result.createCipheriv = function createCipheriv(algorithm, key, iv, options) {
              return new SandboxCipher(algorithm, key, iv, options);
            };
            result.Cipheriv = SandboxCipher;
          }

          if (typeof _cryptoDecipheriv !== 'undefined') {
            function SandboxDecipher(algorithm, key, iv, options) {
              if (!(this instanceof SandboxDecipher)) {
                return new SandboxDecipher(algorithm, key, iv, options);
              }
              if (typeof algorithm !== 'string') {
                throw createInvalidArgTypeError('cipher', 'of type string', algorithm);
              }
              _Transform.call(this);
              this._algorithm = algorithm;
              this._key = normalizeByteSource(key, 'key');
              this._iv = normalizeByteSource(iv, 'iv', { allowNull: true });
              this._options = options || undefined;
              this._authTag = null;
              this._finalized = false;
              this._sessionCreated = false;
              this._aad = null;
              this._aadOptions = undefined;
              this._autoPadding = undefined;
              this._chunks = [];
              this._bufferedMode = !_useSessionCipher || !!options;
              if (!this._bufferedMode) {
                this._ensureSession();
              } else if (!options) {
                _cryptoDecipheriv.applySync(undefined, [
                  this._algorithm,
                  this._key.toString('base64'),
                  this._iv === null ? null : this._iv.toString('base64'),
                  '',
                  serializeCipherBridgeOptions({ validateOnly: true }),
                ]);
              }
            }
            _inherits(SandboxDecipher, _Transform);
            SandboxDecipher.prototype._ensureSession = function _ensureSession() {
              if (!this._bufferedMode && !this._sessionCreated) {
                this._sessionCreated = true;
                this._sessionId = _cryptoCipherivCreate.applySync(undefined, [
                  'decipher', this._algorithm,
                  this._key.toString('base64'),
                  this._iv === null ? null : this._iv.toString('base64'),
                  serializeCipherBridgeOptions(this._getBridgeOptions()),
                ]);
              }
            };
            SandboxDecipher.prototype._getBridgeOptions = function _getBridgeOptions() {
              var options = {};
              if (this._options && this._options.authTagLength !== undefined) {
                options.authTagLength = this._options.authTagLength;
              }
              if (this._authTag) {
                options.authTag = this._authTag;
              }
              if (this._aad) {
                options.aad = this._aad;
              }
              if (this._aadOptions !== undefined) {
                options.aadOptions = this._aadOptions;
              }
              if (this._autoPadding !== undefined) {
                options.autoPadding = this._autoPadding;
              }
              return Object.keys(options).length === 0 ? null : options;
            };
            SandboxDecipher.prototype.update = function update(data, inputEncoding, outputEncoding) {
              if (this._finalized) {
                throw new Error('Attempting to call update() after final()');
              }
              var buf;
              if (typeof data === 'string') {
                buf = Buffer.from(data, inputEncoding || 'utf8');
              } else {
                buf = normalizeByteSource(data, 'data');
              }
              if (!this._bufferedMode) {
                this._ensureSession();
                var resultBase64 = _cryptoCipherivUpdate.applySync(undefined, [this._sessionId, buf.toString('base64')]);
                var resultBuffer = Buffer.from(resultBase64, 'base64');
                return encodeCryptoResult(resultBuffer, outputEncoding);
              }
              this._chunks.push(buf);
              return encodeCryptoResult(Buffer.alloc(0), outputEncoding);
            };
            SandboxDecipher.prototype.final = function final(outputEncoding) {
              if (this._finalized) throw new Error('Attempting to call final() after already finalized');
              this._finalized = true;
              var resultBuffer;
              if (!this._bufferedMode) {
                this._ensureSession();
                var resultJson = _cryptoCipherivFinal.applySync(undefined, [this._sessionId]);
                var parsed = JSON.parse(resultJson);
                resultBuffer = Buffer.from(parsed.data, 'base64');
              } else {
                var combined = Buffer.concat(this._chunks);
                var options = {};
                var resultBase64 = _cryptoDecipheriv.applySync(undefined, [
                  this._algorithm,
                  this._key.toString('base64'),
                  this._iv === null ? null : this._iv.toString('base64'),
                  combined.toString('base64'),
                  serializeCipherBridgeOptions(this._getBridgeOptions()),
                ]);
                resultBuffer = Buffer.from(resultBase64, 'base64');
              }
              return encodeCryptoResult(resultBuffer, outputEncoding);
            };
            SandboxDecipher.prototype.setAuthTag = function setAuthTag(tag) {
              this._bufferedMode = true;
              this._authTag = typeof tag === 'string' ? Buffer.from(tag, 'base64') : normalizeByteSource(tag, 'buffer');
              return this;
            };
            SandboxDecipher.prototype.setAAD = function setAAD(aad, options) {
              this._bufferedMode = true;
              this._aad = normalizeByteSource(aad, 'buffer');
              this._aadOptions = options;
              return this;
            };
            SandboxDecipher.prototype.setAutoPadding = function setAutoPadding(autoPadding) {
              this._bufferedMode = true;
              this._autoPadding = autoPadding !== false;
              return this;
            };
            SandboxDecipher.prototype._transform = function _transform(chunk, encoding, callback) {
              try {
                var output = this.update(chunk, encoding === 'buffer' ? undefined : encoding);
                if (output.length) {
                  this.push(output);
                }
                callback();
              } catch (error) {
                callback(normalizeCryptoBridgeError(error));
              }
            };
            SandboxDecipher.prototype._flush = function _flush(callback) {
              try {
                var output = this.final();
                if (output.length) {
                  this.push(output);
                }
                callback();
              } catch (error) {
                callback(normalizeCryptoBridgeError(error));
              }
            };
            result.createDecipheriv = function createDecipheriv(algorithm, key, iv, options) {
              return new SandboxDecipher(algorithm, key, iv, options);
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
              if (value == null) {
                received = ' Received ' + value;
              } else if (typeof value === 'function') {
                received = ' Received function ' + (value.name || 'anonymous');
              } else if (typeof value === 'object') {
                if (value.constructor && value.constructor.name) {
                  received = ' Received an instance of ' + value.constructor.name;
                } else {
                  received = ' Received [object Object]';
                }
              } else {
                var inspected = typeof value === 'string' ? "'" + value + "'" : String(value);
                if (inspected.length > 28) {
                  inspected = inspected.slice(0, 25) + '...';
                }
                received = ' Received type ' + typeof value + ' (' + inspected + ')';
              }
              var error = new TypeError('The "' + name + '" argument must be ' + expected + '.' + received);
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
          if (typeof result.getFips !== 'function') {
            result.getFips = function getFips() {
              return 0;
            };
          }
          if (typeof result.setFips !== 'function') {
            result.setFips = function setFips() {
              throw new Error('FIPS mode is not supported in sandbox');
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
          var getWebStreamsState = function() {
            return globalThis.__secureExecWebStreams || null;
          };
          var webStreamsState = getWebStreamsState();
          if (typeof result.isReadable !== 'function') {
            result.isReadable = function(stream) {
              var stateKey = getWebStreamsState() && getWebStreamsState().kState;
              return Boolean(stateKey && stream && stream[stateKey] && stream[stateKey].state === 'readable');
            };
          }
          if (typeof result.isErrored !== 'function') {
            result.isErrored = function(stream) {
              var stateKey = getWebStreamsState() && getWebStreamsState().kState;
              return Boolean(stateKey && stream && stream[stateKey] && stream[stateKey].state === 'errored');
            };
          }
          if (typeof result.isDisturbed !== 'function') {
            result.isDisturbed = function(stream) {
              var stateKey = getWebStreamsState() && getWebStreamsState().kState;
              return Boolean(stateKey && stream && stream[stateKey] && stream[stateKey].disturbed === true);
            };
          }
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
          if (
            typeof result.Readable === 'function' &&
            !Object.getOwnPropertyDescriptor(result.Readable.prototype, 'readableObjectMode')
          ) {
            Object.defineProperty(result.Readable.prototype, 'readableObjectMode', {
              configurable: true,
              enumerable: false,
              get: function() {
                return Boolean(this && this._readableState && this._readableState.objectMode);
              },
            });
          }
          if (
            typeof result.Writable === 'function' &&
            !Object.getOwnPropertyDescriptor(result.Writable.prototype, 'writableObjectMode')
          ) {
            Object.defineProperty(result.Writable.prototype, 'writableObjectMode', {
              configurable: true,
              enumerable: false,
              get: function() {
                return Boolean(this && this._writableState && this._writableState.objectMode);
              },
            });
          }
          if (
            webStreamsState &&
            typeof result.Readable === 'function'
          ) {
            if (
              typeof result.Readable.fromWeb !== 'function' &&
              typeof webStreamsState.newStreamReadableFromReadableStream === 'function'
            ) {
              result.Readable.fromWeb = function fromWeb(readableStream, options) {
                return webStreamsState.newStreamReadableFromReadableStream(readableStream, options);
              };
            }
            if (
              typeof result.Readable.toWeb !== 'function' &&
              typeof webStreamsState.newReadableStreamFromStreamReadable === 'function'
            ) {
              result.Readable.toWeb = function toWeb(readable) {
                return webStreamsState.newReadableStreamFromStreamReadable(readable);
              };
            }
          }
          if (
            webStreamsState &&
            typeof result.Writable === 'function'
          ) {
            if (
              typeof result.Writable.fromWeb !== 'function' &&
              typeof webStreamsState.newStreamWritableFromWritableStream === 'function'
            ) {
              result.Writable.fromWeb = function fromWeb(writableStream, options) {
                return webStreamsState.newStreamWritableFromWritableStream(writableStream, options);
              };
            }
            if (
              typeof result.Writable.toWeb !== 'function' &&
              typeof webStreamsState.newWritableStreamFromStreamWritable === 'function'
            ) {
              result.Writable.toWeb = function toWeb(writable) {
                return webStreamsState.newWritableStreamFromStreamWritable(writable);
              };
            }
          }
          if (
            webStreamsState &&
            typeof result.Duplex === 'function'
          ) {
            if (
              typeof result.Duplex.fromWeb !== 'function' &&
              typeof webStreamsState.newStreamDuplexFromReadableWritablePair === 'function'
            ) {
              result.Duplex.fromWeb = function fromWeb(pair, options) {
                return webStreamsState.newStreamDuplexFromReadableWritablePair(pair, options);
              };
            }
            if (
              typeof result.Duplex.toWeb !== 'function' &&
              typeof webStreamsState.newReadableWritablePairFromDuplex === 'function'
            ) {
              result.Duplex.toWeb = function toWeb(duplex) {
                return webStreamsState.newReadableWritablePairFromDuplex(duplex);
              };
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
        const workerThreadsCompat = {
          markAsUncloneable: function markAsUncloneable(value) {
            return value;
          },
          markAsUntransferable: function markAsUntransferable(value) {
            return value;
          },
          isMarkedAsUntransferable: function isMarkedAsUntransferable() {
            return false;
          },
          MessagePort: globalThis.MessagePort,
          MessageChannel: globalThis.MessageChannel,
          MessageEvent: globalThis.MessageEvent,
        };
        const moduleCompat = {
          worker_threads: workerThreadsCompat,
          'node:worker_threads': workerThreadsCompat,
        };
        let stub = null;
        stub = new Proxy({}, {
          get(_target, prop) {
            if (prop === '__esModule') return false;
            if (prop === 'default') return stub;
            if (prop === Symbol.toStringTag) return 'Module';
            if (prop === 'then') return undefined;
            if (typeof prop !== 'string') return undefined;
            if (
              moduleCompat[moduleName] &&
              Object.prototype.hasOwnProperty.call(moduleCompat[moduleName], prop)
            ) {
              return moduleCompat[moduleName][prop];
            }
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

        if (name === 'stream/consumers') {
          if (__internalModuleCache['stream/consumers']) return __internalModuleCache['stream/consumers'];
          const consumersModule = {};
          consumersModule.buffer = async function buffer(stream) {
            const chunks = [];
            const pushChunk = function(chunk) {
              if (typeof chunk === 'string') {
                chunks.push(Buffer.from(chunk));
              } else if (Buffer.isBuffer(chunk)) {
                chunks.push(chunk);
              } else if (ArrayBuffer.isView(chunk)) {
                chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
              } else if (chunk instanceof ArrayBuffer) {
                chunks.push(Buffer.from(new Uint8Array(chunk)));
              } else {
                chunks.push(Buffer.from(String(chunk)));
              }
            };
            if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
              for await (const chunk of stream) {
                pushChunk(chunk);
              }
              return Buffer.concat(chunks);
            }
            return new Promise(function(resolve, reject) {
              stream.on('data', pushChunk);
              stream.on('end', function() {
                resolve(Buffer.concat(chunks));
              });
              stream.on('error', reject);
            });
          };
          consumersModule.text = async function text(stream) {
            return (await consumersModule.buffer(stream)).toString('utf8');
          };
          consumersModule.json = async function json(stream) {
            return JSON.parse(await consumersModule.text(stream));
          };
          consumersModule.arrayBuffer = async function arrayBuffer(stream) {
            const buffer = await consumersModule.buffer(stream);
            return buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            );
          };
          __internalModuleCache['stream/consumers'] = consumersModule;
          _debugRequire('loaded', name, 'stream-consumers-special');
          return consumersModule;
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

        if (name === '_http_agent') {
          if (__internalModuleCache['_http_agent']) return __internalModuleCache['_http_agent'];
          const httpAgentModule = {
            Agent: _httpModule.Agent,
            globalAgent: _httpModule.globalAgent,
          };
          __internalModuleCache['_http_agent'] = httpAgentModule;
          _debugRequire('loaded', name, 'http-agent-special');
          return httpAgentModule;
        }

        if (name === '_http_common') {
          if (__internalModuleCache['_http_common']) return __internalModuleCache['_http_common'];
          const httpCommonModule = {
            _checkIsHttpToken: _httpModule._checkIsHttpToken,
            _checkInvalidHeaderChar: _httpModule._checkInvalidHeaderChar,
          };
          __internalModuleCache['_http_common'] = httpCommonModule;
          _debugRequire('loaded', name, 'http-common-special');
          return httpCommonModule;
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

        if (name === 'internal/http2/util') {
          if (__internalModuleCache[name]) return __internalModuleCache[name];
          const sharedNghttpError = _http2Module?.NghttpError;
          const NghttpError = typeof sharedNghttpError === 'function'
            ? sharedNghttpError
            : class NghttpError extends Error {
                constructor(message) {
                  super(message);
                  this.name = 'Error';
                  this.code = 'ERR_HTTP2_ERROR';
                }
              };
          const utilModule = {
            kSocket: Symbol.for('secure-exec.http2.kSocket'),
            NghttpError,
          };
          __internalModuleCache[name] = utilModule;
          _debugRequire('loaded', name, 'http2-util-special');
          return utilModule;
        }

        // Special handling for dns module
        if (name === 'dns') {
          if (__internalModuleCache['dns']) return __internalModuleCache['dns'];
          __internalModuleCache['dns'] = _dnsModule;
          _debugRequire('loaded', name, 'dns-special');
          return _dnsModule;
        }

        // Special handling for dgram module
        if (name === 'dgram') {
          if (__internalModuleCache['dgram']) return __internalModuleCache['dgram'];
          __internalModuleCache['dgram'] = _dgramModule;
          _debugRequire('loaded', name, 'dgram-special');
          return _dgramModule;
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

        // Special handling for v8. Some CommonJS dependencies require it
        // before the mutable module cache has been copied into the local cache.
        if (name === 'v8') {
          if (__internalModuleCache['v8']) return __internalModuleCache['v8'];
          const v8Module = globalThis._moduleCache?.v8 || {};
          __internalModuleCache['v8'] = v8Module;
          _debugRequire('loaded', name, 'v8-special');
          return v8Module;
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

          let result = Function('"use strict"; return (' + polyfillCode + ');')();
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
          const isRequireTransformedEsm =
            typeof source === 'string' &&
            source.startsWith(REQUIRE_TRANSFORM_MARKER);
          const wrapperPrologue = isRequireTransformedEsm
            ? ''
            : "var __filename = __secureExecFilename;\n" +
              "var __dirname = __secureExecDirname;\n";
          try {
	            wrapper = new Function(
	              'exports',
	              'require',
	              'module',
	              '__secureExecFilename',
	              '__secureExecDirname',
	              '__dynamicImport',
	              wrapperPrologue + source + '\n//# sourceURL=' + resolved
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
