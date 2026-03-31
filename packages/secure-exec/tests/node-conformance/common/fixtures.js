'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// Fixtures directory path in VFS — matches the runner's VFS layout by default,
// but host-backed replacement-runtime probes can override it explicitly.
const fixturesDir = process.env.SECURE_EXEC_CONFORMANCE_FIXTURES_DIR ?
  path.resolve(process.env.SECURE_EXEC_CONFORMANCE_FIXTURES_DIR) :
  path.resolve('/test/fixtures');

/**
 * Returns the absolute path to a fixture file.
 * Usage: fixtures.path('keys', 'rsa_private.pem')
 */
function fixturesPath(...args) {
  return path.join(fixturesDir, ...args);
}

function fileURL(...args) {
  return pathToFileURL(fixturesPath(...args));
}

/**
 * Reads a fixture file synchronously and returns its contents.
 * Usage: fixtures.readSync('test-file.txt')
 * Usage: fixtures.readSync('test-file.txt', 'utf8')
 */
function parseFixtureArgs(args) {
  const normalized = args.at(-1) === 'utf-8' ? 'utf8' : args.at(-1);
  const hasEncoding =
    typeof normalized === 'string' && Buffer.isEncoding(normalized);
  return {
    encoding: hasEncoding ? normalized : undefined,
    pathArgs: hasEncoding ? args.slice(0, -1) : args,
  };
}

function readSync(...args) {
  const { pathArgs, encoding } = parseFixtureArgs(args);
  const filepath = fixturesPath(...pathArgs);
  return fs.readFileSync(filepath, encoding);
}

/**
 * Reads a fixture file as a UTF-8 string.
 */
function readKey(...args) {
  const { pathArgs, encoding } = parseFixtureArgs(args);
  return fs.readFileSync(fixturesPath('keys', ...pathArgs), encoding);
}

// Lazy-loaded UTF-8 test text (matches upstream test/common/fixtures.js)
let _utf8TestText;

module.exports = {
  fixturesDir,
  path: fixturesPath,
  fileURL,
  readSync,
  readKey,
  get utf8TestText() {
    if (_utf8TestText === undefined) {
      _utf8TestText = fs.readFileSync(fixturesPath('utf8_test_text.txt'), 'utf8');
    }
    return _utf8TestText;
  },
};
