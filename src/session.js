'use strict';

var PromisedObserver = require('./observer.js');
var uuid = require('uuid');

const SESSION_ID_KEY = 'NODESESSION';

function session() {
  return function*(next) {
    this.user = yield getUser(this.cookies, this.session);
    yield next;
  };
}

function *getUser(cookies, sessions) {
  let user = new SessionUser(sessions, cookies);
  let sid = cookies.get(SESSION_ID_KEY); //fetch cookie
  let ru;
  if (sid && (ru = yield sessions.get(sid))) {
    user.name = ru.name;
    user.email = ru.email;
    user.id = ru.id;
    user.isLogin = true;
    user.sessionId = sid;
    user.remember = ru.remember;
  } else {
    if (sid) {
      user.sessionId = sid;
    } else {
      user.sessionId = gSessionId();
      cookies.set(SESSION_ID_KEY, user.sessionId);
    }
  }
  return user;
}

class SessionUser {
  constructor(sessionStore, cookieStore) {
    this.sessionStore = sessionStore;
    this.cookieStore = cookieStore;
    this.id = '';
    this.sessionId = '';
    this.name = '';
    this.email = '';
    this.isLogin = false;
    this.remember = false;
  }
  *login(user) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.remember = user.remember;
    this.isLogin = true;

    let su = yield this.sessionStore.set(this.sessionId, {
      id: user.id,
      name: user.name,
      email: user.email,
      remember: user.remember
    });
    if (su && user.remember) {
      let now = new Date();
      now.setMonth(now.getMonth() + 1); //一个月的有效期
      this.cookieStore.set(SESSION_ID_KEY, this.sessionId, now);
    }
    return su;
  }
  *logout() {
    if (!this.remember) {
      yield this.sessionStore.del(this.sessionId);
    }
    this.isLogin = false;
    this.sessionId = '';
  }
}

function gSessionId() {
  //todo 评估uuid的性能和安全性，如有必要使用新的session id生成策略。
  return uuid.v4();
}

class BaseSessionStore extends PromisedObserver {
  constructor(logger) {
    super();
    this.logger = logger;
  }
  get(sessionID) {

  }
  set(sessionId, sessionUser) {

  }
  close() {

  }
}


session.BaseSessionStroe = BaseSessionStore;
session.SessionUser = SessionUser;
module.exports = session;
