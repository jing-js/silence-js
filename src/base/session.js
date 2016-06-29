'use strict';

const BaseService = require('./base');

class BaseSessionStore extends BaseService {
  constructor(logger) {
    super();
    this.logger = logger;
  }

  /**
   * @param sessionID
   * @return Promise
   */
  get(sessionID) {
    return Promise.resolve(null);
  }

  /**
   * @param sessionId
   * @param sessionUser
   * @return Promise
   */
  set(sessionId, sessionUser) {
    return Promise.resolve(false);
  }
}

module.exports = BaseSessionStore;
