'use strict';

const util = require('silence-js-util');
const url = require('url');

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
    this._uid = null;
    this._cookie = null;
    this._store = null;
    this._code = 0;
    this._isSent = false;
    this._type = 'application/json; charset=utf-8';
    this._body = null;
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
    if (this.__parseState !== 2) {
      this._app.logger.serror('context', '$$freeListFree: request __parseState unexpected');
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
    this._type = 'application/json; charset=utf-8';
    this._body = null;
    this._uid = null;
    this._query = null;
    this._post = null;
    this._multipart = null;
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
      me.__parseState = 2;
      clear();
      if (err && err !== 'request_aborted') {
        me.logger.error(err);
        process.nextTick(function() {req.destroy()});
      }
      if (me.__parseOnEnd) {
        me.__parseOnEnd(err);
        me.__parseOnEnd = null;
      }
    }
    function clear() {
      req.removeListener('error', onEnd);
      req.removeListener('aborted', onAborted);
      req.removeListener('end', onEnd);
      req.removeListener('close', onEnd);
      req.removeListener('data', onData);
      if (rateTM !== null) {
        clearTimeout(rateTM);
        rateTM = null;
      }
    }
    function onAborted() {
      // console.log('aborted');
      process.nextTick(function() {req.destroy()});
      onEnd('request_aborted');
    }
    function onData(chunk) {
      // console.log('r', me.__parseRate, me.__parseLimit, me.__parseBytes)
      // console.log('ctx inner on data', chunk.toString())
      if (me._isSent) {
        if (me._code === 0) {
          me._code = 406;
          me._app.logger.swarn('app', 'unexpected request data');
        }
        process.nextTick(function() {req.destroy()});
        onEnd();
        return;
      }
      me.__parseBytes += chunk.length;
      if (me.__parseLimit > 0 && me.__parseBytes > me.__parseLimit) {
        // console.log('meet size too large', me.__parseBytes, me.__parseLimit);
        me.__parseOnEnd(413);
        me.__parseState = 2;
        me.__parseOnEnd = null;
        process.nextTick(function() {req.destroy()});
        clear();
        return;
      }
      let err = me.__parseOnData(chunk);
      if (err) {
        // console.log('meet error', err);
        me.__parseOnEnd(err);
        me.__parseState = 2;
        me.__parseOnEnd = null;
        process.nextTick(function() {req.destroy()});
        clear();
        return;
      }
      if (me.__parseRate > 0) {
        checkRate();
      }
    }
    function checkRate() {
      rateTM = null;
      let tm = Date.now()  - me.__parseTime;
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
    // console.log('rrrrrsume    ....')
    this._originRequest.resume();
    this.__parseState = 1;
    return true;
  }
  get ENV() {
    return this._app.ENV;
  }
  get duration() {
    return Date.now() - this._duration;
  }
  get method() {
    return this._originRequest.method;
  }
  get ip() {
    return this.util.getClientIp(this._originRequest) || util.getRemoteIp(this._originRequest);
  }
  get clientIp() {
    return this.util.getClientIp(this._originRequest);
  }
  get remoteIp() {
    return this.util.getRemoteIp(this._originRequest);
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
  get mailers() {
    return this._app.mailers;
  }
  get asset() {
    return this._app.asset;
  }
  get isLogin() {
    return this._uid !== null;
  }
  get uid() {
    return this._uid;
  }
  set uid(val) {
    this._uid = val;
  }
  get accessId() {
    return this._uid;
  }
  get isSent() {
    return this._isSent;
  }
  get contentType() {
    return this._type;
  }
  set contentType(val) {
    this._type = val;
  }
  get body() {
    return this._body;
  }
  set body(val) {
    if (this._isSent) {
      logger.serror('context', new Error('set body after response has been sent'));
      return;
    }
    this._body = val;
  }
  setHeader(key, val) {
    this._originResponse.setHeader(key, val);
  }
  _send(code, data) {
    if (this._isSent) {
      this.logger.serror('context', new Error('send body multi times'));
      return;
    }
    this._code = code;
    this._body = this._code !== 0 && this._code < 1000 ? null : JSON.stringify(data !== undefined ? {
      code: this._code,
      data: data
    }: {
      code: this._code
    });
    this._isSent = true;
  }
  finallySend() {
    let hc = this._code === 0 || this._code >= 1000 ? 200 : this._code;
    if (this._body) {
      this._originResponse.setHeader('Content-Type', this._type);
    }
    if (this._cookie && this._cookie._cookieToSend.length > 0) {
      this._originResponse.setHeader('Set-Cookie', this._cookie._cookieToSend);
    }
    this._originResponse.writeHead(hc);
    this._originResponse.end(this._body);
  }
  async logout() {
    this._uid = null;
    return await this._app.session.logout(this);
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
  async post(options) {
    if (this._post === null) {
      this._post = await new Promise((resolve, reject) => {
        this._app.parser.post(this, options).then(res => {
          if (typeof res !== 'object' || res === null) {
            reject(406);
          } else {
            resolve(res);
          }
        }).catch(reject);
      });
    }
    return this._post;
  }
  async multipart(options) {
    if (this._multipart === null) {
      this._multipart = await new Promise((resolve, reject) => {
        this._app.parser.multipart(this, options).then(res => {
          if (typeof res !== 'object' || res === null) {
            reject(406);
          } else {
            resolve(res);
          }
        }).catch(reject);
      });
    }
    return this._multipart;
  }
}

module.exports = SilenceContext;
