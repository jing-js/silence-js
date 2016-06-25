'use strict';

const util = require('../util/util');

function parseCookies(str) {
  let cookies = new Map();

  if (str === '') {
    return cookies;
  }

  str.split(';').forEach(pair => {
    let idx = pair.indexOf('=');
    if (idx < 0) {
      return;
    }
    let key = pair.substr(0, idx).trim();
    if (cookies.has(key)) {
      return; //only accept once
    }
    let val = pair.substr(++idx, pair.length).trim();
    if (val.length > 0 && '"' === val[0]) {
      val = val.slice(1, -1);
    }
    try {
      cookies.set(key, decodeURIComponent(val));
    } catch(ex) {
      // ignore
    }
  });
  return cookies;
}

function parseCookieStr(name, val, options) {
  let str = `${name}=${encodeURIComponent(val)}`;
  util.isNumber(options.maxAge) && (str += '; Max-Age=' + options.maxAge);
  options.domain && (str += '; Domain=' + options.domain);
  options.path && (str += '; Path=' + options.path);
  if (options.expires) {
    let date = options.expires instanceof Date ? options.expires : new Date(options.expires);
    str += '; Expires=' + date.toUTCString();
  }
  options.httpOnly !== false && (str += '; HttpOnly');
  options.secure && (str += '; Secure');

  if (options.sameSite) {
    switch (options) {
      case true:
        str += '; SameSite=Strict';
        break;
      case 'lax':
        str += '; SameSite=Lax';
        break;
      case 'strict':
        str += '; SameSite=Strict';
        break;
    }
  }

  return str;
}

class CookieStore {
  constructor(ctx) {
    this.ctx = ctx;
    this._cookies = null;
  }
  get(name) {
    if (!this._cookies) {
      this._cookies = parseCookies(this.ctx.originRequest.headers.cookie || '');
    }
    return this._cookies.get(name);
  }
  set(name, val, options = {}) {
    this.ctx.originResponse.setHeader('Set-Cookie', parseCookieStr(name, val, options));
  }
  destroy() {
    this.ctx = null;
  }
}

module.exports = CookieStore;
