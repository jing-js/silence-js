'use strict';

module.exports = {
  isGenerateFunction(obj) {
    return typeof obj === 'function' && obj.constructor.name === 'GeneratorFunction';
  },
  isFunction(obj) {
    return typeof obj === 'function';
  },
  isObject(obj) {
    return typeof obj === 'object';
  },
  isNumber(obj) {
    return typeof obj === 'number';
  },
  isString(obj) {
    return typeof obj === 'string';
  },
  isUndefined(obj) {
    return typeof obj === 'undefined';
  }
};
