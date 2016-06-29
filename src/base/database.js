'use strict';

const BaseService = require('./base');

class BaseDatabaseStore extends BaseService {
  constructor(logger, type) {
    super();
    this.logger = logger;
    this.type = type;
  }
}

module.exports = BaseDatabaseStore;
