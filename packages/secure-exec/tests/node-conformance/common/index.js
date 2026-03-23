'use strict';

const assert = require('assert');
const path = require('path');

// Track functions that must be called before process exits
const mustCallChecks = [];

function runCallChecks(exitCode) {
  if (exitCode !== 0) return;

  const failed = [];
  for (const context of mustCallChecks) {
    if (context.actual !== context.exact) {
      failed.push(
        `Mismatched ${context.name} function calls. Expected exactly ` +
        `${context.exact}, actual ${context.actual}.`
      );
    }
  }
  if (failed.length > 0) {
    for (const msg of failed) {
      console.error(msg);
    }
    process.exit(1);
  }
}

process.on('exit', runCallChecks);

/**
 * Returns a wrapper around `fn` that asserts it is called exactly `exact` times
 * before the process exits. Default is 1.
 */
function mustCall(fn, exact) {
  if (typeof fn === 'number') {
    exact = fn;
    fn = noop;
  } else if (fn === undefined) {
    fn = noop;
  }
  if (exact === undefined) exact = 1;

  const context = {
    exact,
    actual: 0,
    name: fn.name || '<anonymous>',
  };
  mustCallChecks.push(context);

  const wrapper = function(...args) {
    context.actual++;
    return fn.apply(this, args);
  };
  // Some tests check .length
  Object.defineProperty(wrapper, 'length', {
    value: fn.length,
    writable: false,
    configurable: true,
  });
  return wrapper;
}

/**
 * Returns a wrapper around `fn` that asserts it is called at least `minimum` times.
 */
function mustCallAtLeast(fn, minimum) {
  if (typeof fn === 'number') {
    minimum = fn;
    fn = noop;
  } else if (fn === undefined) {
    fn = noop;
  }
  if (minimum === undefined) minimum = 1;

  const context = {
    actual: 0,
    name: fn.name || '<anonymous>',
  };

  // Custom exit check for mustCallAtLeast
  process.on('exit', (exitCode) => {
    if (exitCode !== 0) return;
    if (context.actual < minimum) {
      console.error(
        `Mismatched ${context.name} function calls. Expected at least ` +
        `${minimum}, actual ${context.actual}.`
      );
      process.exit(1);
    }
  });

  return function(...args) {
    context.actual++;
    return fn.apply(this, args);
  };
}

/**
 * Returns a function that MUST NOT be called. If called, it throws.
 */
function mustNotCall(msg) {
  const err = new Error(msg || 'function should not have been called');
  return function mustNotCall() {
    throw err;
  };
}

/**
 * Convenience wrapper for callbacks expecting (err, ...args) where err must be null.
 */
function mustSucceed(fn, exact) {
  if (typeof fn === 'number') {
    exact = fn;
    fn = undefined;
  }
  return mustCall(function(err, ...args) {
    assert.ifError(err);
    if (typeof fn === 'function') {
      return fn.apply(this, args);
    }
  }, exact);
}

/**
 * Returns a validation function for expected errors.
 * Can be used with assert.throws() or promise .catch().
 */
function expectsError(validator, exact) {
  if (typeof validator === 'number') {
    exact = validator;
    validator = undefined;
  }
  let check;
  if (validator && typeof validator === 'object') {
    check = (error) => {
      if (validator.code !== undefined) {
        assert.strictEqual(error.code, validator.code);
      }
      if (validator.type !== undefined) {
        assert(error instanceof validator.type,
          `Expected error to be instance of ${validator.type.name}, got ${error.constructor.name}`);
      }
      if (validator.name !== undefined) {
        assert.strictEqual(error.name, validator.name);
      }
      if (validator.message !== undefined) {
        if (typeof validator.message === 'string') {
          assert.strictEqual(error.message, validator.message);
        } else if (validator.message instanceof RegExp) {
          assert.match(error.message, validator.message);
        }
      }
      return true;
    };
  } else {
    check = () => true;
  }

  if (exact !== undefined) {
    return mustCall(check, exact);
  }
  return check;
}

/**
 * Register expected process warnings.
 * Asserts that the expected warnings are emitted before process exits.
 */
function expectWarning(nameOrMap, expected, code) {
  if (typeof expected === 'string') {
    expected = [[expected, code]];
  } else if (!Array.isArray(expected) && typeof expected === 'string') {
    expected = [[expected, code]];
  } else if (typeof nameOrMap === 'object' && !Array.isArray(nameOrMap)) {
    // Map form: expectWarning({ DeprecationWarning: 'msg', ... })
    for (const [name, messages] of Object.entries(nameOrMap)) {
      expectWarning(name, messages);
    }
    return;
  }

  // Normalize to array of [message, code] pairs
  if (!Array.isArray(expected)) {
    expected = [[expected]];
  } else if (typeof expected[0] === 'string') {
    // Array of strings
    expected = expected.map((msg) =>
      Array.isArray(msg) ? msg : [msg]
    );
  }

  const expectedWarnings = new Map();
  for (const [msg, warnCode] of expected) {
    expectedWarnings.set(String(msg), warnCode);
  }

  process.on('warning', mustCall((warning) => {
    assert.strictEqual(warning.name, nameOrMap);
    const msg = String(warning.message);
    assert(expectedWarnings.has(msg),
      `Unexpected warning message: "${msg}"`);
    const warnCode = expectedWarnings.get(msg);
    if (warnCode !== undefined) {
      assert.strictEqual(warning.code, warnCode);
    }
    expectedWarnings.delete(msg);
  }, expectedWarnings.size));
}

/**
 * Skip the current test with a reason.
 */
function skip(reason) {
  process.stdout.write(`1..0 # Skipped: ${reason}\n`);
  process.exit(0);
}

/**
 * Adjust a timeout value for the current platform.
 * In the sandbox, just return the value as-is.
 */
function platformTimeout(ms) {
  return ms;
}

function noop() {}

// Platform detection — sandbox always reports as Linux
const isWindows = false;
const isMacOS = false;
const isLinux = true;
const isFreeBSD = false;
const isSunOS = false;
const isAIX = false;

// Capability detection
let hasCrypto = false;
try {
  require('crypto');
  hasCrypto = true;
} catch {
  // crypto not available
}

let hasIntl = false;
try {
  hasIntl = typeof Intl === 'object' && Intl !== null;
} catch {
  // Intl not available
}

// OpenSSL detection — depends on crypto availability
const hasOpenSSL = hasCrypto;

// Common port for tests (note: server binding may not work in sandbox)
const PORT = 12346;

// Temp directory path in VFS
const tmpDir = '/tmp/node-test';

// Print helper for TAP-style output
function printSkipMessage(msg) {
  process.stdout.write(`1..0 # Skipped: ${msg}\n`);
}

// canCreateSymLink - in sandbox VFS, symlinks are generally supported
function canCreateSymLink() {
  return true;
}

// localhostIPv4 — standard loopback
const localhostIPv4 = '127.0.0.1';

// hasIPv6 — not available in sandbox
const hasIPv6 = false;

// hasMultiLocalhost — not applicable in sandbox
const hasMultiLocalhost = false;

// allowGlobals — mark globals as expected (no-op in our shim)
function allowGlobals(...allowedGlobals) {
  // No-op: upstream uses this to suppress global leak detection
}

// getCallSite — return the call site for debugging
function getCallSite(top) {
  const originalLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 2;
  const err = {};
  Error.captureStackTrace(err, top || getCallSite);
  Error.stackTraceLimit = originalLimit;
  return err.stack;
}

// createZeroFilledFile — helper for creating test files
function createZeroFilledFile(filename) {
  const fs = require('fs');
  fs.writeFileSync(filename, Buffer.alloc(0));
}

/**
 * Deep-freezes an object so tests can verify APIs don't mutate options bags.
 * Matches upstream Node.js test/common/index.js behavior.
 */
function mustNotMutateObjectDeep(original) {
  const seen = new Set();
  function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return obj;
    seen.add(obj);
    const names = Object.getOwnPropertyNames(obj);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(obj, name);
      if (descriptor && 'value' in descriptor) {
        const value = descriptor.value;
        if (typeof value === 'object' && value !== null) {
          deepFreeze(value);
        }
      }
    }
    Object.freeze(obj);
    return obj;
  }
  return deepFreeze(original);
}

/**
 * Returns an array of all TypedArray views and DataView over the given buffer.
 * Used to test that buffer-accepting APIs work with every view type.
 */
function getArrayBufferViews(buf) {
  const { buffer, byteOffset, byteLength } = buf;
  const out = [];
  const types = [
    Int8Array, Uint8Array, Uint8ClampedArray,
    Int16Array, Uint16Array,
    Int32Array, Uint32Array,
    Float32Array, Float64Array,
    BigInt64Array, BigUint64Array,
    DataView,
  ];
  for (const type of types) {
    const { BYTES_PER_ELEMENT = 1 } = type;
    if (byteLength % BYTES_PER_ELEMENT === 0) {
      out.push(new type(buffer, byteOffset, byteLength / BYTES_PER_ELEMENT));
    }
  }
  return out;
}

/**
 * Returns a string fragment describing the type of `input` for error message matching.
 * Matches the format used in Node.js ERR_INVALID_ARG_TYPE messages.
 */
function invalidArgTypeHelper(input) {
  if (input == null) {
    return ` Received ${input}`;
  }
  if (typeof input === 'function') {
    return ` Received function ${input.name || 'anonymous'}`;
  }
  if (typeof input === 'object') {
    if (input.constructor && input.constructor.name) {
      return ` Received an instance of ${input.constructor.name}`;
    }
    const util = require('util');
    return ` Received ${util.inspect(input, { depth: -1 })}`;
  }
  let inspected = require('util').inspect(input, { colors: false });
  if (inspected.length > 28) {
    inspected = `${inspected.slice(0, 25)}...`;
  }
  return ` Received type ${typeof input} (${inspected})`;
}

const common = module.exports = {
  // Assertion helpers
  mustCall,
  mustCallAtLeast,
  mustNotCall,
  mustSucceed,
  expectsError,
  expectWarning,

  // Test control
  skip,
  printSkipMessage,
  platformTimeout,
  allowGlobals,

  // Platform detection
  isWindows,
  isMacOS,
  isLinux,
  isFreeBSD,
  isSunOS,
  isAIX,

  // Capability detection
  hasCrypto,
  hasIntl,
  hasOpenSSL,
  hasIPv6,
  hasMultiLocalhost,
  canCreateSymLink,

  // Environment
  PORT,
  tmpDir,
  localhostIPv4,

  // Utilities
  getCallSite,
  createZeroFilledFile,
  mustNotMutateObjectDeep,
  getArrayBufferViews,
  invalidArgTypeHelper,
  noop,
};
