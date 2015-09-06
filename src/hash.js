'use strict';

var PromisedObserver = require('./observer.js');

class BasePasswordHash extends PromisedObserver {
  constructor(){
    super();
  }
  *encode(password) {

  }
  *verify(password, hash) {

  }
}

module.exports = BasePasswordHash;