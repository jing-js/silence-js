'use strict';

const BaseService = require('./base');

class BaseSQLDatabaseStore extends BaseService {
  constructor(logger) {
    super();
    this.logger = logger;
  }
  initField(field) {
    if (!field.rules) {
      field.rules = {};
    }
    if (!field.type) {
      field.type = 'VARCHAR';
    } else {
      field.type = field.type.trim().toUpperCase();
    }

    if (/^VARCHAR$/.test(field.type)|| /^CHAR$/.test(field.type)) {
      field.type = field.type + '(45)';
    }

    let m = field.type.match(/^(?:VAR)?CHAR\(\s*(\d+)\s*\)/);
    if (m && !field.rules.maxLength && !field.rules.rangeLength) {
      field.rules.maxLength = Number(m[1]);
    }
  }
  genCreateTableSQL(Model) {
    // abstract method;
    return '';
  }
  exec(queryString, queryParams) {
    return this.query(queryString, queryParams);
  }
  query(queryString, queryParams) {
    return Promise.resolve(null);
  }
}

module.exports = BaseSQLDatabaseStore;
