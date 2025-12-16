"use strict";
var bridge = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../../node_modules/.pnpm/base64-js@1.5.1/node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "../../node_modules/.pnpm/base64-js@1.5.1/node_modules/base64-js/index.js"(exports) {
      "use strict";
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i = 0, len = code.length; i < len; ++i) {
        lookup[i] = code[i];
        revLookup[code.charCodeAt(i)] = i;
      }
      var i;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i2;
        for (i2 = 0; i2 < len2; i2 += 4) {
          tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i2 = start; i2 < end; i2 += 3) {
          tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // ../../node_modules/.pnpm/ieee754@1.2.1/node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "../../node_modules/.pnpm/ieee754@1.2.1/node_modules/ieee754/index.js"(exports) {
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i = isLE ? nBytes - 1 : 0;
        var d = isLE ? -1 : 1;
        var s = buffer[offset + i];
        i += d;
        e = s & (1 << -nBits) - 1;
        s >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        m = e & (1 << -nBits) - 1;
        e >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        if (e === 0) {
          e = 1 - eBias;
        } else if (e === eMax) {
          return m ? NaN : (s ? -1 : 1) * Infinity;
        } else {
          m = m + Math.pow(2, mLen);
          e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i = isLE ? 0 : nBytes - 1;
        var d = isLE ? 1 : -1;
        var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m = isNaN(value) ? 1 : 0;
          e = eMax;
        } else {
          e = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c = Math.pow(2, -e)) < 1) {
            e--;
            c *= 2;
          }
          if (e + eBias >= 1) {
            value += rt / c;
          } else {
            value += rt * Math.pow(2, 1 - eBias);
          }
          if (value * c >= 2) {
            e++;
            c /= 2;
          }
          if (e + eBias >= eMax) {
            m = 0;
            e = eMax;
          } else if (e + eBias >= 1) {
            m = (value * c - 1) * Math.pow(2, mLen);
            e = e + eBias;
          } else {
            m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
        }
        e = e << mLen | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
        }
        buffer[offset + i - d] |= s * 128;
      };
    }
  });

  // ../../node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "../../node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js"(exports) {
      "use strict";
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer4;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer4.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer4.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e) {
          return false;
        }
      }
      Object.defineProperty(Buffer4.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer4.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer4.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer4.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer4.prototype);
        return buf;
      }
      function Buffer4(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer4.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer4.from(valueOf, encodingOrOffset, length);
        }
        const b = fromObject(value);
        if (b) return b;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer4.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer4.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer4.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer4, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer4.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer4.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer4.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer4.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i = 0; i < length; i += 1) {
          buf[i] = array[i] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer4.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer4.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer4.alloc(+length);
      }
      Buffer4.isBuffer = function isBuffer(b) {
        return b != null && b._isBuffer === true && b !== Buffer4.prototype;
      };
      Buffer4.compare = function compare(a, b) {
        if (isInstance(a, Uint8Array)) a = Buffer4.from(a, a.offset, a.byteLength);
        if (isInstance(b, Uint8Array)) b = Buffer4.from(b, b.offset, b.byteLength);
        if (!Buffer4.isBuffer(a) || !Buffer4.isBuffer(b)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a === b) return 0;
        let x = a.length;
        let y = b.length;
        for (let i = 0, len = Math.min(x, y); i < len; ++i) {
          if (a[i] !== b[i]) {
            x = a[i];
            y = b[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      Buffer4.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer4.concat = function concat(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer4.alloc(0);
        }
        let i;
        if (length === void 0) {
          length = 0;
          for (i = 0; i < list.length; ++i) {
            length += list[i].length;
          }
        }
        const buffer = Buffer4.allocUnsafe(length);
        let pos = 0;
        for (i = 0; i < list.length; ++i) {
          let buf = list[i];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer4.isBuffer(buf)) buf = Buffer4.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer4.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer4.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer4.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer4.prototype._isBuffer = true;
      function swap(b, n, m) {
        const i = b[n];
        b[n] = b[m];
        b[m] = i;
      }
      Buffer4.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) {
          swap(this, i, i + 1);
        }
        return this;
      };
      Buffer4.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(this, i, i + 3);
          swap(this, i + 1, i + 2);
        }
        return this;
      };
      Buffer4.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(this, i, i + 7);
          swap(this, i + 1, i + 6);
          swap(this, i + 2, i + 5);
          swap(this, i + 3, i + 4);
        }
        return this;
      };
      Buffer4.prototype.toString = function toString() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer4.prototype.toLocaleString = Buffer4.prototype.toString;
      Buffer4.prototype.equals = function equals(b) {
        if (!Buffer4.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
        if (this === b) return true;
        return Buffer4.compare(this, b) === 0;
      };
      Buffer4.prototype.inspect = function inspect() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer4.prototype[customInspectSymbol] = Buffer4.prototype.inspect;
      }
      Buffer4.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer4.from(target, target.offset, target.byteLength);
        }
        if (!Buffer4.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x = thisEnd - thisStart;
        let y = end - start;
        const len = Math.min(x, y);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i = 0; i < len; ++i) {
          if (thisCopy[i] !== targetCopy[i]) {
            x = thisCopy[i];
            y = targetCopy[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer4.from(val, encoding);
        }
        if (Buffer4.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i2) {
          if (indexSize === 1) {
            return buf[i2];
          } else {
            return buf.readUInt16BE(i2 * indexSize);
          }
        }
        let i;
        if (dir) {
          let foundIndex = -1;
          for (i = byteOffset; i < arrLength; i++) {
            if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < valLength; j++) {
              if (read(arr, i + j) !== read(val, j)) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      Buffer4.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer4.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer4.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i;
        for (i = 0; i < length; ++i) {
          const parsed = parseInt(string.substr(i * 2, 2), 16);
          if (numberIsNaN(parsed)) return i;
          buf[offset + i] = parsed;
        }
        return i;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer4.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer4.prototype.toJSON = function toJSON() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i = start;
        while (i < end) {
          const firstByte = buf[i];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                fourthByte = buf[i + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i = 0;
        while (i < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i = start; i < end; ++i) {
          out += hexSliceLookupTable[buf[i]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i = 0; i < bytes.length - 1; i += 2) {
          res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
        }
        return res;
      }
      Buffer4.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer4.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer4.prototype.readUintLE = Buffer4.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        return val;
      };
      Buffer4.prototype.readUintBE = Buffer4.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul = 1;
        while (byteLength2 > 0 && (mul *= 256)) {
          val += this[offset + --byteLength2] * mul;
        }
        return val;
      };
      Buffer4.prototype.readUint8 = Buffer4.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer4.prototype.readUint16LE = Buffer4.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer4.prototype.readUint16BE = Buffer4.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer4.prototype.readUint32LE = Buffer4.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer4.prototype.readUint32BE = Buffer4.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer4.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer4.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer4.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer4.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i = byteLength2;
        let mul = 1;
        let val = this[offset + --i];
        while (i > 0 && (mul *= 256)) {
          val += this[offset + --i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer4.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer4.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer4.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer4.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer4.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer4.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer4.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer4.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer4.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer4.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer4.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer4.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer4.prototype.writeUintLE = Buffer4.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul = 1;
        let i = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer4.prototype.writeUintBE = Buffer4.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer4.prototype.writeUint8 = Buffer4.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer4.prototype.writeUint16LE = Buffer4.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer4.prototype.writeUint16BE = Buffer4.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer4.prototype.writeUint32LE = Buffer4.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer4.prototype.writeUint32BE = Buffer4.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer4.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer4.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer4.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = 0;
        let mul = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer4.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        let sub = 0;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer4.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer4.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer4.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer4.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer4.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer4.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer4.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer4.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer4.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer4.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer4.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer4.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer4.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer4.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer4.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i;
        if (typeof val === "number") {
          for (i = start; i < end; ++i) {
            this[i] = val;
          }
        } else {
          const bytes = Buffer4.isBuffer(val) ? val : Buffer4.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i = 0; i < end - start; ++i) {
            this[i + start] = bytes[i % len];
          }
        }
        return this;
      };
      var errors = {};
      function E(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i >= start + 4; i -= 3) {
          res = `_${val.slice(i - 3, i)}${res}`;
        }
        return `${val.slice(0, i)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
            } else {
              range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
            }
          } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i = 0; i < length; ++i) {
          codePoint = string.charCodeAt(i);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          byteArray.push(str.charCodeAt(i) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c, hi, lo;
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          if ((units -= 2) < 0) break;
          c = str.charCodeAt(i);
          hi = c >> 8;
          lo = c % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i;
        for (i = 0; i < length; ++i) {
          if (i + offset >= dst.length || i >= src.length) break;
          dst[i + offset] = src[i];
        }
        return i;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = (function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i = 0; i < 16; ++i) {
          const i16 = i * 16;
          for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j];
          }
        }
        return table;
      })();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // bridge/index.ts
  var index_exports = {};
  __export(index_exports, {
    Buffer: () => Buffer3,
    Module: () => Module,
    ProcessExitError: () => ProcessExitError,
    SourceMap: () => SourceMap,
    TextDecoder: () => TextDecoder2,
    TextEncoder: () => TextEncoder,
    URL: () => URL2,
    URLSearchParams: () => URLSearchParams,
    childProcess: () => child_process_exports,
    clearImmediate: () => clearImmediate,
    clearInterval: () => clearInterval,
    clearTimeout: () => clearTimeout,
    createRequire: () => createRequire,
    cryptoPolyfill: () => cryptoPolyfill,
    default: () => index_default,
    fs: () => fs_default,
    module: () => module_default,
    network: () => network_exports,
    os: () => os_default,
    process: () => process_default,
    setImmediate: () => setImmediate,
    setInterval: () => setInterval,
    setTimeout: () => setTimeout2,
    setupGlobals: () => setupGlobals
  });

  // bridge/fs.ts
  var import_buffer = __toESM(require_buffer(), 1);
  var fdTable = /* @__PURE__ */ new Map();
  var nextFd = 3;
  var Stats = class {
    dev;
    ino;
    mode;
    nlink;
    uid;
    gid;
    rdev;
    size;
    blksize;
    blocks;
    atimeMs;
    mtimeMs;
    ctimeMs;
    birthtimeMs;
    atime;
    mtime;
    ctime;
    birthtime;
    constructor(init) {
      this.dev = init.dev ?? 0;
      this.ino = init.ino ?? 0;
      this.mode = init.mode;
      this.nlink = init.nlink ?? 1;
      this.uid = init.uid ?? 0;
      this.gid = init.gid ?? 0;
      this.rdev = init.rdev ?? 0;
      this.size = init.size;
      this.blksize = init.blksize ?? 4096;
      this.blocks = init.blocks ?? Math.ceil(init.size / 512);
      this.atimeMs = init.atimeMs ?? Date.now();
      this.mtimeMs = init.mtimeMs ?? Date.now();
      this.ctimeMs = init.ctimeMs ?? Date.now();
      this.birthtimeMs = init.birthtimeMs ?? Date.now();
      this.atime = new Date(this.atimeMs);
      this.mtime = new Date(this.mtimeMs);
      this.ctime = new Date(this.ctimeMs);
      this.birthtime = new Date(this.birthtimeMs);
    }
    isFile() {
      return (this.mode & 61440) === 32768;
    }
    isDirectory() {
      return (this.mode & 61440) === 16384;
    }
    isSymbolicLink() {
      return (this.mode & 61440) === 40960;
    }
    isBlockDevice() {
      return false;
    }
    isCharacterDevice() {
      return false;
    }
    isFIFO() {
      return false;
    }
    isSocket() {
      return false;
    }
  };
  var Dirent = class {
    name;
    parentPath;
    path;
    // Deprecated alias for parentPath
    _isDir;
    constructor(name, isDir, parentPath = "") {
      this.name = name;
      this._isDir = isDir;
      this.parentPath = parentPath;
      this.path = parentPath;
    }
    isFile() {
      return !this._isDir;
    }
    isDirectory() {
      return this._isDir;
    }
    isSymbolicLink() {
      return false;
    }
    isBlockDevice() {
      return false;
    }
    isCharacterDevice() {
      return false;
    }
    isFIFO() {
      return false;
    }
    isSocket() {
      return false;
    }
  };
  var WriteStream = class {
    // WriteStream-specific properties
    bytesWritten = 0;
    path;
    pending = false;
    // Writable stream properties
    writable = true;
    writableAborted = false;
    writableEnded = false;
    writableFinished = false;
    writableHighWaterMark = 16384;
    writableLength = 0;
    writableObjectMode = false;
    writableCorked = 0;
    destroyed = false;
    closed = false;
    errored = null;
    writableNeedDrain = false;
    // Internal state
    _chunks = [];
    _listeners = /* @__PURE__ */ new Map();
    constructor(filePath, _options) {
      this.path = filePath;
      console.log("[WriteStream] Created for path:", filePath);
    }
    // WriteStream-specific methods
    close(callback) {
      if (this.closed) {
        if (callback) Promise.resolve().then(() => callback(null));
        return;
      }
      this.closed = true;
      this.writable = false;
      Promise.resolve().then(() => {
        this.emit("close");
        if (callback) callback(null);
      });
    }
    // Writable methods
    write(chunk, encodingOrCallback, callback) {
      const chunkLen = chunk && typeof chunk.length === "number" ? chunk.length : 0;
      console.log("[WriteStream] write() called, chunk length:", chunkLen);
      if (this.writableEnded || this.destroyed) {
        const err = new Error("write after end");
        if (typeof encodingOrCallback === "function") {
          Promise.resolve().then(() => encodingOrCallback(err));
        } else if (callback) {
          Promise.resolve().then(() => callback(err));
        }
        return false;
      }
      let data;
      if (typeof chunk === "string") {
        data = import_buffer.Buffer.from(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8");
      } else if (import_buffer.Buffer.isBuffer(chunk)) {
        data = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      } else if (chunk instanceof Uint8Array) {
        data = chunk;
      } else {
        data = import_buffer.Buffer.from(String(chunk));
      }
      this._chunks.push(data);
      this.bytesWritten += data.length;
      this.writableLength += data.length;
      const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (cb) Promise.resolve().then(() => cb(null));
      return true;
    }
    end(chunkOrCb, encodingOrCallback, callback) {
      console.log("[WriteStream] end() called, total chunks:", this._chunks.length, "bytesWritten:", this.bytesWritten);
      if (this.writableEnded) return this;
      let cb;
      if (typeof chunkOrCb === "function") {
        cb = chunkOrCb;
      } else if (typeof encodingOrCallback === "function") {
        cb = encodingOrCallback;
        if (chunkOrCb !== void 0 && chunkOrCb !== null) {
          this.write(chunkOrCb);
        }
      } else {
        cb = callback;
        if (chunkOrCb !== void 0 && chunkOrCb !== null) {
          this.write(chunkOrCb, encodingOrCallback);
        }
      }
      this.writableEnded = true;
      const totalLength = this._chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const c of this._chunks) {
        result.set(c, offset);
        offset += c.length;
      }
      const pathStr = typeof this.path === "string" ? this.path : this.path.toString();
      fs.writeFileSync(pathStr, result);
      this.writable = false;
      this.writableFinished = true;
      this.writableLength = 0;
      Promise.resolve().then(() => {
        this.emit("finish");
        this.emit("close");
        this.closed = true;
        if (cb) cb();
      });
      return this;
    }
    setDefaultEncoding(_encoding) {
      return this;
    }
    cork() {
      this.writableCorked++;
    }
    uncork() {
      if (this.writableCorked > 0) this.writableCorked--;
    }
    destroy(error) {
      if (this.destroyed) return this;
      this.destroyed = true;
      this.writable = false;
      if (error) {
        this.errored = error;
        Promise.resolve().then(() => {
          this.emit("error", error);
          this.emit("close");
          this.closed = true;
        });
      } else {
        Promise.resolve().then(() => {
          this.emit("close");
          this.closed = true;
        });
      }
      return this;
    }
    // Internal methods (required by Writable interface but not typically called directly)
    _write(_chunk, _encoding, callback) {
      callback();
    }
    _destroy(_error2, callback) {
      callback();
    }
    _final(callback) {
      callback();
    }
    // EventEmitter methods
    addListener(event, listener) {
      return this.on(event, listener);
    }
    on(event, listener) {
      const listeners = this._listeners.get(event) || [];
      listeners.push(listener);
      this._listeners.set(event, listeners);
      return this;
    }
    once(event, listener) {
      const wrapper = (...args) => {
        this.removeListener(event, wrapper);
        listener(...args);
      };
      return this.on(event, wrapper);
    }
    prependListener(event, listener) {
      const listeners = this._listeners.get(event) || [];
      listeners.unshift(listener);
      this._listeners.set(event, listeners);
      return this;
    }
    prependOnceListener(event, listener) {
      const wrapper = (...args) => {
        this.removeListener(event, wrapper);
        listener(...args);
      };
      return this.prependListener(event, wrapper);
    }
    removeListener(event, listener) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      }
      return this;
    }
    off(event, listener) {
      return this.removeListener(event, listener);
    }
    removeAllListeners(event) {
      if (event !== void 0) {
        this._listeners.delete(event);
      } else {
        this._listeners.clear();
      }
      return this;
    }
    emit(event, ...args) {
      const listeners = this._listeners.get(event);
      if (listeners && listeners.length > 0) {
        listeners.slice().forEach((l) => l(...args));
        return true;
      }
      return false;
    }
    listeners(event) {
      return [...this._listeners.get(event) || []];
    }
    rawListeners(event) {
      return this.listeners(event);
    }
    listenerCount(event) {
      return (this._listeners.get(event) || []).length;
    }
    eventNames() {
      return [...this._listeners.keys()];
    }
    getMaxListeners() {
      return 10;
    }
    setMaxListeners(_n) {
      return this;
    }
    // Pipe methods (minimal implementation)
    pipe(destination, _options) {
      return destination;
    }
    unpipe(_destination) {
      return this;
    }
    // Additional required methods
    compose(_stream, _options) {
      throw new Error("compose not implemented in sandbox");
    }
    [Symbol.asyncDispose]() {
      return Promise.resolve();
    }
  };
  function parseFlags(flags) {
    if (typeof flags === "number") return flags;
    const flagMap = {
      r: 0,
      "r+": 2,
      w: 577,
      "w+": 578,
      a: 1089,
      "a+": 1090,
      wx: 705,
      xw: 705,
      "wx+": 706,
      "xw+": 706,
      ax: 1217,
      xa: 1217,
      "ax+": 1218,
      "xa+": 1218
    };
    if (flags in flagMap) return flagMap[flags];
    throw new Error("Unknown file flag: " + flags);
  }
  function canRead(flags) {
    const mode = flags & 3;
    return mode === 0 || mode === 2;
  }
  function canWrite(flags) {
    const mode = flags & 3;
    return mode === 1 || mode === 2;
  }
  function createFsError(code, message, syscall, path) {
    const err = new Error(message);
    err.code = code;
    err.errno = code === "ENOENT" ? -2 : code === "EBADF" ? -9 : -1;
    err.syscall = syscall;
    if (path) err.path = path;
    return err;
  }
  function toPathString(path) {
    if (typeof path === "string") return path;
    if (import_buffer.Buffer.isBuffer(path)) return path.toString("utf8");
    if (path instanceof URL) return path.pathname;
    return String(path);
  }
  var fs = {
    // Constants
    constants: {
      // File Access Constants
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
      // File Copy Constants
      COPYFILE_EXCL: 1,
      COPYFILE_FICLONE: 2,
      COPYFILE_FICLONE_FORCE: 4,
      // File Open Constants
      O_RDONLY: 0,
      O_WRONLY: 1,
      O_RDWR: 2,
      O_CREAT: 64,
      O_EXCL: 128,
      O_NOCTTY: 256,
      O_TRUNC: 512,
      O_APPEND: 1024,
      O_DIRECTORY: 65536,
      O_NOATIME: 262144,
      O_NOFOLLOW: 131072,
      O_SYNC: 1052672,
      O_DSYNC: 4096,
      O_SYMLINK: 2097152,
      O_DIRECT: 16384,
      O_NONBLOCK: 2048,
      // File Type Constants
      S_IFMT: 61440,
      S_IFREG: 32768,
      S_IFDIR: 16384,
      S_IFCHR: 8192,
      S_IFBLK: 24576,
      S_IFIFO: 4096,
      S_IFLNK: 40960,
      S_IFSOCK: 49152,
      // File Mode Constants
      S_IRWXU: 448,
      S_IRUSR: 256,
      S_IWUSR: 128,
      S_IXUSR: 64,
      S_IRWXG: 56,
      S_IRGRP: 32,
      S_IWGRP: 16,
      S_IXGRP: 8,
      S_IRWXO: 7,
      S_IROTH: 4,
      S_IWOTH: 2,
      S_IXOTH: 1,
      UV_FS_O_FILEMAP: 536870912
    },
    Stats,
    Dirent,
    // Sync methods
    readFileSync(path, options) {
      const pathStr = typeof path === "number" ? fdTable.get(path)?.path : toPathString(path);
      if (!pathStr) throw createFsError("EBADF", "EBADF: bad file descriptor", "read");
      const encoding = typeof options === "string" ? options : options?.encoding;
      try {
        if (encoding) {
          const content = _fs.readFile.applySyncPromise(void 0, [pathStr]);
          return content;
        } else {
          const base64Content = _fs.readFileBinary.applySyncPromise(void 0, [pathStr]);
          return import_buffer.Buffer.from(base64Content, "base64");
        }
      } catch (err) {
        const errMsg = err.message || String(err);
        if (errMsg.includes("entry not found") || errMsg.includes("not found")) {
          throw createFsError(
            "ENOENT",
            `ENOENT: no such file or directory, read '${pathStr}'`,
            "read",
            pathStr
          );
        }
        throw err;
      }
    },
    writeFileSync(file, data, _options) {
      const pathStr = typeof file === "number" ? fdTable.get(file)?.path : toPathString(file);
      if (!pathStr) throw createFsError("EBADF", "EBADF: bad file descriptor", "write");
      if (typeof data === "string") {
        _fs.writeFile.applySync(void 0, [pathStr, data]);
      } else if (ArrayBuffer.isView(data)) {
        const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const base64 = import_buffer.Buffer.from(uint8).toString("base64");
        _fs.writeFileBinary.applySync(void 0, [pathStr, base64]);
      } else {
        _fs.writeFile.applySync(void 0, [pathStr, String(data)]);
      }
    },
    appendFileSync(path, data, options) {
      const existing = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
      const content = typeof data === "string" ? data : String(data);
      fs.writeFileSync(path, existing + content, options);
    },
    readdirSync(path, options) {
      const pathStr = toPathString(path);
      let entriesJson;
      try {
        entriesJson = _fs.readDir.applySyncPromise(void 0, [pathStr]);
      } catch (err) {
        const errMsg = err.message || String(err);
        if (errMsg.includes("entry not found") || errMsg.includes("not found")) {
          throw createFsError(
            "ENOENT",
            `ENOENT: no such file or directory, scandir '${pathStr}'`,
            "scandir",
            pathStr
          );
        }
        throw err;
      }
      const entries = JSON.parse(entriesJson);
      if (options?.withFileTypes) {
        return entries.map((e) => new Dirent(e.name, e.isDirectory, pathStr));
      }
      return entries.map((e) => e.name);
    },
    mkdirSync(path, options) {
      const recursive = typeof options === "object" ? options?.recursive ?? false : false;
      _fs.mkdir.applySync(void 0, [toPathString(path), recursive]);
      return recursive ? toPathString(path) : void 0;
    },
    rmdirSync(path, _options) {
      _fs.rmdir.applySyncPromise(void 0, [toPathString(path)]);
    },
    existsSync(path) {
      const pathStr = toPathString(path);
      return _fs.exists.applySyncPromise(void 0, [pathStr]);
    },
    statSync(path, _options) {
      const pathStr = toPathString(path);
      let statJson;
      try {
        statJson = _fs.stat.applySyncPromise(void 0, [pathStr]);
      } catch (err) {
        const errMsg = err.message || String(err);
        if (errMsg.includes("entry not found") || errMsg.includes("not found") || errMsg.includes("ENOENT") || errMsg.includes("no such file or directory")) {
          throw createFsError(
            "ENOENT",
            `ENOENT: no such file or directory, stat '${pathStr}'`,
            "stat",
            pathStr
          );
        }
        throw err;
      }
      const stat = JSON.parse(statJson);
      return new Stats(stat);
    },
    lstatSync(path, _options) {
      return fs.statSync(path);
    },
    unlinkSync(path) {
      _fs.unlink.applySyncPromise(void 0, [toPathString(path)]);
    },
    renameSync(oldPath, newPath) {
      _fs.rename.applySyncPromise(void 0, [toPathString(oldPath), toPathString(newPath)]);
    },
    copyFileSync(src, dest, _mode) {
      const content = fs.readFileSync(src);
      fs.writeFileSync(dest, content);
    },
    // File descriptor methods
    openSync(path, flags, _mode) {
      const pathStr = toPathString(path);
      const numFlags = parseFlags(flags);
      const fd = nextFd++;
      const exists = fs.existsSync(path);
      if (numFlags & 64 && !exists) {
        fs.writeFileSync(path, "");
      } else if (!exists && !(numFlags & 64)) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, open '${pathStr}'`,
          "open",
          pathStr
        );
      }
      if (numFlags & 512 && exists) {
        fs.writeFileSync(path, "");
      }
      fdTable.set(fd, { path: pathStr, flags: numFlags, position: 0 });
      return fd;
    },
    closeSync(fd) {
      if (!fdTable.has(fd)) {
        throw createFsError("EBADF", "EBADF: bad file descriptor, close", "close");
      }
      fdTable.delete(fd);
    },
    readSync(fd, buffer, offset, length, position) {
      const entry = fdTable.get(fd);
      if (!entry) {
        throw createFsError("EBADF", "EBADF: bad file descriptor, read", "read");
      }
      if (!canRead(entry.flags)) {
        throw createFsError("EBADF", "EBADF: bad file descriptor, read", "read");
      }
      const content = fs.readFileSync(entry.path, "utf8");
      const readOffset = offset ?? 0;
      const readLength = length ?? buffer.byteLength - readOffset;
      const pos = position !== null && position !== void 0 ? Number(position) : entry.position;
      const toRead = content.slice(pos, pos + readLength);
      const bytes = import_buffer.Buffer.from(toRead);
      const targetBuffer = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      for (let i = 0; i < bytes.length && i < readLength; i++) {
        targetBuffer[readOffset + i] = bytes[i];
      }
      if (position === null || position === void 0) {
        entry.position += bytes.length;
      }
      return bytes.length;
    },
    writeSync(fd, buffer, offsetOrPosition, lengthOrEncoding, position) {
      const entry = fdTable.get(fd);
      if (!entry) {
        throw createFsError("EBADF", "EBADF: bad file descriptor, write", "write");
      }
      if (!canWrite(entry.flags)) {
        throw createFsError("EBADF", "EBADF: bad file descriptor, write", "write");
      }
      let data;
      let writePosition;
      if (typeof buffer === "string") {
        data = buffer;
        writePosition = offsetOrPosition;
      } else {
        const offset = offsetOrPosition ?? 0;
        const length = (typeof lengthOrEncoding === "number" ? lengthOrEncoding : null) ?? buffer.byteLength - offset;
        const view = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, length);
        data = new TextDecoder().decode(view);
        writePosition = position;
      }
      let content = "";
      if (fs.existsSync(entry.path)) {
        content = fs.readFileSync(entry.path, "utf8");
      }
      let writePos;
      if (entry.flags & 1024) {
        writePos = content.length;
      } else if (writePosition !== null && writePosition !== void 0) {
        writePos = writePosition;
      } else {
        writePos = entry.position;
      }
      while (content.length < writePos) {
        content += "\0";
      }
      const newContent = content.slice(0, writePos) + data + content.slice(writePos + data.length);
      fs.writeFileSync(entry.path, newContent);
      if (writePosition === null || writePosition === void 0) {
        entry.position = writePos + data.length;
      }
      return data.length;
    },
    fstatSync(fd) {
      const entry = fdTable.get(fd);
      if (!entry) {
        throw createFsError("EBADF", "EBADF: bad file descriptor, fstat", "fstat");
      }
      return fs.statSync(entry.path);
    },
    ftruncateSync(fd, len) {
      const entry = fdTable.get(fd);
      if (!entry) {
        throw createFsError(
          "EBADF",
          "EBADF: bad file descriptor, ftruncate",
          "ftruncate"
        );
      }
      const content = fs.existsSync(entry.path) ? fs.readFileSync(entry.path, "utf8") : "";
      const newLen = len ?? 0;
      if (content.length > newLen) {
        fs.writeFileSync(entry.path, content.slice(0, newLen));
      } else {
        let padded = content;
        while (padded.length < newLen) padded += "\0";
        fs.writeFileSync(entry.path, padded);
      }
    },
    // Async methods - wrap sync methods in callbacks/promises
    readFile(path, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = void 0;
      }
      if (callback) {
        try {
          callback(null, fs.readFileSync(path, options));
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.readFileSync(path, options));
      }
    },
    writeFile(path, data, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = void 0;
      }
      if (callback) {
        try {
          fs.writeFileSync(path, data, options);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(
          fs.writeFileSync(path, data, options)
        );
      }
    },
    appendFile(path, data, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = void 0;
      }
      if (callback) {
        try {
          fs.appendFileSync(path, data, options);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(
          fs.appendFileSync(path, data, options)
        );
      }
    },
    readdir(path, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = void 0;
      }
      if (callback) {
        try {
          callback(null, fs.readdirSync(path, options));
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(
          fs.readdirSync(path, options)
        );
      }
    },
    mkdir(path, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = void 0;
      }
      if (callback) {
        try {
          fs.mkdirSync(path, options);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        fs.mkdirSync(path, options);
        return Promise.resolve();
      }
    },
    rmdir(path, callback) {
      if (callback) {
        try {
          fs.rmdirSync(path);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.rmdirSync(path));
      }
    },
    exists(path, callback) {
      if (callback) {
        callback(fs.existsSync(path));
      } else {
        return Promise.resolve(fs.existsSync(path));
      }
    },
    stat(path, callback) {
      if (callback) {
        try {
          callback(null, fs.statSync(path));
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.statSync(path));
      }
    },
    lstat(path, callback) {
      if (callback) {
        try {
          callback(null, fs.lstatSync(path));
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.lstatSync(path));
      }
    },
    unlink(path, callback) {
      if (callback) {
        try {
          fs.unlinkSync(path);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.unlinkSync(path));
      }
    },
    rename(oldPath, newPath, callback) {
      if (callback) {
        try {
          fs.renameSync(oldPath, newPath);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.renameSync(oldPath, newPath));
      }
    },
    copyFile(src, dest, callback) {
      if (callback) {
        try {
          fs.copyFileSync(src, dest);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.copyFileSync(src, dest));
      }
    },
    open(path, flags, mode, callback) {
      if (typeof mode === "function") {
        callback = mode;
        mode = void 0;
      }
      if (callback) {
        try {
          const fd = fs.openSync(path, flags, mode);
          callback(null, fd);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.openSync(path, flags, mode));
      }
    },
    close(fd, callback) {
      if (callback) {
        try {
          fs.closeSync(fd);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.closeSync(fd));
      }
    },
    read(fd, buffer, offset, length, position, callback) {
      if (callback) {
        try {
          const bytesRead = fs.readSync(fd, buffer, offset, length, position);
          callback(null, bytesRead, buffer);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.readSync(fd, buffer, offset, length, position));
      }
    },
    write(fd, buffer, offset, length, position, callback) {
      if (typeof offset === "function") {
        callback = offset;
        offset = void 0;
        length = void 0;
        position = void 0;
      } else if (typeof length === "function") {
        callback = length;
        length = void 0;
        position = void 0;
      } else if (typeof position === "function") {
        callback = position;
        position = void 0;
      }
      if (callback) {
        try {
          const bytesWritten = fs.writeSync(
            fd,
            buffer,
            offset,
            length,
            position
          );
          callback(null, bytesWritten);
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(
          fs.writeSync(
            fd,
            buffer,
            offset,
            length,
            position
          )
        );
      }
    },
    // writev - write multiple buffers to a file descriptor
    writev(fd, buffers, position, callback) {
      if (typeof position === "function") {
        callback = position;
        position = null;
      }
      if (callback) {
        try {
          const bytesWritten = fs.writevSync(fd, buffers, position);
          callback(null, bytesWritten, buffers);
        } catch (e) {
          callback(e);
        }
      }
    },
    writevSync(fd, buffers, position) {
      let totalBytesWritten = 0;
      for (const buffer of buffers) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        totalBytesWritten += fs.writeSync(fd, bytes, 0, bytes.length, position);
        if (position !== null && position !== void 0) {
          position += bytes.length;
        }
      }
      return totalBytesWritten;
    },
    fstat(fd, callback) {
      if (callback) {
        try {
          callback(null, fs.fstatSync(fd));
        } catch (e) {
          callback(e);
        }
      } else {
        return Promise.resolve(fs.fstatSync(fd));
      }
    },
    // fs.promises API
    // Note: Using async functions to properly catch sync errors and return rejected promises
    promises: {
      async readFile(path, options) {
        return fs.readFileSync(path, options);
      },
      async writeFile(path, data, options) {
        return fs.writeFileSync(path, data, options);
      },
      async appendFile(path, data, options) {
        return fs.appendFileSync(path, data, options);
      },
      async readdir(path, options) {
        return fs.readdirSync(path, options);
      },
      async mkdir(path, options) {
        return fs.mkdirSync(path, options);
      },
      async rmdir(path) {
        return fs.rmdirSync(path);
      },
      async stat(path) {
        return fs.statSync(path);
      },
      async lstat(path) {
        return fs.lstatSync(path);
      },
      async unlink(path) {
        return fs.unlinkSync(path);
      },
      async rename(oldPath, newPath) {
        return fs.renameSync(oldPath, newPath);
      },
      async copyFile(src, dest) {
        return fs.copyFileSync(src, dest);
      },
      async access(path) {
        if (!fs.existsSync(path)) {
          throw createFsError(
            "ENOENT",
            `ENOENT: no such file or directory, access '${path}'`,
            "access",
            path
          );
        }
      }
    },
    // Compatibility methods
    accessSync(path) {
      if (!fs.existsSync(path)) {
        throw createFsError(
          "ENOENT",
          `ENOENT: no such file or directory, access '${path}'`,
          "access",
          path
        );
      }
    },
    access(path, mode, callback) {
      if (typeof mode === "function") {
        callback = mode;
        mode = void 0;
      }
      if (callback) {
        try {
          fs.accessSync(path);
          callback(null);
        } catch (e) {
          callback(e);
        }
      } else {
        return fs.promises.access(path);
      }
    },
    realpathSync: Object.assign(
      function realpathSync(path) {
        return toPathString(path).replace(/\/\/+/g, "/").replace(/\/$/, "") || "/";
      },
      {
        native(path) {
          return toPathString(path).replace(/\/\/+/g, "/").replace(/\/$/, "") || "/";
        }
      }
    ),
    realpath: Object.assign(
      function realpath(path, callback) {
        if (callback) {
          callback(null, fs.realpathSync(path));
        } else {
          return Promise.resolve(fs.realpathSync(path));
        }
      },
      {
        native(path, callback) {
          if (callback) {
            callback(null, fs.realpathSync.native(path));
          } else {
            return Promise.resolve(fs.realpathSync.native(path));
          }
        }
      }
    ),
    createReadStream(path, options) {
      const encoding = options?.encoding ?? "utf8";
      const content = fs.readFileSync(path, { encoding });
      return {
        on(event, handler) {
          if (event === "data") {
            setTimeout(() => handler(content), 0);
          } else if (event === "end") {
            setTimeout(() => handler(), 0);
          }
          return this;
        },
        pipe(dest) {
          dest.write(content);
          dest.end();
          return dest;
        }
      };
    },
    createWriteStream(path, options) {
      const pathStr = typeof path === "string" ? path : path instanceof import_buffer.Buffer ? path.toString() : String(path);
      const opts = typeof options === "string" ? { encoding: options } : options;
      return new WriteStream(pathStr, opts);
    },
    // Watch (no-op)
    watch() {
      return {
        close() {
        },
        on() {
          return this;
        }
      };
    },
    watchFile() {
    },
    unwatchFile() {
    }
  };
  var fs_default = fs;

  // bridge/os.ts
  var config = {
    platform: typeof _osConfig !== "undefined" && _osConfig.platform || "linux",
    arch: typeof _osConfig !== "undefined" && _osConfig.arch || "x64",
    type: typeof _osConfig !== "undefined" && _osConfig.type || "Linux",
    release: typeof _osConfig !== "undefined" && _osConfig.release || "5.15.0",
    version: typeof _osConfig !== "undefined" && _osConfig.version || "#1 SMP",
    homedir: typeof _osConfig !== "undefined" && _osConfig.homedir || "/root",
    tmpdir: typeof _osConfig !== "undefined" && _osConfig.tmpdir || "/tmp",
    hostname: typeof _osConfig !== "undefined" && _osConfig.hostname || "sandbox"
  };
  var signals = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGILL: 4,
    SIGTRAP: 5,
    SIGABRT: 6,
    SIGIOT: 6,
    SIGBUS: 7,
    SIGFPE: 8,
    SIGKILL: 9,
    SIGUSR1: 10,
    SIGSEGV: 11,
    SIGUSR2: 12,
    SIGPIPE: 13,
    SIGALRM: 14,
    SIGTERM: 15,
    SIGSTKFLT: 16,
    SIGCHLD: 17,
    SIGCONT: 18,
    SIGSTOP: 19,
    SIGTSTP: 20,
    SIGTTIN: 21,
    SIGTTOU: 22,
    SIGURG: 23,
    SIGXCPU: 24,
    SIGXFSZ: 25,
    SIGVTALRM: 26,
    SIGPROF: 27,
    SIGWINCH: 28,
    SIGIO: 29,
    SIGPOLL: 29,
    SIGPWR: 30,
    SIGSYS: 31
  };
  var errno = {
    E2BIG: 7,
    EACCES: 13,
    EADDRINUSE: 98,
    EADDRNOTAVAIL: 99,
    EAFNOSUPPORT: 97,
    EAGAIN: 11,
    EALREADY: 114,
    EBADF: 9,
    EBADMSG: 74,
    EBUSY: 16,
    ECANCELED: 125,
    ECHILD: 10,
    ECONNABORTED: 103,
    ECONNREFUSED: 111,
    ECONNRESET: 104,
    EDEADLK: 35,
    EDESTADDRREQ: 89,
    EDOM: 33,
    EDQUOT: 122,
    EEXIST: 17,
    EFAULT: 14,
    EFBIG: 27,
    EHOSTUNREACH: 113,
    EIDRM: 43,
    EILSEQ: 84,
    EINPROGRESS: 115,
    EINTR: 4,
    EINVAL: 22,
    EIO: 5,
    EISCONN: 106,
    EISDIR: 21,
    ELOOP: 40,
    EMFILE: 24,
    EMLINK: 31,
    EMSGSIZE: 90,
    EMULTIHOP: 72,
    ENAMETOOLONG: 36,
    ENETDOWN: 100,
    ENETRESET: 102,
    ENETUNREACH: 101,
    ENFILE: 23,
    ENOBUFS: 105,
    ENODATA: 61,
    ENODEV: 19,
    ENOENT: 2,
    ENOEXEC: 8,
    ENOLCK: 37,
    ENOLINK: 67,
    ENOMEM: 12,
    ENOMSG: 42,
    ENOPROTOOPT: 92,
    ENOSPC: 28,
    ENOSR: 63,
    ENOSTR: 60,
    ENOSYS: 38,
    ENOTCONN: 107,
    ENOTDIR: 20,
    ENOTEMPTY: 39,
    ENOTSOCK: 88,
    ENOTSUP: 95,
    ENOTTY: 25,
    ENXIO: 6,
    EOPNOTSUPP: 95,
    EOVERFLOW: 75,
    EPERM: 1,
    EPIPE: 32,
    EPROTO: 71,
    EPROTONOSUPPORT: 93,
    EPROTOTYPE: 91,
    ERANGE: 34,
    EROFS: 30,
    ESPIPE: 29,
    ESRCH: 3,
    ESTALE: 116,
    ETIME: 62,
    ETIMEDOUT: 110,
    ETXTBSY: 26,
    EWOULDBLOCK: 11,
    EXDEV: 18
  };
  var priority = {
    PRIORITY_LOW: 19,
    PRIORITY_BELOW_NORMAL: 10,
    PRIORITY_NORMAL: 0,
    PRIORITY_ABOVE_NORMAL: -7,
    PRIORITY_HIGH: -14,
    PRIORITY_HIGHEST: -20
  };
  var os = {
    // Platform information
    platform() {
      return config.platform;
    },
    arch() {
      return config.arch;
    },
    type() {
      return config.type;
    },
    release() {
      return config.release;
    },
    version() {
      return config.version;
    },
    // Directory information
    homedir() {
      return config.homedir;
    },
    tmpdir() {
      return config.tmpdir;
    },
    // System information
    hostname() {
      return config.hostname;
    },
    // User information
    userInfo(_options) {
      return {
        username: "root",
        uid: 0,
        gid: 0,
        shell: "/bin/bash",
        homedir: config.homedir
      };
    },
    // CPU information
    cpus() {
      return [
        {
          model: "Virtual CPU",
          speed: 2e3,
          times: {
            user: 1e5,
            nice: 0,
            sys: 5e4,
            idle: 8e5,
            irq: 0
          }
        }
      ];
    },
    // Memory information
    totalmem() {
      return 1073741824;
    },
    freemem() {
      return 536870912;
    },
    // System load
    loadavg() {
      return [0.1, 0.1, 0.1];
    },
    // System uptime
    uptime() {
      return 3600;
    },
    // Network interfaces (empty - not supported in sandbox)
    networkInterfaces() {
      return {};
    },
    // System endianness
    endianness() {
      return "LE";
    },
    // Line endings
    EOL: "\n",
    // Dev null path
    devNull: "/dev/null",
    // Machine type
    machine() {
      return config.arch;
    },
    // Constants
    constants: {
      signals,
      errno,
      priority,
      dlopen: {
        RTLD_LAZY: 1,
        RTLD_NOW: 2,
        RTLD_GLOBAL: 256,
        RTLD_LOCAL: 0
      },
      UV_UDP_REUSEADDR: 4
    },
    // Priority getters/setters (stubs)
    getPriority(_pid) {
      return 0;
    },
    setPriority(pid, priority2) {
      void pid;
      void priority2;
    },
    // Parallelism hint
    availableParallelism() {
      return 1;
    }
  };
  globalThis._osModule = os;
  var os_default = os;

  // bridge/child-process.ts
  var child_process_exports = {};
  __export(child_process_exports, {
    ChildProcess: () => ChildProcess,
    default: () => child_process_default,
    exec: () => exec,
    execFile: () => execFile,
    execFileSync: () => execFileSync,
    execSync: () => execSync,
    fork: () => fork,
    spawn: () => spawn,
    spawnSync: () => spawnSync
  });
  var ChildProcess = class {
    _listeners = {};
    _onceListeners = {};
    pid = Math.floor(Math.random() * 1e4) + 1e3;
    killed = false;
    exitCode = null;
    signalCode = null;
    connected = false;
    spawnfile = "";
    spawnargs = [];
    stdin;
    stdout;
    stderr;
    stdio;
    constructor() {
      this.stdin = {
        writable: true,
        _buffer: [],
        write(data) {
          this._buffer.push(data);
          return true;
        },
        end() {
          this.writable = false;
        },
        on() {
          return this;
        },
        once() {
          return this;
        },
        emit() {
          return false;
        }
      };
      this.stdout = {
        readable: true,
        _data: "",
        _listeners: {},
        _onceListeners: {},
        on(event, listener) {
          if (!this._listeners[event]) this._listeners[event] = [];
          this._listeners[event].push(listener);
          return this;
        },
        once(event, listener) {
          if (!this._onceListeners[event]) this._onceListeners[event] = [];
          this._onceListeners[event].push(listener);
          return this;
        },
        emit(event, ...args) {
          if (this._listeners[event]) {
            this._listeners[event].forEach((fn) => fn(...args));
          }
          if (this._onceListeners[event]) {
            this._onceListeners[event].forEach((fn) => fn(...args));
            this._onceListeners[event] = [];
          }
          return true;
        },
        read() {
          return null;
        },
        setEncoding() {
          return this;
        },
        pipe(dest) {
          return dest;
        }
      };
      this.stderr = {
        readable: true,
        _data: "",
        _listeners: {},
        _onceListeners: {},
        on(event, listener) {
          if (!this._listeners[event]) this._listeners[event] = [];
          this._listeners[event].push(listener);
          return this;
        },
        once(event, listener) {
          if (!this._onceListeners[event]) this._onceListeners[event] = [];
          this._onceListeners[event].push(listener);
          return this;
        },
        emit(event, ...args) {
          if (this._listeners[event]) {
            this._listeners[event].forEach((fn) => fn(...args));
          }
          if (this._onceListeners[event]) {
            this._onceListeners[event].forEach((fn) => fn(...args));
            this._onceListeners[event] = [];
          }
          return true;
        },
        read() {
          return null;
        },
        setEncoding() {
          return this;
        },
        pipe(dest) {
          return dest;
        }
      };
      this.stdio = [this.stdin, this.stdout, this.stderr];
    }
    on(event, listener) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(listener);
      return this;
    }
    once(event, listener) {
      if (!this._onceListeners[event]) this._onceListeners[event] = [];
      this._onceListeners[event].push(listener);
      return this;
    }
    off(event, listener) {
      if (this._listeners[event]) {
        const idx = this._listeners[event].indexOf(listener);
        if (idx !== -1) this._listeners[event].splice(idx, 1);
      }
      return this;
    }
    removeListener(event, listener) {
      return this.off(event, listener);
    }
    emit(event, ...args) {
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
    kill(_signal) {
      this.killed = true;
      this.signalCode = typeof _signal === "string" ? _signal : "SIGTERM";
      return true;
    }
    ref() {
      return this;
    }
    unref() {
      return this;
    }
    disconnect() {
      this.connected = false;
    }
    _complete(stdout, stderr, code) {
      this.exitCode = code;
      if (stdout) {
        const buf = typeof Buffer !== "undefined" ? Buffer.from(stdout) : stdout;
        this.stdout.emit("data", buf);
      }
      if (stderr) {
        const buf = typeof Buffer !== "undefined" ? Buffer.from(stderr) : stderr;
        this.stderr.emit("data", buf);
      }
      this.stdout.emit("end");
      this.stderr.emit("end");
      this.emit("close", code, this.signalCode);
      this.emit("exit", code, this.signalCode);
    }
  };
  function exec(command, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    const child = new ChildProcess();
    child.spawnargs = ["bash", "-c", command];
    child.spawnfile = "bash";
    (async () => {
      try {
        const jsonResult = await _childProcessExecRaw.apply(void 0, [command], {
          result: { promise: true }
        });
        const result = JSON.parse(jsonResult);
        const stdout = result.stdout || "";
        const stderr = result.stderr || "";
        const code = result.code || 0;
        child._complete(stdout, stderr, code);
        if (callback) {
          if (code !== 0) {
            const err = new Error("Command failed: " + command);
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
          const error = err instanceof Error ? err : new Error(String(err));
          error.code = 1;
          error.stdout = "";
          error.stderr = errMsg;
          callback(error, "", error.stderr);
        }
      }
    })();
    return child;
  }
  function execSync(command, options) {
    const opts = options || {};
    const jsonResult = _childProcessExecRaw.applySyncPromise(void 0, [command]);
    const result = JSON.parse(jsonResult);
    if (result.code !== 0) {
      const err = new Error("Command failed: " + command);
      err.status = result.code;
      err.stdout = result.stdout;
      err.stderr = result.stderr;
      err.output = [null, result.stdout, result.stderr];
      throw err;
    }
    if (opts.encoding === "buffer" || !opts.encoding) {
      return typeof Buffer !== "undefined" ? Buffer.from(result.stdout) : result.stdout;
    }
    return result.stdout;
  }
  function spawn(command, args, options) {
    let argsArray = [];
    let opts = {};
    if (!Array.isArray(args)) {
      opts = args || {};
    } else {
      argsArray = args;
      opts = options || {};
    }
    const child = new ChildProcess();
    child.spawnfile = command;
    child.spawnargs = [command, ...argsArray];
    const useShell = opts.shell || false;
    (async () => {
      try {
        let jsonResult;
        if (useShell || command === "bash" || command === "sh") {
          const fullCmd = [command, ...argsArray].join(" ");
          jsonResult = await _childProcessExecRaw.apply(void 0, [fullCmd], {
            result: { promise: true }
          });
        } else {
          jsonResult = await _childProcessSpawnRaw.apply(
            void 0,
            [command, JSON.stringify(argsArray)],
            { result: { promise: true } }
          );
        }
        const result = JSON.parse(jsonResult);
        child._complete(result.stdout || "", result.stderr || "", result.code || 0);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        child._complete("", errMsg, 1);
        child.emit("error", err);
      }
    })();
    return child;
  }
  function spawnSync(command, args, options) {
    let argsArray = [];
    if (!Array.isArray(args)) {
    } else {
      argsArray = args;
    }
    try {
      const jsonResult = _childProcessSpawnRaw.applySyncPromise(void 0, [
        command,
        JSON.stringify(argsArray)
      ]);
      const result = JSON.parse(jsonResult);
      const stdoutBuf = typeof Buffer !== "undefined" ? Buffer.from(result.stdout) : result.stdout;
      const stderrBuf = typeof Buffer !== "undefined" ? Buffer.from(result.stderr) : result.stderr;
      return {
        pid: Math.floor(Math.random() * 1e4) + 1e3,
        output: [null, stdoutBuf, stderrBuf],
        stdout: stdoutBuf,
        stderr: stderrBuf,
        status: result.code,
        signal: null,
        error: void 0
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const stderrBuf = typeof Buffer !== "undefined" ? Buffer.from(errMsg) : errMsg;
      return {
        pid: 0,
        output: [null, "", stderrBuf],
        stdout: typeof Buffer !== "undefined" ? Buffer.from("") : "",
        stderr: stderrBuf,
        status: 1,
        signal: null,
        error: err instanceof Error ? err : new Error(String(err))
      };
    }
  }
  function execFile(file, args, options, callback) {
    let argsArray = [];
    let opts = {};
    let cb;
    if (typeof args === "function") {
      cb = args;
    } else if (typeof options === "function") {
      argsArray = args.slice();
      cb = options;
    } else {
      argsArray = Array.isArray(args) ? args : [];
      opts = options || {};
      cb = callback;
    }
    const child = spawn(file, argsArray, opts);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.on("close", (code) => {
      if (cb) {
        if (code !== 0) {
          const err = new Error("Command failed: " + file);
          err.code = code;
          err.stdout = stdout;
          err.stderr = stderr;
          cb(err, stdout, stderr);
        } else {
          cb(null, stdout, stderr);
        }
      }
    });
    child.on("error", (err) => {
      if (cb) {
        cb(err, stdout, stderr);
      }
    });
    return child;
  }
  function execFileSync(file, args, options) {
    let argsArray = [];
    let opts = {};
    if (!Array.isArray(args)) {
      opts = args || {};
    } else {
      argsArray = args;
      opts = options || {};
    }
    const result = spawnSync(file, argsArray, opts);
    if (result.status !== 0) {
      const err = new Error("Command failed: " + file);
      err.status = result.status ?? void 0;
      err.stdout = String(result.stdout);
      err.stderr = String(result.stderr);
      throw err;
    }
    if (opts.encoding === "buffer" || !opts.encoding) {
      return result.stdout;
    }
    return typeof result.stdout === "string" ? result.stdout : result.stdout.toString(opts.encoding);
  }
  function fork(modulePath, args, options) {
    let argsArray = [];
    let opts = {};
    if (!Array.isArray(args)) {
      opts = args || {};
    } else {
      argsArray = args;
      opts = options || {};
    }
    const child = spawn("node", [modulePath, ...argsArray], {
      ...opts,
      stdio: opts.stdio || "pipe"
    });
    child.send = function(_message, sendHandle, _options, callback) {
      if (typeof sendHandle === "function") {
        callback = sendHandle;
      }
      if (callback) callback(null);
      return true;
    };
    child.connected = true;
    return child;
  }
  var childProcess = {
    ChildProcess,
    exec,
    execSync,
    spawn,
    spawnSync,
    execFile,
    execFileSync,
    fork
  };
  globalThis._childProcessModule = childProcess;
  var child_process_default = childProcess;

  // bridge/network.ts
  var network_exports = {};
  __export(network_exports, {
    ClientRequest: () => ClientRequest,
    Headers: () => Headers,
    IncomingMessage: () => IncomingMessage,
    Request: () => Request,
    Response: () => Response,
    default: () => network_default,
    dns: () => dns,
    fetch: () => fetch,
    http: () => http,
    https: () => https
  });
  async function fetch(url, options = {}) {
    const optionsJson = JSON.stringify({
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body || null
    });
    const responseJson = await _networkFetchRaw.apply(void 0, [String(url), optionsJson], {
      result: { promise: true }
    });
    const response = JSON.parse(responseJson);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: new Map(Object.entries(response.headers || {})),
      url: response.url || String(url),
      redirected: response.redirected || false,
      type: "basic",
      async text() {
        return response.body || "";
      },
      async json() {
        return JSON.parse(response.body || "{}");
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
      async blob() {
        throw new Error("Blob not supported in sandbox");
      },
      clone() {
        return { ...this };
      }
    };
  }
  var Headers = class _Headers {
    _headers = {};
    constructor(init) {
      if (init && init !== null) {
        if (init instanceof _Headers) {
          this._headers = { ...init._headers };
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => {
            this._headers[key.toLowerCase()] = value;
          });
        } else if (typeof init === "object") {
          Object.entries(init).forEach(([key, value]) => {
            this._headers[key.toLowerCase()] = value;
          });
        }
      }
    }
    get(name) {
      return this._headers[name.toLowerCase()] || null;
    }
    set(name, value) {
      this._headers[name.toLowerCase()] = value;
    }
    has(name) {
      return name.toLowerCase() in this._headers;
    }
    delete(name) {
      delete this._headers[name.toLowerCase()];
    }
    entries() {
      return Object.entries(this._headers)[Symbol.iterator]();
    }
    keys() {
      return Object.keys(this._headers)[Symbol.iterator]();
    }
    values() {
      return Object.values(this._headers)[Symbol.iterator]();
    }
    forEach(callback) {
      Object.entries(this._headers).forEach(([k, v]) => callback(v, k, this));
    }
  };
  var Request = class _Request {
    url;
    method;
    headers;
    body;
    mode;
    credentials;
    cache;
    redirect;
    referrer;
    integrity;
    constructor(input, init = {}) {
      this.url = typeof input === "string" ? input : input.url;
      this.method = init.method || (typeof input !== "string" ? input.method : void 0) || "GET";
      this.headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : void 0));
      this.body = init.body || null;
      this.mode = init.mode || "cors";
      this.credentials = init.credentials || "same-origin";
      this.cache = init.cache || "default";
      this.redirect = init.redirect || "follow";
      this.referrer = init.referrer || "about:client";
      this.integrity = init.integrity || "";
    }
    clone() {
      return new _Request(this.url, this);
    }
  };
  var Response = class _Response {
    _body;
    status;
    statusText;
    headers;
    ok;
    type;
    url;
    redirected;
    constructor(body, init = {}) {
      this._body = body || null;
      this.status = init.status || 200;
      this.statusText = init.statusText || "OK";
      this.headers = new Headers(init.headers);
      this.ok = this.status >= 200 && this.status < 300;
      this.type = "default";
      this.url = "";
      this.redirected = false;
    }
    async text() {
      return String(this._body || "");
    }
    async json() {
      return JSON.parse(this._body || "{}");
    }
    clone() {
      return new _Response(this._body, this);
    }
    static error() {
      return new _Response(null, { status: 0, statusText: "" });
    }
    static redirect(url, status = 302) {
      return new _Response(null, { status, headers: { Location: url } });
    }
  };
  var dns = {
    lookup(hostname, options, callback) {
      let cb = callback;
      if (typeof options === "function") {
        cb = options;
      }
      _networkDnsLookupRaw.apply(void 0, [hostname], { result: { promise: true } }).then((resultJson) => {
        const result = JSON.parse(resultJson);
        if (result.error) {
          const err = new Error(result.error);
          err.code = result.code || "ENOTFOUND";
          cb?.(err);
        } else {
          cb?.(null, result.address, result.family);
        }
      }).catch((err) => {
        cb?.(err);
      });
    },
    resolve(hostname, rrtype, callback) {
      let cb = callback;
      if (typeof rrtype === "function") {
        cb = rrtype;
      }
      dns.lookup(hostname, (err, address) => {
        if (err) {
          cb?.(err);
        } else {
          cb?.(null, address ? [address] : []);
        }
      });
    },
    resolve4(hostname, callback) {
      dns.resolve(hostname, "A", callback);
    },
    resolve6(hostname, callback) {
      dns.resolve(hostname, "AAAA", callback);
    },
    promises: {
      lookup(hostname, _options) {
        return new Promise((resolve, reject) => {
          dns.lookup(hostname, _options, (err, address, family) => {
            if (err) reject(err);
            else resolve({ address: address || "", family: family || 4 });
          });
        });
      },
      resolve(hostname, rrtype) {
        return new Promise((resolve, reject) => {
          dns.resolve(hostname, rrtype || "A", (err, addresses) => {
            if (err) reject(err);
            else resolve(addresses || []);
          });
        });
      }
    }
  };
  var IncomingMessage = class {
    headers;
    rawHeaders;
    trailers;
    rawTrailers;
    httpVersion;
    httpVersionMajor;
    httpVersionMinor;
    method;
    url;
    statusCode;
    statusMessage;
    _body;
    _listeners;
    complete;
    aborted;
    socket;
    _bodyConsumed;
    _ended;
    _flowing;
    readable;
    readableEnded;
    readableFlowing;
    destroyed;
    _encoding;
    constructor(response) {
      this.headers = response?.headers || {};
      this.rawHeaders = [];
      if (this.headers && typeof this.headers === "object") {
        Object.entries(this.headers).forEach(([k, v]) => {
          this.rawHeaders.push(k, v);
        });
      }
      this.trailers = {};
      this.rawTrailers = [];
      this.httpVersion = "1.1";
      this.httpVersionMajor = 1;
      this.httpVersionMinor = 1;
      this.method = null;
      this.url = response?.url || "";
      this.statusCode = response?.status;
      this.statusMessage = response?.statusText;
      this._body = response?.body || "";
      this._listeners = {};
      this.complete = false;
      this.aborted = false;
      this.socket = null;
      this._bodyConsumed = false;
      this._ended = false;
      this._flowing = false;
      this.readable = true;
      this.readableEnded = false;
      this.readableFlowing = null;
      this.destroyed = false;
    }
    on(event, listener) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(listener);
      if (event === "data" && !this._bodyConsumed && this._body) {
        this._flowing = true;
        this.readableFlowing = true;
        Promise.resolve().then(() => {
          if (!this._bodyConsumed) {
            this._bodyConsumed = true;
            const buf = typeof Buffer !== "undefined" ? Buffer.from(this._body) : this._body;
            this.emit("data", buf);
            Promise.resolve().then(() => {
              if (!this._ended) {
                this._ended = true;
                this.complete = true;
                this.readable = false;
                this.readableEnded = true;
                this.emit("end");
              }
            });
          }
        });
      }
      if (event === "end" && this._bodyConsumed && !this._ended) {
        Promise.resolve().then(() => {
          if (!this._ended) {
            this._ended = true;
            this.complete = true;
            this.readable = false;
            this.readableEnded = true;
            listener();
          }
        });
      }
      return this;
    }
    once(event, listener) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        listener(...args);
      };
      wrapper._originalListener = listener;
      return this.on(event, wrapper);
    }
    off(event, listener) {
      if (this._listeners[event]) {
        const idx = this._listeners[event].findIndex(
          (fn) => fn === listener || fn._originalListener === listener
        );
        if (idx !== -1) this._listeners[event].splice(idx, 1);
      }
      return this;
    }
    removeListener(event, listener) {
      return this.off(event, listener);
    }
    removeAllListeners(event) {
      if (event) {
        delete this._listeners[event];
      } else {
        this._listeners = {};
      }
      return this;
    }
    emit(event, ...args) {
      const handlers = this._listeners[event];
      if (handlers) {
        handlers.slice().forEach((fn) => fn(...args));
      }
      return handlers !== void 0 && handlers.length > 0;
    }
    setEncoding(encoding) {
      this._encoding = encoding;
      return this;
    }
    read(_size) {
      if (this._bodyConsumed) return null;
      this._bodyConsumed = true;
      const buf = typeof Buffer !== "undefined" ? Buffer.from(this._body) : this._body;
      Promise.resolve().then(() => {
        if (!this._ended) {
          this._ended = true;
          this.complete = true;
          this.readable = false;
          this.readableEnded = true;
          this.emit("end");
        }
      });
      return buf;
    }
    pipe(dest) {
      const buf = typeof Buffer !== "undefined" ? Buffer.from(this._body || "") : this._body || "";
      if (typeof dest.write === "function" && (typeof buf === "string" ? buf.length : buf.length) > 0) {
        dest.write(buf);
      }
      if (typeof dest.end === "function") {
        Promise.resolve().then(() => dest.end());
      }
      this._bodyConsumed = true;
      this._ended = true;
      this.complete = true;
      this.readable = false;
      this.readableEnded = true;
      return dest;
    }
    pause() {
      this._flowing = false;
      this.readableFlowing = false;
      return this;
    }
    resume() {
      this._flowing = true;
      this.readableFlowing = true;
      if (!this._bodyConsumed && this._body) {
        Promise.resolve().then(() => {
          if (!this._bodyConsumed) {
            this._bodyConsumed = true;
            const buf = typeof Buffer !== "undefined" ? Buffer.from(this._body) : this._body;
            this.emit("data", buf);
            Promise.resolve().then(() => {
              if (!this._ended) {
                this._ended = true;
                this.complete = true;
                this.readable = false;
                this.readableEnded = true;
                this.emit("end");
              }
            });
          }
        });
      }
      return this;
    }
    unpipe(_dest) {
      return this;
    }
    destroy(err) {
      this.destroyed = true;
      this.readable = false;
      if (err) this.emit("error", err);
      this.emit("close");
      return this;
    }
    [Symbol.asyncIterator]() {
      const self = this;
      let dataEmitted = false;
      let ended = false;
      return {
        async next() {
          if (ended || self._ended) {
            return { done: true, value: void 0 };
          }
          if (!dataEmitted && !self._bodyConsumed) {
            dataEmitted = true;
            self._bodyConsumed = true;
            const buf = typeof Buffer !== "undefined" ? Buffer.from(self._body || "") : self._body || "";
            return { done: false, value: buf };
          }
          ended = true;
          self._ended = true;
          self.complete = true;
          self.readable = false;
          self.readableEnded = true;
          return { done: true, value: void 0 };
        },
        return() {
          ended = true;
          return Promise.resolve({ done: true, value: void 0 });
        },
        throw(err) {
          ended = true;
          self.emit("error", err);
          return Promise.resolve({ done: true, value: void 0 });
        }
      };
    }
  };
  var ClientRequest = class {
    _options;
    _callback;
    _listeners = {};
    _body = "";
    _ended = false;
    socket = null;
    finished = false;
    aborted = false;
    constructor(options, callback) {
      this._options = options;
      this._callback = callback;
      Promise.resolve().then(() => this._execute());
    }
    async _execute() {
      try {
        const url = this._buildUrl();
        const optionsJson = JSON.stringify({
          method: this._options.method || "GET",
          headers: this._options.headers || {},
          body: this._body || null
        });
        const responseJson = await _networkHttpRequestRaw.apply(void 0, [url, optionsJson], {
          result: { promise: true }
        });
        const response = JSON.parse(responseJson);
        const res = new IncomingMessage(response);
        this.finished = true;
        if (this._callback) {
          this._callback(res);
        }
        this._emit("response", res);
      } catch (err) {
        this._emit("error", err);
      }
    }
    _buildUrl() {
      const opts = this._options;
      const protocol = opts.protocol || (opts.port === 443 ? "https:" : "http:");
      const host = opts.hostname || opts.host || "localhost";
      const port = opts.port ? ":" + opts.port : "";
      const path = opts.path || "/";
      return protocol + "//" + host + port + path;
    }
    on(event, listener) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(listener);
      return this;
    }
    once(event, listener) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        listener(...args);
      };
      return this.on(event, wrapper);
    }
    off(event, listener) {
      if (this._listeners[event]) {
        const idx = this._listeners[event].indexOf(listener);
        if (idx !== -1) this._listeners[event].splice(idx, 1);
      }
      return this;
    }
    _emit(event, ...args) {
      if (this._listeners[event]) {
        this._listeners[event].forEach((fn) => fn(...args));
      }
    }
    write(data) {
      this._body += data;
      return true;
    }
    end(data) {
      if (data) this._body += data;
      this._ended = true;
      return this;
    }
    abort() {
      this.aborted = true;
    }
    setTimeout(_timeout) {
      return this;
    }
    setNoDelay() {
      return this;
    }
    setSocketKeepAlive() {
      return this;
    }
    flushHeaders() {
    }
  };
  var Agent = class {
    constructor() {
    }
  };
  function createHttpModule(_protocol) {
    return {
      request(options, callback) {
        let opts;
        if (typeof options === "string") {
          const url = new URL(options);
          opts = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search
          };
        } else if (options instanceof URL) {
          opts = {
            protocol: options.protocol,
            hostname: options.hostname,
            port: options.port,
            path: options.pathname + options.search
          };
        } else {
          opts = options;
        }
        return new ClientRequest(opts, callback);
      },
      get(options, callback) {
        let opts;
        if (typeof options === "string") {
          const url = new URL(options);
          opts = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: "GET"
          };
        } else if (options instanceof URL) {
          opts = {
            protocol: options.protocol,
            hostname: options.hostname,
            port: options.port,
            path: options.pathname + options.search,
            method: "GET"
          };
        } else {
          opts = { ...options, method: "GET" };
        }
        const req = new ClientRequest(opts, callback);
        req.end();
        return req;
      },
      createServer() {
        throw new Error("http.createServer is not supported in sandbox");
      },
      Agent,
      globalAgent: {},
      IncomingMessage,
      ClientRequest,
      METHODS: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      STATUS_CODES: {
        200: "OK",
        201: "Created",
        204: "No Content",
        301: "Moved Permanently",
        302: "Found",
        304: "Not Modified",
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        500: "Internal Server Error"
      }
    };
  }
  var http = createHttpModule("http");
  var https = createHttpModule("https");
  globalThis._httpModule = http;
  globalThis._httpsModule = https;
  globalThis._dnsModule = dns;
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
  var network_default = {
    fetch,
    Headers,
    Request,
    Response,
    dns,
    http,
    https,
    IncomingMessage,
    ClientRequest
  };

  // bridge/process.ts
  var config2 = {
    platform: typeof _processConfig !== "undefined" && _processConfig.platform || "linux",
    arch: typeof _processConfig !== "undefined" && _processConfig.arch || "x64",
    version: typeof _processConfig !== "undefined" && _processConfig.version || "v22.0.0",
    cwd: typeof _processConfig !== "undefined" && _processConfig.cwd || "/",
    env: typeof _processConfig !== "undefined" && _processConfig.env || {},
    argv: typeof _processConfig !== "undefined" && _processConfig.argv || [
      "node",
      "script.js"
    ],
    execPath: typeof _processConfig !== "undefined" && _processConfig.execPath || "/usr/bin/node"
  };
  var _processStartTime = Date.now();
  var _exitCode = 0;
  var _exited = false;
  var ProcessExitError = class extends Error {
    code;
    constructor(code) {
      super("process.exit(" + code + ")");
      this.name = "ProcessExitError";
      this.code = code;
    }
  };
  globalThis.ProcessExitError = ProcessExitError;
  var _processListeners = {};
  var _processOnceListeners = {};
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
    if (_processListeners[event]) {
      for (const listener of _processListeners[event]) {
        listener(...args);
        handled = true;
      }
    }
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
  var _stdout = {
    write(data) {
      if (typeof _log !== "undefined") {
        _log.applySync(void 0, [String(data).replace(/\n$/, "")]);
      }
      return true;
    },
    end() {
      return this;
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return false;
    },
    writable: true,
    isTTY: false,
    columns: 80,
    rows: 24
  };
  var _stderr = {
    write(data) {
      if (typeof _error !== "undefined") {
        _error.applySync(void 0, [String(data).replace(/\n$/, "")]);
      }
      return true;
    },
    end() {
      return this;
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return false;
    },
    writable: true,
    isTTY: false,
    columns: 80,
    rows: 24
  };
  var _stdin = {
    readable: true,
    paused: true,
    encoding: null,
    read() {
      return null;
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return false;
    },
    pause() {
      this.paused = true;
      return this;
    },
    resume() {
      this.paused = false;
      return this;
    },
    setEncoding(enc) {
      this.encoding = enc;
      return this;
    },
    isTTY: false
  };
  function hrtime(prev) {
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const seconds = Math.floor(now / 1e3);
    const nanoseconds = Math.floor(now % 1e3 * 1e6);
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
  hrtime.bigint = function() {
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return BigInt(Math.floor(now * 1e6));
  };
  var _cwd = config2.cwd;
  var _umask = 18;
  var process = {
    // Static properties
    platform: config2.platform,
    arch: config2.arch,
    version: config2.version,
    versions: {
      node: config2.version.replace(/^v/, ""),
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
      unicode: "15.0"
    },
    pid: 1,
    ppid: 0,
    execPath: config2.execPath,
    execArgv: [],
    argv: config2.argv,
    argv0: config2.argv[0] || "node",
    title: "node",
    env: config2.env,
    // Config stubs
    config: {
      target_defaults: {
        cflags: [],
        default_configuration: "Release",
        defines: [],
        include_dirs: [],
        libraries: []
      },
      variables: {
        node_prefix: "/usr",
        node_shared_libuv: false
      }
    },
    release: {
      name: "node",
      sourceUrl: "https://nodejs.org/download/release/v20.0.0/node-v20.0.0.tar.gz",
      headersUrl: "https://nodejs.org/download/release/v20.0.0/node-v20.0.0-headers.tar.gz"
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
    cwd() {
      return _cwd;
    },
    chdir(dir) {
      _cwd = dir;
    },
    get exitCode() {
      return _exitCode;
    },
    set exitCode(code) {
      _exitCode = code ?? 0;
    },
    exit(code) {
      const exitCode = code !== void 0 ? code : _exitCode;
      _exitCode = exitCode;
      _exited = true;
      try {
        _emit("exit", exitCode);
      } catch (_e) {
      }
      throw new ProcessExitError(exitCode);
    },
    abort() {
      return process.exit(1);
    },
    nextTick(callback, ...args) {
      if (typeof queueMicrotask === "function") {
        queueMicrotask(() => callback(...args));
      } else {
        Promise.resolve().then(() => callback(...args));
      }
    },
    hrtime,
    getuid() {
      return 0;
    },
    getgid() {
      return 0;
    },
    geteuid() {
      return 0;
    },
    getegid() {
      return 0;
    },
    getgroups() {
      return [0];
    },
    setuid() {
    },
    setgid() {
    },
    seteuid() {
    },
    setegid() {
    },
    setgroups() {
    },
    umask(mask) {
      const oldMask = _umask;
      if (mask !== void 0) {
        _umask = mask;
      }
      return oldMask;
    },
    uptime() {
      return (Date.now() - _processStartTime) / 1e3;
    },
    memoryUsage() {
      return {
        rss: 50 * 1024 * 1024,
        heapTotal: 20 * 1024 * 1024,
        heapUsed: 10 * 1024 * 1024,
        external: 1 * 1024 * 1024,
        arrayBuffers: 500 * 1024
      };
    },
    cpuUsage(prev) {
      const usage = {
        user: 1e6,
        system: 5e5
      };
      if (prev) {
        return {
          user: usage.user - prev.user,
          system: usage.system - prev.system
        };
      }
      return usage;
    },
    resourceUsage() {
      return {
        userCPUTime: 1e6,
        systemCPUTime: 5e5,
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
    kill(pid, signal) {
      if (pid !== process.pid) {
        const err = new Error("Operation not permitted");
        err.code = "EPERM";
        err.errno = -1;
        err.syscall = "kill";
        throw err;
      }
      if (!signal || signal === "SIGTERM" || signal === 15) {
        process.exit(143);
      }
      return true;
    },
    // EventEmitter methods
    on(event, listener) {
      return _addListener(event, listener);
    },
    once(event, listener) {
      return _addListener(event, listener, true);
    },
    removeListener(event, listener) {
      return _removeListener(event, listener);
    },
    // off is an alias for removeListener (assigned below to be same reference)
    off: null,
    removeAllListeners(event) {
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
    addListener(event, listener) {
      return _addListener(event, listener);
    },
    emit(event, ...args) {
      return _emit(event, ...args);
    },
    listeners(event) {
      return [
        ..._processListeners[event] || [],
        ..._processOnceListeners[event] || []
      ];
    },
    listenerCount(event) {
      return (_processListeners[event] || []).length + (_processOnceListeners[event] || []).length;
    },
    prependListener(event, listener) {
      if (!_processListeners[event]) {
        _processListeners[event] = [];
      }
      _processListeners[event].unshift(listener);
      return process;
    },
    prependOnceListener(event, listener) {
      if (!_processOnceListeners[event]) {
        _processOnceListeners[event] = [];
      }
      _processOnceListeners[event].unshift(listener);
      return process;
    },
    eventNames() {
      return [
        .../* @__PURE__ */ new Set([
          ...Object.keys(_processListeners),
          ...Object.keys(_processOnceListeners)
        ])
      ];
    },
    setMaxListeners() {
      return process;
    },
    getMaxListeners() {
      return 10;
    },
    rawListeners(event) {
      return process.listeners(event);
    },
    // Stdio streams
    stdout: _stdout,
    stderr: _stderr,
    stdin: _stdin,
    // Process state
    connected: false,
    // Module info (will be set by createRequire)
    mainModule: void 0,
    // No-op methods for compatibility
    emitWarning(warning) {
      const msg = typeof warning === "string" ? warning : warning.message;
      _emit("warning", { message: msg, name: "Warning" });
    },
    binding(name) {
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
    _linkedBinding(name) {
      return process.binding(name);
    },
    dlopen() {
      throw new Error("process.dlopen is not supported");
    },
    hasUncaughtExceptionCaptureCallback() {
      return false;
    },
    setUncaughtExceptionCaptureCallback() {
    },
    // Send for IPC (no-op)
    send() {
      return false;
    },
    disconnect() {
    },
    // Report
    report: {
      directory: "",
      filename: "",
      compact: false,
      signal: "SIGUSR2",
      reportOnFatalError: false,
      reportOnSignal: false,
      reportOnUncaughtException: false,
      getReport() {
        return {};
      },
      writeReport() {
        return "";
      }
    },
    // Debug port
    debugPort: 9229,
    // Internal state
    _cwd: config2.cwd,
    _umask: 18
  };
  process.off = process.removeListener;
  process.memoryUsage.rss = function() {
    return 50 * 1024 * 1024;
  };
  var process_default = process;
  var _timerId = 0;
  var _timers = /* @__PURE__ */ new Map();
  var _intervals = /* @__PURE__ */ new Map();
  var _queueMicrotask = typeof queueMicrotask === "function" ? queueMicrotask : function(fn) {
    Promise.resolve().then(fn);
  };
  var TimerHandle = class {
    _id;
    _destroyed;
    constructor(id) {
      this._id = id;
      this._destroyed = false;
    }
    ref() {
      return this;
    }
    unref() {
      return this;
    }
    hasRef() {
      return true;
    }
    refresh() {
      return this;
    }
    [Symbol.toPrimitive]() {
      return this._id;
    }
  };
  function setTimeout2(callback, _delay, ...args) {
    const id = ++_timerId;
    const handle = new TimerHandle(id);
    _queueMicrotask(() => {
      if (_timers.has(id)) {
        _timers.delete(id);
        try {
          callback(...args);
        } catch (_e) {
        }
      }
    });
    _timers.set(id, handle);
    return handle;
  }
  function clearTimeout(timer) {
    const id = timer && typeof timer === "object" && timer._id !== void 0 ? timer._id : timer;
    _timers.delete(id);
  }
  function setInterval(callback, _delay, ...args) {
    const id = ++_timerId;
    const handle = new TimerHandle(id);
    _intervals.set(id, handle);
    _queueMicrotask(() => {
      if (_intervals.has(id)) {
        try {
          callback(...args);
        } catch (_e) {
        }
      }
    });
    return handle;
  }
  function clearInterval(timer) {
    const id = timer && typeof timer === "object" && timer._id !== void 0 ? timer._id : timer;
    _intervals.delete(id);
  }
  function setImmediate(callback, ...args) {
    return setTimeout2(callback, 0, ...args);
  }
  function clearImmediate(id) {
    clearTimeout(id);
  }
  var URL2 = class _URL {
    href;
    protocol;
    host;
    hostname;
    port;
    pathname;
    search;
    hash;
    origin;
    searchParams;
    constructor(url, base) {
      let urlStr = typeof url === "object" && url !== null && typeof url.toString === "function" ? url.toString() : String(url);
      let fullUrl = urlStr;
      if (base) {
        const baseStr = typeof base === "object" && base !== null && typeof base.toString === "function" ? base.toString() : String(base);
        let isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr);
        if (urlStr.startsWith("file:") && !urlStr.startsWith("file://")) {
          isAbsolute = false;
          urlStr = urlStr.slice(5);
        }
        if (!isAbsolute) {
          if (baseStr.startsWith("file://")) {
            let basePath = baseStr.slice(7);
            let resolvedPath;
            if (urlStr.startsWith("/")) {
              resolvedPath = urlStr;
            } else {
              let baseDir = basePath;
              if (!baseDir.endsWith("/")) {
                const lastSlash = baseDir.lastIndexOf("/");
                baseDir = lastSlash >= 0 ? baseDir.slice(0, lastSlash + 1) : "/";
              }
              const combined = baseDir + urlStr;
              const parts = combined.split("/");
              const normalized = [];
              for (const part of parts) {
                if (part === "..") {
                  normalized.pop();
                } else if (part !== "." && part !== "") {
                  normalized.push(part);
                }
              }
              resolvedPath = "/" + normalized.join("/");
            }
            fullUrl = "file://" + resolvedPath;
          } else {
            const baseUrl = new _URL(baseStr);
            if (urlStr.startsWith("/")) {
              fullUrl = baseUrl.origin + urlStr;
            } else {
              fullUrl = baseStr.replace(/[^/]*$/, "") + urlStr;
            }
          }
        }
      }
      let match = fullUrl.match(
        /^(https?:)\/\/([^/:]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/
      );
      if (!match) {
        const fileMatch = fullUrl.match(/^file:\/\/(\/?[^?#]*)?(\?[^#]*)?(#.*)?$/);
        if (fileMatch) {
          this.protocol = "file:";
          this.host = "";
          this.hostname = "";
          this.port = "";
          this.pathname = fileMatch[1] || "/";
          this.search = fileMatch[2] || "";
          this.hash = fileMatch[3] || "";
          this.origin = "null";
          this.href = "file://" + this.pathname + this.search + this.hash;
          this.searchParams = new URLSearchParams(this.search);
          return;
        }
        const bareFileMatch = fullUrl.match(/^file:(\/?[^?#]*)?(\?[^#]*)?(#.*)?$/);
        if (bareFileMatch) {
          this.protocol = "file:";
          this.host = "";
          this.hostname = "";
          this.port = "";
          this.pathname = bareFileMatch[1] || "/";
          this.search = bareFileMatch[2] || "";
          this.hash = bareFileMatch[3] || "";
          this.origin = "null";
          this.href = "file://" + this.pathname + this.search + this.hash;
          this.searchParams = new URLSearchParams(this.search);
          return;
        }
        throw new TypeError("Invalid URL: " + urlStr);
      }
      this.href = fullUrl;
      this.protocol = match[1] || "";
      this.host = match[2] + (match[3] ? ":" + match[3] : "");
      this.hostname = match[2] || "";
      this.port = match[3] || "";
      this.pathname = match[4] || "/";
      this.search = match[5] || "";
      this.hash = match[6] || "";
      this.origin = this.protocol + "//" + this.host;
      this.searchParams = new URLSearchParams(this.search);
    }
    toString() {
      return this.href;
    }
    toJSON() {
      return this.href;
    }
  };
  var URLSearchParams = class _URLSearchParams {
    _params;
    constructor(init) {
      this._params = /* @__PURE__ */ new Map();
      if (typeof init === "string") {
        const params = init.startsWith("?") ? init.slice(1) : init;
        for (const pair of params.split("&")) {
          const [key, value] = pair.split("=").map(decodeURIComponent);
          if (key) this._params.set(key, value || "");
        }
      } else if (init && typeof init === "object") {
        if (init instanceof _URLSearchParams) {
          for (const [key, value] of init.entries()) {
            this._params.set(key, value);
          }
        } else {
          for (const [key, value] of Object.entries(init)) {
            this._params.set(key, value);
          }
        }
      }
    }
    get(key) {
      return this._params.get(key) || null;
    }
    set(key, value) {
      this._params.set(key, value);
    }
    has(key) {
      return this._params.has(key);
    }
    delete(key) {
      this._params.delete(key);
    }
    append(key, value) {
      this._params.set(key, value);
    }
    toString() {
      return Array.from(this._params.entries()).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
    }
    *entries() {
      yield* this._params.entries();
    }
    *keys() {
      yield* this._params.keys();
    }
    *values() {
      yield* this._params.values();
    }
    forEach(cb) {
      this._params.forEach((value, key) => cb(value, key, this));
    }
    [Symbol.iterator]() {
      return this._params[Symbol.iterator]();
    }
  };
  var TextEncoder = class {
    encoding = "utf-8";
    encode(str) {
      const utf8 = [];
      for (let i = 0; i < str.length; i++) {
        let charCode = str.charCodeAt(i);
        if (charCode < 128) {
          utf8.push(charCode);
        } else if (charCode < 2048) {
          utf8.push(192 | charCode >> 6, 128 | charCode & 63);
        } else if (charCode < 55296 || charCode >= 57344) {
          utf8.push(
            224 | charCode >> 12,
            128 | charCode >> 6 & 63,
            128 | charCode & 63
          );
        } else {
          i++;
          charCode = 65536 + ((charCode & 1023) << 10 | str.charCodeAt(i) & 1023);
          utf8.push(
            240 | charCode >> 18,
            128 | charCode >> 12 & 63,
            128 | charCode >> 6 & 63,
            128 | charCode & 63
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
  var TextDecoder2 = class {
    _encoding;
    constructor(encoding) {
      this._encoding = encoding || "utf-8";
    }
    get encoding() {
      return this._encoding;
    }
    decode(input) {
      if (!input) return "";
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      let result = "";
      let i = 0;
      while (i < bytes.length) {
        const byte = bytes[i];
        if (byte < 128) {
          result += String.fromCharCode(byte);
          i++;
        } else if ((byte & 224) === 192) {
          result += String.fromCharCode(
            (byte & 31) << 6 | bytes[i + 1] & 63
          );
          i += 2;
        } else if ((byte & 240) === 224) {
          result += String.fromCharCode(
            (byte & 15) << 12 | (bytes[i + 1] & 63) << 6 | bytes[i + 2] & 63
          );
          i += 3;
        } else if ((byte & 248) === 240) {
          const codePoint = (byte & 7) << 18 | (bytes[i + 1] & 63) << 12 | (bytes[i + 2] & 63) << 6 | bytes[i + 3] & 63;
          const offset = codePoint - 65536;
          result += String.fromCharCode(
            55296 + (offset >> 10),
            56320 + (offset & 1023)
          );
          i += 4;
        } else {
          result += "?";
          i++;
        }
      }
      return result;
    }
  };
  var Buffer3 = class _Buffer extends Uint8Array {
    static isBuffer(obj) {
      return obj instanceof _Buffer || obj instanceof Uint8Array;
    }
    static from(value, _encodingOrOffset, _length) {
      if (typeof value === "string") {
        const encoder = new TextEncoder();
        const arr = encoder.encode(value);
        return new _Buffer(arr);
      }
      if (ArrayBuffer.isView(value)) {
        return new _Buffer(value.buffer, value.byteOffset, value.byteLength);
      }
      if (value instanceof ArrayBuffer) {
        return new _Buffer(value);
      }
      if (Array.isArray(value)) {
        return new _Buffer(value);
      }
      return new _Buffer(0);
    }
    static alloc(size, fill, _encoding) {
      const buf = new _Buffer(size);
      if (fill !== void 0) {
        buf.fill(typeof fill === "number" ? fill : 0);
      }
      return buf;
    }
    static allocUnsafe(size) {
      return new _Buffer(size);
    }
    static concat(list, totalLength) {
      if (totalLength === void 0) {
        totalLength = list.reduce((acc, buf) => acc + buf.length, 0);
      }
      const result = new _Buffer(totalLength);
      let offset = 0;
      for (const buf of list) {
        result.set(buf, offset);
        offset += buf.length;
      }
      return result;
    }
    static byteLength(string, _encoding) {
      if (typeof string !== "string") {
        return string.length;
      }
      const encoder = new TextEncoder();
      return encoder.encode(string).length;
    }
    toString(encoding, start, end) {
      const decoder = new TextDecoder2(
        encoding === "utf8" || encoding === "utf-8" ? "utf-8" : "utf-8"
      );
      const slice = start !== void 0 || end !== void 0 ? this.subarray(start || 0, end) : this;
      return decoder.decode(slice);
    }
    write(string, offset, length, _encoding) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(string);
      const writeLen = Math.min(
        bytes.length,
        length !== void 0 ? length : this.length - (offset || 0)
      );
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
      return new _Buffer(
        this.buffer,
        this.byteOffset + (start || 0),
        (end !== void 0 ? end : this.length) - (start || 0)
      );
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
    fill(value, start, end, _encoding) {
      start = start || 0;
      end = end !== void 0 ? end : this.length;
      const fillValue = typeof value === "number" ? value : 0;
      for (let i = start; i < end; i++) {
        this[i] = fillValue;
      }
      return this;
    }
  };
  var cryptoPolyfill = {
    getRandomValues(array) {
      const bytes = new Uint8Array(
        array.buffer,
        array.byteOffset,
        array.byteLength
      );
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
    randomUUID() {
      const bytes = new Uint8Array(16);
      cryptoPolyfill.getRandomValues(bytes);
      bytes[6] = bytes[6] & 15 | 64;
      bytes[8] = bytes[8] & 63 | 128;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    },
    subtle: {
      digest() {
        throw new Error("crypto.subtle.digest not supported in sandbox");
      },
      encrypt() {
        throw new Error("crypto.subtle.encrypt not supported in sandbox");
      },
      decrypt() {
        throw new Error("crypto.subtle.decrypt not supported in sandbox");
      }
    }
  };
  function setupGlobals() {
    const g = globalThis;
    g.process = process;
    g.setTimeout = setTimeout2;
    g.clearTimeout = clearTimeout;
    g.setInterval = setInterval;
    g.clearInterval = clearInterval;
    g.setImmediate = setImmediate;
    g.clearImmediate = clearImmediate;
    if (typeof g.queueMicrotask === "undefined") {
      g.queueMicrotask = _queueMicrotask;
    }
    if (typeof g.URL === "undefined") {
      g.URL = URL2;
    }
    if (typeof g.URLSearchParams === "undefined") {
      g.URLSearchParams = URLSearchParams;
    }
    if (typeof g.TextEncoder === "undefined") {
      g.TextEncoder = TextEncoder;
    }
    if (typeof g.TextDecoder === "undefined") {
      g.TextDecoder = TextDecoder2;
    }
    if (typeof g.Buffer === "undefined") {
      g.Buffer = Buffer3;
    }
    if (typeof g.crypto === "undefined") {
      g.crypto = cryptoPolyfill;
    } else if (typeof g.crypto.getRandomValues === "undefined") {
      g.crypto.getRandomValues = cryptoPolyfill.getRandomValues;
      g.crypto.randomUUID = cryptoPolyfill.randomUUID;
    }
  }

  // bridge/module.ts
  function _pathDirname(p) {
    const lastSlash = p.lastIndexOf("/");
    if (lastSlash === -1) return ".";
    if (lastSlash === 0) return "/";
    return p.slice(0, lastSlash);
  }
  function _parseFileUrl(url) {
    if (url.startsWith("file://")) {
      let path = url.slice(7);
      if (path.startsWith("/")) {
        return path;
      }
      return "/" + path;
    }
    return url;
  }
  function createRequire(filename) {
    if (typeof filename !== "string" && !(filename instanceof URL)) {
      throw new TypeError("filename must be a string or URL");
    }
    const filepath = _parseFileUrl(String(filename));
    const dirname = _pathDirname(filepath);
    const builtins = [
      "fs",
      "path",
      "os",
      "events",
      "util",
      "http",
      "https",
      "dns",
      "child_process",
      "stream",
      "buffer",
      "url",
      "querystring",
      "crypto",
      "zlib",
      "assert",
      "tty",
      "net",
      "tls"
    ];
    const resolvePaths = function(request) {
      if (builtins.includes(request) || request.startsWith("node:")) {
        return null;
      }
      if (request.startsWith("./") || request.startsWith("../") || request.startsWith("/")) {
        return [dirname];
      }
      const paths = [];
      let current = dirname;
      while (current !== "/") {
        paths.push(current + "/node_modules");
        current = _pathDirname(current);
      }
      paths.push("/node_modules");
      return paths;
    };
    const resolve = function(request, _options) {
      const resolved = _resolveModule.applySyncPromise(void 0, [
        request,
        dirname
      ]);
      if (resolved === null) {
        const err = new Error("Cannot find module '" + request + "'");
        err.code = "MODULE_NOT_FOUND";
        throw err;
      }
      return resolved;
    };
    resolve.paths = resolvePaths;
    const requireFn = function(request) {
      return _requireFrom(request, dirname);
    };
    requireFn.resolve = resolve;
    requireFn.cache = _moduleCache;
    requireFn.main = void 0;
    requireFn.extensions = {
      ".js": function(_module, _filename) {
      },
      ".json": function(_module, _filename) {
      },
      ".node": function(_module, _filename) {
        throw new Error(".node extensions are not supported in sandbox");
      }
    };
    return requireFn;
  }
  var Module = class _Module {
    id;
    path;
    exports;
    filename;
    loaded;
    children;
    paths;
    parent;
    isPreloading;
    constructor(id, parent) {
      this.id = id;
      this.path = _pathDirname(id);
      this.exports = {};
      this.filename = id;
      this.loaded = false;
      this.children = [];
      this.paths = [];
      this.parent = parent;
      this.isPreloading = false;
      let current = this.path;
      while (current !== "/") {
        this.paths.push(current + "/node_modules");
        current = _pathDirname(current);
      }
      this.paths.push("/node_modules");
    }
    require(request) {
      return _requireFrom(request, this.path);
    }
    _compile(content, filename) {
      const wrapper = new Function(
        "exports",
        "require",
        "module",
        "__filename",
        "__dirname",
        content
      );
      const moduleRequire = (request) => _requireFrom(request, this.path);
      moduleRequire.resolve = (request) => {
        const resolved = _resolveModule.applySyncPromise(void 0, [
          request,
          this.path
        ]);
        if (resolved === null) {
          const err = new Error("Cannot find module '" + request + "'");
          err.code = "MODULE_NOT_FOUND";
          throw err;
        }
        return resolved;
      };
      wrapper(this.exports, moduleRequire, this, filename, this.path);
      this.loaded = true;
      return this.exports;
    }
    static _extensions = {
      ".js": function(module, filename) {
        const fs2 = _requireFrom("fs", "/");
        const content = fs2.readFileSync(filename, "utf8");
        module._compile(content, filename);
      },
      ".json": function(module, filename) {
        const fs2 = _requireFrom("fs", "/");
        const content = fs2.readFileSync(filename, "utf8");
        module.exports = JSON.parse(content);
      },
      ".node": function() {
        throw new Error(".node extensions are not supported in sandbox");
      }
    };
    static _cache = typeof _moduleCache !== "undefined" ? _moduleCache : {};
    static _resolveFilename(request, parent, _isMain, _options) {
      const parentDir = parent && parent.path ? parent.path : "/";
      const resolved = _resolveModule.applySyncPromise(void 0, [
        request,
        parentDir
      ]);
      if (resolved === null) {
        const err = new Error("Cannot find module '" + request + "'");
        err.code = "MODULE_NOT_FOUND";
        throw err;
      }
      return resolved;
    }
    static wrap(content) {
      return "(function (exports, require, module, __filename, __dirname) { " + content + "\n});";
    }
    static builtinModules = [
      "assert",
      "buffer",
      "child_process",
      "crypto",
      "dns",
      "events",
      "fs",
      "http",
      "https",
      "net",
      "os",
      "path",
      "querystring",
      "stream",
      "string_decoder",
      "timers",
      "tls",
      "tty",
      "url",
      "util",
      "zlib",
      "vm",
      "module"
    ];
    static isBuiltin(moduleName) {
      const name = moduleName.replace(/^node:/, "");
      return _Module.builtinModules.includes(name);
    }
    static createRequire = createRequire;
    static syncBuiltinESMExports() {
    }
    static findSourceMap(_path) {
      return void 0;
    }
    static _nodeModulePaths(from) {
      const paths = [];
      let current = from;
      while (current !== "/") {
        paths.push(current + "/node_modules");
        current = _pathDirname(current);
        if (current === ".") break;
      }
      paths.push("/node_modules");
      return paths;
    }
    static _load(request, parent, _isMain) {
      const parentDir = parent && parent.path ? parent.path : "/";
      return _requireFrom(request, parentDir);
    }
    static runMain() {
    }
  };
  var SourceMap = class {
    _payload;
    constructor(payload) {
      this._payload = payload;
    }
    get payload() {
      return this._payload;
    }
    set payload(value) {
      this._payload = value;
    }
    findEntry(_line, _column) {
      return {};
    }
  };
  var moduleModule = {
    Module,
    createRequire,
    // Module._extensions (deprecated alias)
    _extensions: Module._extensions,
    // Module._cache reference
    _cache: Module._cache,
    // Built-in module list
    builtinModules: Module.builtinModules,
    // isBuiltin check
    isBuiltin: Module.isBuiltin,
    // Module._resolveFilename (internal but sometimes used)
    _resolveFilename: Module._resolveFilename,
    // wrap function
    wrap: Module.wrap,
    // syncBuiltinESMExports (stub for ESM interop)
    syncBuiltinESMExports: Module.syncBuiltinESMExports,
    // findSourceMap (stub)
    findSourceMap: Module.findSourceMap,
    // SourceMap class (stub)
    SourceMap
  };
  globalThis._moduleModule = moduleModule;
  var module_default = moduleModule;

  // bridge/index.ts
  var index_default = fs_default;
  setupGlobals();
  return __toCommonJS(index_exports);
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/
