'use strict';

module.exports = function tick(count, callback) {
  let remaining = Number(count) || 0;
  const done = typeof callback === 'function' ? callback : () => {};
  const next = () => {
    if (remaining <= 0) {
      done();
      return;
    }
    remaining -= 1;
    process.nextTick(next);
  };
  next();
};
