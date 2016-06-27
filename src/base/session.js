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

  }

  /**
   * @param sessionId
   * @param sessionUser
   * @return Promise
   */
  set(sessionId, sessionUser) {

  }
}

module.exports = BaseSessionStore;
