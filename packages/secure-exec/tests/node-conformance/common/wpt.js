'use strict';

const assert = require('assert');

function test(fn, _description) {
  fn();
}

function assert_equals(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
}

function assert_array_equals(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
}

function assert_unreached(message) {
  assert.fail(message || 'Reached unreachable code');
}

module.exports = {
  harness: {
    test,
    assert_equals,
    assert_array_equals,
    assert_unreached,
  },
};
