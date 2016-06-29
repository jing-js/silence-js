'use strict';


class SessionUser {
  constructor() {
    this.id = null;
    this.name = null;
    this.isLogin = false;
  }
  *login(rememberMe) {
    this.rememberMe = rememberMe;
    let su = yield this.context.session.set(this.key, {
      id: user.id
    });
    if (su && rememberMe) {
      let now = new Date();
      now.setMonth(now.getMonth() + 1); //一个月的有效期
      this.context.cookie.set(SESSION_ID_KEY, this.sessionId, now);
    }
    this.isLogin = su;
    return su;
  }
}

module.exports = SessionUser;
