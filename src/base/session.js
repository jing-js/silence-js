'use strict';

const uuid = require('uuid');
const BaseService = require('./base');

const SESSION_ID_KEY = 'NODESESSION';

function session() {
  return function*(next) {
    this.user = yield getUser(this.cookies, this.session);
    yield next;
  };
}

function *getUser(cookies, sessions) {
  
  return user;
}

function gSessionId() {
  //todo 评估uuid的性能和安全性，如有必要使用新的session id生成策略。
  return uuid.v4();
}

class BaseSessionStore extends BaseService {
  constructor(logger) {
    super();
    this.logger = logger;
  }
  get(sessionID) {

  }
  set(sessionId, sessionUser) {

  }
}

module.exports = BaseSessionStore;
