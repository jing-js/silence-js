'use strict';

module.exports = {
  isArray(val) {
    return Array.isArray(val);
  },
  minLength(val, length) {
    return val.length >= length;
  },
  maxLength(val, length) {
    return val.length <= length;
  },
  rangeLength(val, minLength, maxLength) {
    return val.length >= minLength && val.length <= maxLength;
  },
  max(val, bound) {
    return val <= bound;
  },
  min(val, bound) {
    return val >= bound;
  },
  equal(val, expect) {
    return val === expect;
  },
  inArray(val, array) {
    return array.indexOf(val) >= 0;
  },
  length(val, length) {
    return val.length === length;
  },
  pattern(val, regExp) {
    return regExp.test(val);
  }
};