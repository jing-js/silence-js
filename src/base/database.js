'use strict';

const BaseObject = require('./base');

class BaseDatabaseStore extends BaseObject {
  constructor(logger) {
    super();
    this.logger = logger;
  }
}

module.exports = BaseDatabaseStore;
