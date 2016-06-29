'use strict';

var BaseService = require('./base');

class BasePasswordHash  extends BaseService {
  constructor(){
    super();
  }
  encode(password) {
    return Promise.resolve(password);
  }
  verify(password, hash) {
    return Promise.resolve(false);
  }
}

module.exports = BasePasswordHash;