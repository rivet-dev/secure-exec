'use strict';

// Crypto helper for Node.js conformance tests
// Sandbox uses crypto-browserify, not OpenSSL

function hasOpenSSL(major, minor) {
  // crypto-browserify doesn't have OpenSSL version info
  // Return false for all version checks — tests skip OpenSSL-specific sections
  return false;
}

const hasOpenSSL3 = false;

module.exports = {
  hasOpenSSL,
  hasOpenSSL3,
};
