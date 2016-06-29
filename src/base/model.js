'use strict';

const util = require('../util/util');
const validators = require('../util/validator');
const converters = {
  'string'(val) {
    return val.toString();
  },
  'number'(val) {
    return Number(val);
  },
  'boolean'(val) {
    return !!val && val !== 'false'
  }
};

class BaseModel {
  constructor(values, convertType = false) {
    let fields = this.constructor.fields;
    for(let i = 0; i < fields.length; i++) {
      let field = fields[i];
      let fieldName = field.name;
      let val = util.isObject(values) && values.hasOwnProperty(fieldName)
        ? values[fieldName]
        : (field.hasOwnProperty('defaultValue') ? field.defaultValue : undefined);
      if (convertType && !uitl.isUndefined(val)) {
        val = converters[field.type](val);
      }
      Object.defineProperty(this, fieldName, {
        enumerable: true,
        writable: true,
        configurable: false,
        value: val
      });
    }
  }
  assign(values, convertType = false) {
    if (!util.isObject(values)) {
      return;
    }
    let fields = this.constructor.fields;
    for(let i = 0; i < fields.length; i++) {
      let field = fields[i];
      let fieldName = field.name;
      if (values.hasOwnProperty(fieldName)) {
        let val = values[fieldName];
        if (convertType) {
          val = converters[field.type](val);
        }
        this[fieldName] = val;
      }
    }
  }
  validate() {
    let fields = this.constructor.fields;
    for(let i = 0; i < fields.length; i++) {
      let field = fields[i];
      let val = this[field.name];
      if (field.require && (util.isUndefined(val) || val === null || val === '')) {
        return false;
      }
      if (util.isUndefined(val)) {
        continue;
      }

      if (!field.rules) {
        continue;
      }
      
      let rules = field.rules;
      for(let k in rules) {
        let v = rules[k];
        let fn = v;
        if (!util.isFunction(v)) {
          fn = validators[k];
        }
        v = Array.isArray(v) ? v : [v];
        if (!fn.call(this, val, ...v)) {
          return false;
        }
      }
    }
    return true;
  }
}

module.exports = BaseModel;
