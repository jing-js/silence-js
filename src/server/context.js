'use strict';

const util = require('../util/util');
const url = require('url');
const CookieStore = require('./cookie');

const CODE_MESSAGES = new Map();
CODE_MESSAGES.set(404, 'Not Found');
CODE_MESSAGES.set(401, 'Unauthorized');
CODE_MESSAGES.set(500, 'Internal Server Error');


class SilenceContext {
  constructor(app, request, response) {
    this.app = app;
    this.originRequest = request;
    this.originResponse = response;
    this.url = url.parse(request.url);
    this.req = {
      query: this.url.query,
      post: null,
      files: null
    };
    this._user = null;
    this._cookie = null;
    this._store = null;
    this._code = 200;
    this._isSent = false;
    this._body = null;
    this._ip = null;
  }
  get method() {
    return this.originRequest.method;
  }
  get ip() {
    if (this._ip === null) {
      this._ip = util.getClientIp(this);
    }
    return this._ip;
  }
  get headers() {
    return this.originRequest.headers;
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
    return this.app.logger;
  }
  get db() {
    return this.app.db;
  }
  get user() {
    if (!this._user) {
      this._user = new this.app.SessionUser(this);
    }
    return this._user;
  }
  get isLogin() {
    return this._user && this._user.isLogin;
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
    this.originResponse.writeHead(200, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    this.originResponse.end(JSON.stringify({
      code: this._code,
      data: this._body || ''
    }));
  }
  error(code, data) {
    if (!util.isNumber(code)) {
      data = code;
      code = 1000;
    } else {
      data = CODE_MESSAGES.has(code) ? CODE_MESSAGES.get(code) : data
    }
    this._send(code, data);
  }
  success(data) {
    this._send(200, data);
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
}

module.exports = SilenceContext;
