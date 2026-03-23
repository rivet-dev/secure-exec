'use strict';

const fs = require('fs');
const path = require('path');

// VFS-backed temp directory for conformance tests
const tmpDir = '/tmp/node-test';

/**
 * Clears and recreates the temp directory.
 * Upstream Node.js tests call tmpdir.refresh() to get a clean temp dir.
 */
function refresh(opts = {}) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist yet
  }
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Returns a path resolved relative to the temp directory.
 */
function resolve(...args) {
  return path.resolve(tmpDir, ...args);
}

/**
 * Check if the tmp dir has enough space. Always true in VFS.
 */
function hasEnoughSpace(size) {
  return true;
}

module.exports = {
  path: tmpDir,
  refresh,
  resolve,
  hasEnoughSpace,
};
