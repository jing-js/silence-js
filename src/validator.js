'use strict';

var _ = require('underscore');

module.exports = {
  pass() {
    return true;
  },
  'require'(val) {
    return !_.isUndefined(val) && !_.isNull(val);
  },
  minLength(val, length) {
    return val.length >= length;
  },
  maxLength(val, length) {
    return val.length <= length;
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
  'length'(val, length) {
    return val.length === length;
  },
  type(val, type) {
    return typeof val === type;
  },
  pattern(val, regExp) {
    return regExp.test(val);
  }
};