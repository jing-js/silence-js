'use strict';

const util = require('silence-js-util');


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
  constructor() {

    this.$$freeListPosition = -1;
    this.$$freeListNext = -1;

    this._cookie = '';
    this._cookieToSend = [];
  }
  $$freeListFree() {
    this._cookie = '';
    this._cookieToSend.length = 0;
  }
  $$freeListInit(ctx) {
    this._cookie = ctx._originRequest.headers.cookie || '';
  }
  get(name) {
    if (this._cookie === '') {
      return null;
    }
    let idx = 0;
    let c = 0;
    let p0 = 0;
    while(true) {
      idx = this._cookie.indexOf(name, idx);
      if (idx < 0) {
        return null;
      }
      p0 = idx + name.length;
      if (p0 >= this._cookie.length) {
        return null;
      }
      if (idx > 0) {
        c = this._cookie.charCodeAt(idx - 1);
        if (c !== 32 && c!== 61 && c !== 59) {
          idx = p0;
          continue;
        }
      }
      idx = p0;
      c = this._cookie.charCodeAt(idx);
      if (c === 32 || c === 61) {
        break;
      }
    }

    p0 = -1;
    let p1 = -1;
    while(idx < this._cookie.length) {
      c = this._cookie.charCodeAt(idx);
      if (p0 < 0 && c !== 32 && c !== 61) {
        p0 = idx;
      }
      if (c === 59) {
        p1 = idx;
        break;
      }
      idx++;
    }
    if (p0 < 0) {
      return '';
    }
    return this._cookie.substring(p0, p1 < 0 ? this._cookie.length : p1);
  }
  set(name, val, options = {}) {
    this._cookieToSend.push(parseCookieStr(name, val, options));
  }
}

module.exports = CookieStore;
