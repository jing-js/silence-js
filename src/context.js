'use strict';

const util = require('silence-js-util');
const url = require('url');

const STATUS = (function () {
  let CODES = require('http').STATUS_CODES;
  let map = new Map();
  for(let k in CODES) {
    map.set(parseInt(k), JSON.stringify({
      code: parseInt(k),
      data: CODES[k]
    }, null, '  '));
  }
  return map;
})();

class RequestReader {
  constructor(onData, onEnd) {
    this.onData = onData;
    this.onEnd = onEnd;
    this.state = 'reading';
  }
  push(chunk) {
    this.onData(chunk);
  }
}

class SilenceContext {
  constructor() {

    this.$$freeListPosition = -1;
    this.$$freeListNext = -1;

    this._app = null;
    this._originRequest = null;
    this._originResponse = null;
    this._query = null;
    this._post = null;
    this._multipart = null;
    this._user = null;
    this._cookie = null;
    this._store = null;
    this._code = 0;
    this._isSent = false;
    this._body = null;
    this._ip = null;
    this._duration = Date.now(); // duration of each request
    this.__parseState = 0; // 0: paused, 1: reading, 2: end
    this.__parseBytes = 0;
    this.__parseTime = 0;
    this.__parseRate = 0;
    this.__parseLimit = 0;
    this.__parseOnData = null;
    this.__parseOnEnd = null;
    
  }
  $$freeListInit(app, request, response) {
    this._app = app;
    this._originRequest = request;
    this._originResponse = response;
    this._isSent = false;
    this._code = 0;
    this._duration = Date.now(); // duration of each request
    this.__initParse();
  }
  $$freeListFree() {
    if (this.__parseState === 0) {
      this._originRequest.resume();
    }
    if (this._user) {
      this._app.session.freeUser(this._user);
      this._user = null;
    }
    if (this._cookie) {
      this._app._CookieStoreFreeList.free(this._cookie);
      this._cookie = null;
    }
    if (this._store) {
      this._store.clear();
    }
    this._app = null;
    this._originRequest = null;
    this._originResponse = null;
    this._body = null;
    this._query = null;
    this._post = null;
    this._multipart = null;
    this._ip = null;
    this.__parseState = 0;
    this.__parseBytes = 0;
    this.__parseTime = 0;
    this.__parseRate = 0;
    this.__parseLimit = 0;
    this.__parseOnData = null;
    this.__parseOnEnd = null;
  }
  __initParse() {
    let me = this;
    let req = this._originRequest;
    let ratePaused = false;
    let rateTM = null;
    function onEnd(err) {
      // console.log('request read end', me.__parseState, err);
      if (rateTM !== null) {
        clearTimeout(rateTM);
        rateTM = null;
      }
      if (me.__parseState === 2) {
        return;
      }
      if (err && err !== 'request_aborted') {
        me.logger.error(err);
        req.pause();
      }
      me.__parseState = 2;
      me.__parseOnEnd && me.__parseOnEnd(err);
      req.removeListener('error', onEnd);
      req.removeListener('aborted', onAborted);
      req.removeListener('end', onEnd);
      req.removeListener('close', onEnd);
      req.removeListener('data', onData);
    }
    function onAborted() {
      // console.log('aborted')
      onEnd('request_aborted');
    }
    function onData(chunk) {
      // console.log('ctx inner on data', chunk.length)
      if (me._isSent) {
        // console.log('destroy connection');
        req.destroy();
        onEnd();
        return;
      }
      me.__parseBytes += chunk.length;
      if (me.__parseLimit > 0 && me.__parseBytes > me.__parseLimit) {
        // console.log('meet size too large', me.__parseBytes, me.__parseLimit);
        me.__parseOnEnd('size_too_large');
        me.__parseState = 0;
        me.__parseOnEnd = null;
        req.pause();
        return;
      }
      let err = me.__parseOnData(chunk);
      if (err) {
        // console.log('meet error', err);
        me.__parseOnEnd(err);
        me.__parseState = 0;
        me.__parseOnEnd = null;
        req.pause();
        return;
      }
      if (me.__parseRate > 0) {
        checkRate();
      }
    }
    function checkRate() {
      rateTM = null;
      let tm = Date.now()  - me.__parseTime;
      // if (tm <= 10) {
      //   return;
      // }
      let should = me.__parseRate * tm;
      // console.log('check rate', tm, me.__parseBytes, should);
      if (me.__parseBytes > should) {
        // console.log('rate paused', me.__parseBytes, should, tm);
        ratePaused = true;
        req.pause();
        rateTM = setTimeout(checkRate, ((me.__parseBytes - should) / me.__parseRate) | 0);
      } else if (ratePaused) {
        ratePaused = false;
        // console.log('rate resume');
        req.resume();
      }
    }
    req.on('error', onEnd);
    req.on('aborted', onAborted);
    req.on('close', onEnd);
    req.on('end', onEnd);
    req.on('data', onData);
    req.pause();
  }
  readRequest(onData, onEnd, limit = 0, rate = 0) {
    if (!util.isFunction(onData) || !util.isFunction(onEnd)) {
      return false;
    }
    if (this.__parseState === 1 || this._isSent || this.__parseOnData !== null) {
      return false;
    }

    if (this.__parseState === 2) {
      // already end
      onEnd();
      return true;
    }
    this.__parseOnEnd = onEnd;
    this.__parseOnData = onData;
    this.__parseLimit = limit;
    this.__parseRate = rate / 1000;
    this.__parseBytes = 0;
    this.__parseTime = Date.now();
    this._originRequest.resume();
    this.__parseState = 1;
    return true;
  }
  
  get duration() {
    return Date.now() - this._duration;
  }
  get method() {
    return this._originRequest.method;
  }
  get ip() {
    if (this._ip === null) {
      this._ip = util.getClientIp(this._originRequest);
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
      this._cookie = this._app._CookieStoreFreeList.alloc(this);
      console.trace();

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
      this._user = this._app.session.createUser();
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
      logger.error('Body can\'t be set after response sent!');
      return;
    }
    this._body = val;
  }
  _send(code, data) {
    if (this._isSent) {
      this.logger.error('Response can\'t be sent multi times!');
      return;
    }
    this._code = code;
    let hc = this._code === 0 || this._code >= 1000 ? 200 : this._code;
    this._body = this._code !== 0 && this._code < 1000 && STATUS.has(hc) ? STATUS.get(hc) : JSON.stringify({
      code: this._code,
      data: data || ''
    }, null, '  ');
    this._isSent = true;
    this._originResponse.writeHead(hc, {
      'Content-Type': 'application/json;charset=utf-8'
    });
    this._originResponse.end(this._body);
  }
  *login(identity, remember) {
    this.user.assign(identity);
    if (!this.user.sessionId) {
      this.user.sessionId = yield util.genSessionKey();
    }
    return yield this._app.session.login(this, remember);
  }
  *logout() {
    return yield this._app.session.logout(this);
  }
  error(code, data) {
    if (!util.isNumber(code)) {
      data = code;
      code = 1000;
    }
    this._send(code, data);
  }
  success(data) {
    this._send(0, data);
  }
  _error(err) {
    if (typeof err !== 'string') {
      return;
    }
    if (err === 'size_too_large') {
      this.error(413);
    } else if (err.startsWith('header_') || err === 'parse_error' || err === 'request_aborted') {
      this.error(400);
    }
  }
  *post(options) {
    if (this._post === null) {
      this._post = yield new Promise((resolve, reject) => {
        this._app.parser.post(this, options).then(res => {
          if (typeof res !== 'object') {
            this.error(400);
            reject('body_empty');
          } else {
            resolve(res);
          }
        }, err => {
          this._error(err);
          reject(err);
        }).catch(reject);
      });
      // this.logger.debug('AFTER POST:')
      // this.logger.debug(this._post);
    }
    return this._post;
  }
  *multipart(options) {
    if (this._multipart === null) {
      this._multipart = yield new Promise((resolve, reject) => {
        this._app.parser.multipart(this, options).then(res => {
          if (typeof res !== 'object') {
            this.error(400);
            reject('body_empty');
          } else {
            resolve(res);
          }
        }, err => {
          this._error(err);
          reject(err);
        }).catch(err => {
          reject(err);
        });
      })
    }
    return this._multipart;
  }
}

module.exports = SilenceContext;
