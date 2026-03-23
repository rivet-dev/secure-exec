'use strict';

const fs = require('fs');
const path = require('path');

// Fixtures directory path in VFS — matches the runner's VFS layout
const fixturesDir = path.resolve('/test/fixtures');

/**
 * Returns the absolute path to a fixture file.
 * Usage: fixtures.path('keys', 'rsa_private.pem')
 */
function fixturesPath(...args) {
  return path.join(fixturesDir, ...args);
}

/**
 * Reads a fixture file synchronously and returns its contents.
 * Usage: fixtures.readSync('test-file.txt')
 * Usage: fixtures.readSync('test-file.txt', 'utf8')
 */
function readSync(...args) {
  const filepath = fixturesPath(...args.filter((a) => typeof a !== 'string' || !a.startsWith('utf')));
  const encoding = args.find((a) => typeof a === 'string' && (a === 'utf8' || a === 'utf-8'));
  return fs.readFileSync(filepath, encoding);
}

/**
 * Reads a fixture file as a UTF-8 string.
 */
function readKey(...args) {
  return fs.readFileSync(fixturesPath(...args), 'utf8');
}

// Lazy-loaded UTF-8 test text (matches upstream test/common/fixtures.js)
let _utf8TestText;

module.exports = {
  fixturesDir,
  path: fixturesPath,
  readSync,
  readKey,
  get utf8TestText() {
    if (_utf8TestText === undefined) {
      _utf8TestText = fs.readFileSync(fixturesPath('utf8_test_text.txt'), 'utf8');
    }
    return _utf8TestText;
  },
};
