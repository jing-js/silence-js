'use strict';

var PromisedObserver = require('./observer.js');

class BaseDatabaseStore extends PromisedObserver {
  constructor(logger) {
    super();
    this.logger = logger;
  }
  close() {

  }
}

module.exports.BaseDatabaseStore = BaseDatabaseStore;
