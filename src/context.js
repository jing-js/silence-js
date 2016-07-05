'use strict';

const util = require('silence-js-util');
const url = require('url');
const CookieStore = require('./cookie');

const CODE_MESSAGES = new Map();
CODE_MESSAGES.set(400, 'Bad Request');
CODE_MESSAGES.set(404, 'Not Found');
CODE_MESSAGES.set(401, 'Unauthorized');
CODE_MESSAGES.set(500, 'Internal Server Error');


class SilenceContext {
  constructor(app, request, response) {
    this._app = app;
    this._originRequest = request;
    this._originResponse = response;
    this._query = null;
    this._post = null;
    this._user = null;
    this._cookie = null;
    this._store = null;
    this._code = 200;
    this._isSent = false;
    this._body = null;
    this._ip = null;
  }
  get method() {
    return this._originRequest.method;
  }
  get ip() {
    if (this._ip === null) {
      this._ip = util.getClientIp(this);
    }
    return this._ip;
  }
  get headers() {
    return this._originRequest.headers;
  }
  get url() {
    return this._originRequest.url;
  }
  get query() {
    if (this._query === null) {
      this._query = url.parse(this.url, true).query;
    }
    return this._query;
  }
  get store() {
    if (this._store === null) {
      this._store = new Map();
    }
    return this._store;
  }
  get cookie() {
    if (this._cookie === null) {
      this._cookie = new CookieStore(this);
    }
    return this._cookie;
  }
  get logger() {
    return this._app.logger;
  }
  get db() {
    return this._app.db;
  }
  get hash() {
    return this._app.hash;
  }
  get session() {
    return this._app.session;
  }
  get user() {
    if (!this._user) {
      this._user = this.session.createUser();
    }
    return this._user;
  }
  get isLogin() {
    return this._user !== null && this._user.isLogin;
  }
  get isSent() {
    return this._isSent;
  }
  get body() {
    return this._body;
  }
  set body(val) {
    if (this._isSent) {
      logger.warn('Body can\'t be set after response sent!');
      return;
    }
    this._body = val;
  }
  _send(code, data) {
    if (this._isSent) {
      this.logger.warn('Response can\'t be sent multi times!');
      return;
    }
    this._code = code;
    this._body = data;
    this._isSent = true;
    this._originResponse.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    this._originResponse.end(JSON.stringify({
      code: this._code,
      data: this._body || ''
    }));
  }
  *login(id, remember) {
    console.log(id, remember);
    return true;
  }
  *logout() {

  }
  error(code, data) {
    if (!util.isNumber(code)) {
      data = code;
      code = 1000;
    } else {
      data = CODE_MESSAGES.has(code) ? CODE_MESSAGES.get(code) : data
    }
    this._send(code, data || 'failure');
  }
  success(data) {
    this._send(200, data || 'success');
  }
  destroy() {
    if (this._user !== null) {
      this._user.destroy();
      this._user = null;
    }
    if (this._cookie !== null) {
      this._cookie.destroy();
      this._cookie = null;
    }
    if (this._store !== null) {
      this._store.clear();
      this._store = null;
    }
  }
  *post(options) {
    if (this._post === null) {
      this._post = yield this._app.parser.post(this, options);
    }
    return this._post;
  }
}

module.exports = SilenceContext;
