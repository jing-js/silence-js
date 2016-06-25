'use strict';


class SessionUser {
  constructor(context) {
    this.context = context;
    this.sessionKey = '';
    this.isLogin = false;
    this.rememberMe = false;
  }
  *login(rememberMe) {
    this.rememberMe = rememberMe;
    let su = yield this.context.session.set(this.sessionKey, {
      id: user.id,
      name: user.name,
      email: user.email,
      rememberMe: user.rememberMe
    });
    if (su && rememberMe) {
      let now = new Date();
      now.setMonth(now.getMonth() + 1); //一个月的有效期
      this.context.cookie.set(SESSION_ID_KEY, this.sessionId, now);
    }
    this.isLogin = su;
    return su;
  }
  destroy() {
    this.context = null;
  }
}

module.exports = SessionUser;
