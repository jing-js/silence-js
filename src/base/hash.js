'use strict';

var BaseService = require('./base');

class BasePasswordHash  extends BaseService {
  constructor(){
    super();
  }
  *encode(password) {

  }
  *verify(password, hash) {

  }
}

module.exports = BasePasswordHash;