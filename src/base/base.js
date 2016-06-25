'use strict';

class BaseService {
  constructor() {

  }
  close() {
    return Promise.resolve();
  }
  init() {
    return Promise.resolve();
  }
}

module.exports = BaseService;
