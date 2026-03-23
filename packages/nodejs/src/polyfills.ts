import * as esbuild from "esbuild";
import stdLibBrowser from "node-stdlib-browser";

// Cache bundled polyfills
const polyfillCache: Map<string, string> = new Map();

// Shared error code helpers injected into post-patches (matches Node.js internal/errors.js format)
const ERR_HELPERS = `
function _descT(v){if(v===null)return'null';if(v===undefined)return'undefined';if(typeof v==='function')return'function '+(v.name||'');if(Array.isArray(v))return'an instance of Array';if(typeof v==='object'){var n=v&&v.constructor&&v.constructor.name;return n&&n!=='Object'?'an instance of '+n:'an instance of Object'}if(typeof v==='boolean')return'type boolean ('+v+')';if(typeof v==='number')return'type number ('+v+')';if(typeof v==='string')return"type string ('"+(v.length>28?v.slice(0,25)+'...':v)+"')";if(typeof v==='symbol')return'type symbol ('+String(v)+')';if(typeof v==='bigint')return'type bigint ('+v+'n)';return'type '+typeof v}
function _typeErr(code,msg){var e=new TypeError(msg);e.code=code;return e}
function _rangeErr(code,msg){var e=new RangeError(msg);e.code=code;return e}
function _addCode(e){if(e.code)return;if(e instanceof RangeError)e.code='ERR_OUT_OF_RANGE';else if(e instanceof TypeError){e.code=((e.message||'').indexOf('Unknown encoding')!==-1)?'ERR_UNKNOWN_ENCODING':'ERR_INVALID_ARG_TYPE'}}
function _wrapM(obj,methods){methods.forEach(function(m){var o=obj[m];if(!o)return;obj[m]=function(){try{return o.apply(this,arguments)}catch(e){_addCode(e);throw e}}})}
`;

// node-stdlib-browser provides the mapping from Node.js stdlib to polyfill paths
// e.g., { path: "/path/to/path-browserify/index.js", fs: null, ... }
// We use this mapping instead of maintaining our own

/**
 * Bundle a stdlib polyfill module using esbuild
 */
export async function bundlePolyfill(moduleName: string): Promise<string> {
	const cached = polyfillCache.get(moduleName);
	if (cached) return cached;

	// Get the polyfill entry point from node-stdlib-browser
	const entryPoint = stdLibBrowser[moduleName as keyof typeof stdLibBrowser];
	if (!entryPoint) {
		throw new Error(`No polyfill available for module: ${moduleName}`);
	}

	// Build alias mappings for all Node.js builtins
	// This ensures nested dependencies (like crypto -> stream) are resolved correctly
	const alias: Record<string, string> = {};
	for (const [name, path] of Object.entries(stdLibBrowser)) {
		if (path !== null) {
			alias[name] = path;
			alias[`node:${name}`] = path;
		}
	}

	// Bundle using esbuild with CommonJS format
	// This ensures proper module.exports handling for all module types including JSON
	const result = await esbuild.build({
		entryPoints: [entryPoint],
		bundle: true,
		write: false,
		format: "cjs",
		platform: "browser",
		target: "es2020",
		minify: false,
		alias,
		define: {
			"process.env.NODE_ENV": '"production"',
			global: "globalThis",
		},
		// Externalize 'process' - we provide our own process polyfill in the bridge.
		// Without this, node-stdlib-browser's process polyfill gets bundled and
		// overwrites globalThis.process, breaking process.argv modifications.
		external: ["process"],
	});

	const code = result.outputFiles[0].text;

	// Check if this is a JSON module (esbuild creates *_default but doesn't export it)
	// For JSON modules, look for the default export pattern and extract it
	const defaultExportMatch = code.match(/var\s+(\w+_default)\s*=\s*\{/);

	let wrappedCode: string;
	if (defaultExportMatch && !code.includes("module.exports")) {
		// JSON module: wrap and return the default export object
		const defaultVar = defaultExportMatch[1];
		wrappedCode = `(function() {
    ${code}
    return ${defaultVar};
  })()`;
	} else {
		// Regular CommonJS module: wrap and return module.exports
		let postPatch = "";

		// Patch util polyfill: fix deprecate(), add ERR_* codes to inherits/deprecate
		if (moduleName === "util") {
			postPatch = ERR_HELPERS + `
    var _util = module.exports;
    if (_util && _util.deprecate) {
      var _codesSeen = {};
      _util.deprecate = function deprecate(fn, msg, code) {
        if (typeof fn !== 'function') {
          throw _typeErr('ERR_INVALID_ARG_TYPE', 'The "fn" argument must be of type Function. Received ' + _descT(fn));
        }
        if (code !== undefined && typeof code !== 'string') {
          throw _typeErr('ERR_INVALID_ARG_TYPE', 'The "code" argument must be of type string. Received ' + _descT(code));
        }
        if (typeof process !== 'undefined' && process.noDeprecation === true) return fn;
        var warned = false;
        function deprecated() {
          if (!warned) {
            warned = true;
            if (code && _codesSeen[code]) { return fn.apply(this, arguments); }
            if (code) _codesSeen[code] = true;
            if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
              process.emitWarning(msg, 'DeprecationWarning', code);
            }
          }
          return fn.apply(this, arguments);
        }
        return deprecated;
      };
    }
    var _origInherits = _util.inherits;
    if (_origInherits) {
      _util.inherits = function inherits(ctor, superCtor) {
        if (typeof ctor !== 'function') {
          throw _typeErr('ERR_INVALID_ARG_TYPE', 'The "ctor" argument must be of type Function. Received ' + _descT(ctor));
        }
        if (typeof superCtor !== 'function') {
          throw _typeErr('ERR_INVALID_ARG_TYPE', 'The "superCtor" argument must be of type Function. Received ' + _descT(superCtor));
        }
        if (superCtor.prototype === undefined || superCtor.prototype === null) {
          throw _typeErr('ERR_INVALID_ARG_TYPE', 'The "superCtor.prototype" property must be of type Object. Received ' + _descT(superCtor.prototype));
        }
        return _origInherits.call(_util, ctor, superCtor);
      };
    }`;
		}

		// Patch events polyfill: redirect max-listener warnings through process.emitWarning(),
		// add listenerCount filter + ERR_* error codes
		if (moduleName === "events") {
			postPatch = ERR_HELPERS + `
    // Redirect MaxListenersExceededWarning from console.warn to process.emitWarning()
    // The polyfill's ProcessEmitWarning calls console.warn(), but Node.js uses
    // process.emitWarning() so that process.on('warning') listeners fire.
    // Also fix the warning message format to match Node.js:
    //   polyfill: "N TYPE listeners added."
    //   Node.js:  "N TYPE listeners added to [ClassName]. MaxListeners is M."
    ProcessEmitWarning = function(warning) {
      if (warning && warning.name === 'MaxListenersExceededWarning' && warning.emitter) {
        var ctorName = (warning.emitter.constructor && warning.emitter.constructor.name) || 'EventEmitter';
        var maxL = typeof warning.emitter.getMaxListeners === 'function' ? warning.emitter.getMaxListeners() : 0;
        warning.message = 'Possible EventEmitter memory leak detected. ' +
          warning.count + ' ' + String(warning.type) + ' listeners added to [' + ctorName + ']. ' +
          'MaxListeners is ' + maxL + '. Use emitter.setMaxListeners() to increase limit';
      }
      if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
        process.emitWarning(warning);
      } else if (console && console.warn) {
        console.warn(warning);
      }
    };

    var _EE = module.exports;
    if (_EE && _EE.prototype && _EE.prototype.listenerCount) {
      var _origLC = _EE.prototype.listenerCount;
      _EE.prototype.listenerCount = function listenerCount(type, listener) {
        if (!listener) return _origLC.call(this, type);
        var evs = this._events;
        if (!evs) return 0;
        var el = evs[type];
        if (!el) return 0;
        if (typeof el === 'function') {
          return (el === listener || (el.listener && el.listener === listener)) ? 1 : 0;
        }
        var c = 0;
        for (var i = 0; i < el.length; i++) {
          if (el[i] === listener || (el[i].listener && el[i].listener === listener)) c++;
        }
        return c;
      };
    }

    // Wrap setMaxListeners to add ERR_OUT_OF_RANGE code
    if (_EE && _EE.prototype && _EE.prototype.setMaxListeners) {
      var _origSML = _EE.prototype.setMaxListeners;
      _EE.prototype.setMaxListeners = function setMaxListeners(n) {
        try { return _origSML.apply(this, arguments); }
        catch(e) {
          if (!e.code) {
            if (e instanceof RangeError) e.code = 'ERR_OUT_OF_RANGE';
            else if (e instanceof TypeError) e.code = 'ERR_INVALID_ARG_TYPE';
          }
          throw e;
        }
      };
    }

    // Wrap EventEmitter.on/addListener to add ERR_INVALID_ARG_TYPE for non-function listeners
    // The polyfill sets addListener = on (same reference). Node.js test checks E.on === E.addListener.
    // We must preserve this identity by wrapping the underlying function and assigning it to both.
    if (_EE && _EE.prototype && _EE.prototype.on) {
      var _origOn = _EE.prototype.on;
      var _patchedOn = function addListener(type, listener) {
        try { return _origOn.apply(this, arguments); }
        catch(e) { if (!e.code && e instanceof TypeError) e.code = 'ERR_INVALID_ARG_TYPE'; throw e; }
      };
      _EE.prototype.on = _patchedOn;
      _EE.prototype.addListener = _patchedOn;
    }`;
		}

		// Patch stream polyfill: add ERR_* error codes to match Node.js
		if (moduleName === "stream") {
			postPatch = ERR_HELPERS + `
    var _S = module.exports;

    // Stream-specific error code detection
    function _addStreamCode(e) {
      if (e.code) return;
      var m = e.message || '';
      if (m === 'May not write null values to stream') { e.code = 'ERR_STREAM_NULL_VALUES'; return; }
      if (m === 'write after end') { e.code = 'ERR_STREAM_WRITE_AFTER_END'; return; }
      if (m.indexOf('Unknown encoding') !== -1) { e.code = 'ERR_UNKNOWN_ENCODING'; return; }
      if (m.indexOf('is invalid for option') !== -1) { e.code = 'ERR_INVALID_ARG_VALUE'; return; }
      if (m.indexOf('ERR_STREAM_PUSH_AFTER_EOF') !== -1) { e.code = 'ERR_STREAM_PUSH_AFTER_EOF'; return; }
      if (m.indexOf('ERR_STREAM_DESTROYED') !== -1) { e.code = 'ERR_STREAM_DESTROYED'; return; }
      if (m.indexOf('ERR_STREAM_PREMATURE_CLOSE') !== -1) { e.code = 'ERR_STREAM_PREMATURE_CLOSE'; return; }
      if (m.indexOf('ERR_METHOD_NOT_IMPLEMENTED') !== -1) { e.code = 'ERR_METHOD_NOT_IMPLEMENTED'; return; }
      if (m.indexOf('ERR_MISSING_ARGS') !== -1) { e.code = 'ERR_MISSING_ARGS'; return; }
      if (m.indexOf('ERR_INVALID_RETURN_VALUE') !== -1) { e.code = 'ERR_INVALID_RETURN_VALUE'; return; }
      _addCode(e);
    }

    // Pre-validation for Writable.prototype.write — Node.js throws synchronously
    // regardless of error listeners, but the polyfill emits errors via 'error' event
    if (_S.Writable && _S.Writable.prototype.write) {
      var _origWrite = _S.Writable.prototype.write;
      _S.Writable.prototype.write = function write(chunk, encoding, cb) {
        // Pre-validate: null is always invalid (even in objectMode)
        if (chunk === null) {
          throw _typeErr('ERR_STREAM_NULL_VALUES', 'May not write null values to stream');
        }
        // Pre-validate: non-objectMode requires string/Buffer/Uint8Array
        var state = this._writableState;
        if (state && !state.objectMode) {
          if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) {
            throw _typeErr('ERR_INVALID_ARG_TYPE',
              'The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received ' + _descT(chunk));
          }
        }
        try { return _origWrite.apply(this, arguments); }
        catch(e) { _addStreamCode(e); throw e; }
      };
    }

    // Wrap Writable.prototype.end to add error codes
    if (_S.Writable && _S.Writable.prototype.end) {
      var _origEnd = _S.Writable.prototype.end;
      _S.Writable.prototype.end = function end(chunk, encoding, cb) {
        try { return _origEnd.apply(this, arguments); }
        catch(e) { _addStreamCode(e); throw e; }
      };
    }

    // Patch emit on stream classes to add error codes to 'error' events
    // The polyfill emits errors (e.g., invalid chunk type on push(), write-after-end)
    // without .code — intercept and add the appropriate code before listeners see it
    function _patchEmit(proto) {
      if (!proto || !proto.emit) return;
      var _orig = proto.emit;
      proto.emit = function emit(ev) {
        if (ev === 'error' && arguments[1] instanceof Error) {
          _addStreamCode(arguments[1]);
        }
        return _orig.apply(this, arguments);
      };
    }
    // Writable and Readable inherit from EventEmitter, not Stream — patch them directly
    if (_S.Writable) _patchEmit(_S.Writable.prototype);
    if (_S.Readable) _patchEmit(_S.Readable.prototype);
    if (_S.Duplex) _patchEmit(_S.Duplex.prototype);
    if (_S.Transform) _patchEmit(_S.Transform.prototype);
    if (_S.Stream) _patchEmit(_S.Stream.prototype);

    // Add readableEnded property to Readable.prototype (Node.js 12.9+)
    // readable-stream v3 uses _readableState.endEmitted but lacks the public getter
    if (_S.Readable && !Object.hasOwn(_S.Readable.prototype, 'readableEnded')) {
      Object.defineProperty(_S.Readable.prototype, 'readableEnded', {
        get: function() {
          return !!(this._readableState && this._readableState.endEmitted);
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add errored property to Readable.prototype (Node.js 18+)
    if (_S.Readable && !Object.hasOwn(_S.Readable.prototype, 'errored')) {
      Object.defineProperty(_S.Readable.prototype, 'errored', {
        get: function() {
          return this._readableState ? (this._readableState.errored || null) : null;
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add readableAborted property to Readable.prototype (Node.js 16.17+)
    if (_S.Readable && !Object.hasOwn(_S.Readable.prototype, 'readableAborted')) {
      Object.defineProperty(_S.Readable.prototype, 'readableAborted', {
        get: function() {
          var s = this._readableState;
          if (!s) return false;
          return !!(s.destroyed || s.errored) && !s.endEmitted;
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add writableFinished property to Writable.prototype (Node.js 12.6+)
    // readable-stream v3 uses _writableState.finished but lacks the public getter
    if (_S.Writable && !Object.hasOwn(_S.Writable.prototype, 'writableFinished')) {
      Object.defineProperty(_S.Writable.prototype, 'writableFinished', {
        get: function() {
          return !!(this._writableState && this._writableState.finished);
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add writableEnded property to Writable.prototype (Node.js 12.9+)
    if (_S.Writable && !Object.hasOwn(_S.Writable.prototype, 'writableEnded')) {
      Object.defineProperty(_S.Writable.prototype, 'writableEnded', {
        get: function() {
          return !!(this._writableState && this._writableState.ending);
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add errored property to Writable.prototype (Node.js 18+)
    if (_S.Writable && !Object.hasOwn(_S.Writable.prototype, 'errored')) {
      Object.defineProperty(_S.Writable.prototype, 'errored', {
        get: function() {
          return this._writableState ? (this._writableState.errored || null) : null;
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add writableAborted property to Writable.prototype (Node.js 18.0+)
    if (_S.Writable && !Object.hasOwn(_S.Writable.prototype, 'writableAborted')) {
      Object.defineProperty(_S.Writable.prototype, 'writableAborted', {
        get: function() {
          var s = this._writableState;
          if (!s) return false;
          return !!(s.destroyed || s.errored) && !s.finished;
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add readableDidRead property to Readable.prototype (Node.js 16.7+)
    if (_S.Readable && !Object.hasOwn(_S.Readable.prototype, 'readableDidRead')) {
      Object.defineProperty(_S.Readable.prototype, 'readableDidRead', {
        get: function() {
          return !!(this._readableState && this._readableState.dataEmitted);
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add writableCorked property to Writable.prototype (Node.js 13.2+)
    if (_S.Writable && !Object.hasOwn(_S.Writable.prototype, 'writableCorked')) {
      Object.defineProperty(_S.Writable.prototype, 'writableCorked', {
        get: function() {
          return this._writableState ? (this._writableState.corked || 0) : 0;
        },
        enumerable: false,
        configurable: true
      });
    }

    // Add writableNeedDrain property to Writable.prototype (Node.js 15.2+)
    if (_S.Writable && !Object.hasOwn(_S.Writable.prototype, 'writableNeedDrain')) {
      Object.defineProperty(_S.Writable.prototype, 'writableNeedDrain', {
        get: function() {
          var s = this._writableState;
          if (!s) return false;
          return !s.destroyed && !s.ending && s.needDrain;
        },
        enumerable: false,
        configurable: true
      });
    }

    // Copy Writable properties to Duplex.prototype so Object.hasOwn checks work
    // Duplex inherits from Readable but also needs Writable properties as own
    if (_S.Duplex) {
      var _writableProps = ['writableFinished', 'writableEnded', 'writableCorked',
        'writableNeedDrain', 'writableAborted', 'writableLength', 'writableHighWaterMark'];
      for (var _i = 0; _i < _writableProps.length; _i++) {
        var _prop = _writableProps[_i];
        var _desc = Object.getOwnPropertyDescriptor(_S.Writable.prototype, _prop);
        if (_desc && !Object.hasOwn(_S.Duplex.prototype, _prop)) {
          Object.defineProperty(_S.Duplex.prototype, _prop, _desc);
        }
      }
      // Also copy errored from Writable to Duplex if Readable didn't define it
      if (!Object.hasOwn(_S.Duplex.prototype, 'errored')) {
        var _erDesc = Object.getOwnPropertyDescriptor(_S.Writable.prototype, 'errored');
        if (_erDesc) Object.defineProperty(_S.Duplex.prototype, 'errored', _erDesc);
      }
    }

    // Track errored state in _readableState/_writableState for errored property
    // Patch destroy to store the error in state and set writable=false
    if (_S.Readable && _S.Readable.prototype.destroy) {
      var _origReadableDestroy = _S.Readable.prototype.destroy;
      _S.Readable.prototype.destroy = function destroy(err, cb) {
        if (err && this._readableState) {
          this._readableState.errored = err;
        }
        return _origReadableDestroy.call(this, err, cb);
      };
    }

    if (_S.Writable && _S.Writable.prototype.destroy) {
      var _origWritableDestroy = _S.Writable.prototype.destroy;
      _S.Writable.prototype.destroy = function destroy(err, cb) {
        if (err && this._writableState) {
          this._writableState.errored = err;
        }
        return _origWritableDestroy.call(this, err, cb);
      };
    }

    // Wrap stream.finished to add error codes on arg validation
    if (typeof _S.finished === 'function') {
      var _origFinished = _S.finished;
      _S.finished = function finished(stream, opts, cb) {
        try { return _origFinished.apply(_S, arguments); }
        catch(e) { _addStreamCode(e); throw e; }
      };
    }

    // Wrap stream.pipeline to add error codes on arg validation
    if (typeof _S.pipeline === 'function') {
      var _origPipeline = _S.pipeline;
      _S.pipeline = function pipeline() {
        try { return _origPipeline.apply(_S, arguments); }
        catch(e) { _addStreamCode(e); throw e; }
      };
    }

`;

		}

		// Patch buffer polyfill: add ERR_* error codes to match Node.js
		if (moduleName === "buffer") {
			postPatch = ERR_HELPERS + `
    var _B = module.exports.Buffer;

    // Wrap prototype methods with catch-and-code
    _wrapM(_B.prototype, [
      'readInt8','readUInt8','readInt16LE','readInt16BE','readUInt16LE','readUInt16BE',
      'readInt32LE','readInt32BE','readUInt32LE','readUInt32BE',
      'readFloatLE','readFloatBE','readDoubleLE','readDoubleBE',
      'readBigInt64LE','readBigInt64BE','readBigUInt64LE','readBigUInt64BE',
      'readIntLE','readIntBE','readUIntLE','readUIntBE',
      'writeInt8','writeUInt8','writeInt16LE','writeInt16BE','writeUInt16LE','writeUInt16BE',
      'writeInt32LE','writeInt32BE','writeUInt32LE','writeUInt32BE',
      'writeFloatLE','writeFloatBE','writeDoubleLE','writeDoubleBE',
      'writeBigInt64LE','writeBigInt64BE','writeBigUInt64LE','writeBigUInt64BE',
      'writeIntLE','writeIntBE','writeUIntLE','writeUIntBE',
      'fill','copy','indexOf','lastIndexOf','includes','equals',
      'swap16','swap32','swap64','write','toString','slice','subarray'
    ]);

    // Wrap simple static methods with catch-and-code
    _wrapM(_B, ['from','byteLength','isEncoding']);

    // Pre-validation for alloc/allocUnsafe/allocUnsafeSlow — polyfill misses NaN
    var _kMax = _B.kMaxLength || 0x7fffffff;
    function _validateSize(size) {
      if (typeof size !== 'number') {
        throw _typeErr('ERR_INVALID_ARG_TYPE',
          'The "size" argument must be of type number. Received ' + _descT(size));
      }
      if (size < 0 || size !== size) {
        throw _rangeErr('ERR_OUT_OF_RANGE',
          'The value of "size" is out of range. It must be >= 0 && <= ' + _kMax + '. Received ' + size);
      }
    }
    ['alloc','allocUnsafe','allocUnsafeSlow'].forEach(function(m) {
      var o = _B[m]; if (!o) return;
      _B[m] = function(size) {
        _validateSize(size);
        try { return o.apply(_B, arguments); }
        catch(e) { _addCode(e); throw e; }
      };
    });

    // Pre-validation: Buffer.concat — tests check exact message format
    var _origConcat = _B.concat;
    _B.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw _typeErr('ERR_INVALID_ARG_TYPE',
          'The "list" argument must be an instance of Array. Received ' + _descT(list));
      }
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!(item instanceof _B) && !(item instanceof Uint8Array)) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "list[' + i + ']" argument must be an instance of Buffer or Uint8Array. Received ' + _descT(item));
        }
      }
      try { return _origConcat.call(_B, list, length); }
      catch(e) { _addCode(e); throw e; }
    };

    // Pre-validation: Buffer.compare (static)
    var _origSCmp = _B.compare;
    if (_origSCmp) {
      _B.compare = function compare(buf1, buf2) {
        if (!(buf1 instanceof _B) && !(buf1 instanceof Uint8Array)) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "buf1" argument must be an instance of Buffer or Uint8Array. Received ' + _descT(buf1));
        }
        if (!(buf2 instanceof _B) && !(buf2 instanceof Uint8Array)) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "buf2" argument must be an instance of Buffer or Uint8Array. Received ' + _descT(buf2));
        }
        try { return _origSCmp.call(_B, buf1, buf2); }
        catch(e) { _addCode(e); throw e; }
      };
    }

    // Pre-validation: buf.compare (prototype)
    var _origPCmp = _B.prototype.compare;
    if (_origPCmp) {
      _B.prototype.compare = function compare(target) {
        if (!(target instanceof _B) && !(target instanceof Uint8Array)) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "target" argument must be an instance of Buffer or Uint8Array. Received ' + _descT(target));
        }
        try { return _origPCmp.apply(this, arguments); }
        catch(e) { _addCode(e); throw e; }
      };
    }

    // Wrap constructor for Buffer(-1) / new Buffer(-1) / Buffer(NaN) path
    var _origBufFn = _B;
    var _BufWrap = function Buffer(arg, enc, len) {
      if (typeof arg === 'number') _validateSize(arg);
      try {
        if (this instanceof _BufWrap) return _origBufFn.call(this, arg, enc, len);
        return _origBufFn(arg, enc, len);
      } catch(e) { _addCode(e); throw e; }
    };
    _BufWrap.prototype = _origBufFn.prototype;
    _BufWrap.prototype.constructor = _BufWrap;
    try { Object.setPrototypeOf(_BufWrap, Object.getPrototypeOf(_origBufFn)); } catch(e) {}
    Object.getOwnPropertyNames(_origBufFn).forEach(function(k) {
      if (k !== 'prototype' && k !== 'length' && k !== 'name' && k !== 'arguments' && k !== 'caller') {
        try { Object.defineProperty(_BufWrap, k, Object.getOwnPropertyDescriptor(_origBufFn, k)); } catch(e) {}
      }
    });
    module.exports.Buffer = _BufWrap;

    // Wrap SlowBuffer with size validation
    var _origSB = module.exports.SlowBuffer;
    if (_origSB) {
      module.exports.SlowBuffer = function SlowBuffer(length) {
        _validateSize(length);
        try { return _origSB(length); }
        catch(e) { _addCode(e); throw e; }
      };
      module.exports.SlowBuffer.prototype = _origSB.prototype;
    }`;
		}

		// Patch path polyfill: add ERR_INVALID_ARG_TYPE for non-string arguments
		if (moduleName === "path") {
			postPatch = ERR_HELPERS + `
    var _p = module.exports;
    function _validateStr(v, name) {
      if (typeof v !== 'string') throw _typeErr('ERR_INVALID_ARG_TYPE',
        'The "' + name + '" argument must be of type string. Received ' + _descT(v));
    }
    ['join','resolve'].forEach(function(m) {
      var o = _p[m]; if (!o) return;
      _p[m] = function() {
        for (var i = 0; i < arguments.length; i++) _validateStr(arguments[i], 'path');
        return o.apply(_p, arguments);
      };
    });
    ['normalize','isAbsolute','dirname','extname'].forEach(function(m) {
      var o = _p[m]; if (!o) return;
      _p[m] = function(p) { _validateStr(p, 'path'); return o.apply(_p, arguments); };
    });
    var _origBn = _p.basename; if (_origBn) {
      _p.basename = function basename(p, ext) {
        _validateStr(p, 'path');
        if (ext !== undefined) _validateStr(ext, 'ext');
        return _origBn.apply(_p, arguments);
      };
    }
    var _origRel = _p.relative; if (_origRel) {
      _p.relative = function relative(from, to) {
        _validateStr(from, 'from'); _validateStr(to, 'to');
        return _origRel.apply(_p, arguments);
      };
    }
    var _origParse = _p.parse; if (_origParse) {
      _p.parse = function parse(p) {
        _validateStr(p, 'pathString');
        return _origParse.apply(_p, arguments);
      };
    }
    var _origFmt = _p.format; if (_origFmt) {
      _p.format = function format(pathObject) {
        if (pathObject === null || typeof pathObject !== 'object') {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "pathObject" argument must be of type Object. Received ' + _descT(pathObject));
        }
        return _origFmt.apply(_p, arguments);
      };
    }
    // path.posix should reflect the same patches (path-browserify is already POSIX)
    if (_p.posix === _p) { /* already patched */ }
    else if (_p.posix) { Object.keys(_p).forEach(function(k) { if (typeof _p[k] === 'function') _p.posix[k] = _p[k]; }); }`;
		}

		// Patch zlib polyfill: add constants object, ERR_* codes, crc32
		if (moduleName === "zlib") {
			postPatch = ERR_HELPERS + `
    var _Z = module.exports;

    // Build constants object from individual Z_* exports
    if (!_Z.constants) {
      _Z.constants = {};
      Object.keys(_Z).forEach(function(k) {
        if (k.startsWith('Z_') && typeof _Z[k] === 'number') {
          _Z.constants[k] = _Z[k];
        }
      });
      // Add Brotli constants as stubs (not supported but tests check for existence)
      var _brotliConsts = {
        BROTLI_DECODE: 1, BROTLI_ENCODE: 0,
        BROTLI_OPERATION_PROCESS: 0, BROTLI_OPERATION_FLUSH: 1,
        BROTLI_OPERATION_FINISH: 2, BROTLI_OPERATION_EMIT_METADATA: 3,
        BROTLI_PARAM_MODE: 0, BROTLI_MODE_GENERIC: 0,
        BROTLI_MODE_TEXT: 1, BROTLI_MODE_FONT: 2,
        BROTLI_PARAM_QUALITY: 1, BROTLI_MIN_QUALITY: 0,
        BROTLI_MAX_QUALITY: 11, BROTLI_DEFAULT_QUALITY: 11,
        BROTLI_PARAM_LGWIN: 2, BROTLI_MIN_WINDOW_BITS: 10,
        BROTLI_MAX_WINDOW_BITS: 24, BROTLI_DEFAULT_WINDOW: 22,
        BROTLI_PARAM_LGBLOCK: 3, BROTLI_MIN_INPUT_BLOCK_BITS: 16,
        BROTLI_MAX_INPUT_BLOCK_BITS: 24,
        BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: 4,
        BROTLI_PARAM_SIZE_HINT: 5, BROTLI_PARAM_LARGE_WINDOW: 6,
        BROTLI_PARAM_NPOSTFIX: 7, BROTLI_PARAM_NDIRECT: 8,
        BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: 0,
        BROTLI_DECODER_PARAM_LARGE_WINDOW: 1,
      };
      Object.keys(_brotliConsts).forEach(function(k) { _Z.constants[k] = _brotliConsts[k]; });
      // Add Node.js zlib mode constants
      _Z.constants.DEFLATE = 1;
      _Z.constants.INFLATE = 2;
      _Z.constants.GZIP = 3;
      _Z.constants.DEFLATERAW = 4;
      _Z.constants.INFLATERAW = 5;
      _Z.constants.UNZIP = 6;
      _Z.constants.GUNZIP = 7;
      _Z.constants.BROTLI_DECODE = 8;
      _Z.constants.BROTLI_ENCODE = 9;
    }

    // Add codes object mapping error codes to names (reverse of constants)
    if (!_Z.codes) {
      _Z.codes = {};
    }

    // Add crc32 function (basic CRC-32 implementation)
    if (!_Z.crc32) {
      var _crc32Table;
      function _makeCRC32Table() {
        var t = new Int32Array(256);
        for (var i = 0; i < 256; i++) {
          var c = i;
          for (var j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
          t[i] = c;
        }
        return t;
      }
      _Z.crc32 = function crc32(data, value) {
        if (typeof data === 'string') data = Buffer.from(data);
        if (!(data instanceof Uint8Array) && !Buffer.isBuffer(data)) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received ' + _descT(data));
        }
        if (!_crc32Table) _crc32Table = _makeCRC32Table();
        var crc = (value !== undefined ? value : 0) ^ -1;
        for (var i = 0; i < data.length; i++) crc = _crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ -1) >>> 0;
      };
    }

    // Add ERR_* codes to convenience method errors
    var _convMethods = ['gzip','gunzip','deflate','inflate','deflateRaw','inflateRaw','unzip',
                        'gzipSync','gunzipSync','deflateSync','inflateSync','deflateRawSync','inflateRawSync','unzipSync'];
    _convMethods.forEach(function(m) {
      var orig = _Z[m];
      if (!orig) return;
      _Z[m] = function() {
        var args = Array.prototype.slice.call(arguments);
        // Validate first arg (buffer) for sync methods
        if (m.endsWith('Sync')) {
          var buf = args[0];
          if (buf !== undefined && buf !== null && typeof buf !== 'string' && !(buf instanceof Uint8Array) && !Buffer.isBuffer(buf) && !(buf instanceof ArrayBuffer)) {
            throw _typeErr('ERR_INVALID_ARG_TYPE',
              'The "buffer" argument must be of type string or an instance of Buffer, TypedArray, DataView, or ArrayBuffer. Received ' + _descT(buf));
          }
        }
        try { return orig.apply(_Z, args); }
        catch(e) { _addCode(e); throw e; }
      };
    });`;
		}

		// Patch crypto polyfill: add ERR_* error codes, getFips, hash()
		if (moduleName === "crypto") {
			postPatch = ERR_HELPERS + `
    var _C = module.exports;

    // Add ERR_INVALID_ARG_TYPE to createHash/createHmac for non-string algorithm
    var _origCreateHash = _C.createHash;
    if (_origCreateHash) {
      _C.createHash = function createHash(algorithm, options) {
        if (algorithm === undefined || algorithm === null || typeof algorithm !== 'string') {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "algorithm" argument must be of type string. Received ' + _descT(algorithm));
        }
        var h = _origCreateHash.call(_C, algorithm, options);
        // Patch hash instance to add ERR_CRYPTO_HASH_FINALIZED
        var _finalized = false;
        var _origDigest = h.digest;
        h.digest = function digest(enc) {
          if (_finalized) {
            var e = new Error('Digest already called');
            e.code = 'ERR_CRYPTO_HASH_FINALIZED';
            throw e;
          }
          _finalized = true;
          return _origDigest.apply(h, arguments);
        };
        var _origUpdate = h.update;
        h.update = function update(data, encoding) {
          if (_finalized) {
            var e = new Error('Digest already called');
            e.code = 'ERR_CRYPTO_HASH_FINALIZED';
            throw e;
          }
          if (data === undefined || data === null) {
            throw _typeErr('ERR_INVALID_ARG_TYPE',
              'The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received ' + _descT(data));
          }
          return _origUpdate.apply(h, arguments);
        };
        return h;
      };
      _C.Hash = _C.createHash;
    }

    var _origCreateHmac = _C.createHmac;
    if (_origCreateHmac) {
      _C.createHmac = function createHmac(algorithm, key, options) {
        if (algorithm === undefined || algorithm === null || typeof algorithm !== 'string') {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "algorithm" argument must be of type string. Received ' + _descT(algorithm));
        }
        return _origCreateHmac.call(_C, algorithm, key, options);
      };
      _C.Hmac = _C.createHmac;
    }

    // Add crypto.hash() one-shot API (Node.js 21.7+)
    if (!_C.hash) {
      _C.hash = function hash(algorithm, data, outputEncoding) {
        if (typeof algorithm !== 'string') {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "algorithm" argument must be of type string. Received ' + _descT(algorithm));
        }
        var h = _C.createHash(algorithm);
        h.update(data);
        return h.digest(outputEncoding || 'hex');
      };
    }

    // Add getFips() stub — sandbox doesn't use FIPS mode
    if (!_C.getFips) { _C.getFips = function getFips() { return 0; }; }
    if (!_C.setFips) { _C.setFips = function setFips() { throw new Error('Cannot set FIPS mode in sandbox'); }; }

    // Ensure getHashes returns supported hashes
    if (!_C.getHashes) {
      _C.getHashes = function getHashes() {
        return ['md5','sha1','sha224','sha256','sha384','sha512','ripemd160','rmd160'];
      };
    }

    // Ensure constants are exported
    if (!_C.constants) { _C.constants = {}; }

    // Add randomUUID if available from globalThis.crypto
    if (!_C.randomUUID && typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
      _C.randomUUID = function randomUUID(options) {
        if (options !== undefined && (options === null || typeof options !== 'object')) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "options" argument must be of type object. Received ' + _descT(options));
        }
        return globalThis.crypto.randomUUID();
      };
    }

    // Wrap randomBytes with ERR_INVALID_ARG_TYPE
    var _origRandomBytes = _C.randomBytes;
    if (_origRandomBytes) {
      _C.randomBytes = function randomBytes(size, callback) {
        if (typeof size !== 'number' || size !== size) {
          throw _typeErr('ERR_INVALID_ARG_TYPE',
            'The "size" argument must be of type number. Received ' + _descT(size));
        }
        if (size < 0 || size > 2147483647) {
          throw _rangeErr('ERR_OUT_OF_RANGE',
            'The value of "size" is out of range. It must be >= 0 && <= 2147483647. Received ' + size);
        }
        return _origRandomBytes.call(_C, size, callback);
      };
    }`;
		}

		wrappedCode = `(function() {
    var module = { exports: {} };
    var exports = module.exports;
    ${code}
    ${postPatch}
    return module.exports;
  })()`;
	}

	polyfillCache.set(moduleName, wrappedCode);
	return wrappedCode;
}

/**
 * Get all available stdlib modules (those with non-null polyfills)
 */
export function getAvailableStdlib(): string[] {
	return Object.keys(stdLibBrowser).filter(
		(key) => stdLibBrowser[key as keyof typeof stdLibBrowser] !== null,
	);
}

/**
 * Check if a module has a polyfill available
 * Note: fs returns null from node-stdlib-browser since we provide our own implementation
 */
export function hasPolyfill(moduleName: string): boolean {
	// Strip node: prefix
	const name = moduleName.replace(/^node:/, "");
	const polyfill = stdLibBrowser[name as keyof typeof stdLibBrowser];
	return polyfill !== undefined && polyfill !== null;
}

/**
 * Pre-bundle all polyfills (for faster startup)
 */
export async function prebundleAllPolyfills(): Promise<Map<string, string>> {
	const modules = getAvailableStdlib();
	await Promise.all(modules.map((m) => bundlePolyfill(m)));
	return new Map(polyfillCache);
}
