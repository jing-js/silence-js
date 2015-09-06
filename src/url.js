'use strict';

const NORMALIZE_URL_REGEXP = /(?:\\+)|(?:\/{2,})/g;

class Url {
  constructor(url) {
    let keys = [];
    let objProto = {};
    let segments = url.split('/').map(s => {
      if (s && s[0] === ':') {
        s = s.substring(1);
        objProto[s] = {
          writable: true,
          enumerable: true
        };
        keys.push(s);
        return '([^/]+)';
      } else {
        return s;
      }
    });
    this.keys = keys;
    this.objProto = objProto;
    this.regExp = new RegExp('^' + segments.join('/').replace(/\/+$/, '') + '\/?$');
  }
  match(requestUrl) {
    let m = requestUrl.match(this.regExp);
    if (!m) {
      return null;
    }
    //这里是否是最快的拷贝并生成新的object的方法？
    //todo check performance and find better method
    var val = Object.create(null, this.objProto);
    for (let i = 0; i <= this.keys.length; i++) {
      if (m[i+1]) {
        val[this.keys[i]] = m[i+1];
      }
    }
    return val;
  }
}

module.exports = {
  join(...urls) {
    return this.normalize(urls.join('/'));
  },
  normalize(url) {
    return url.replace(NORMALIZE_URL_REGEXP, '/');
  },
  parse(url) {
    var nUrl = this.normalize(url);
    if (nUrl[0] !== '/') {
      nUrl = '/' + nUrl;
    }
    return new Url(nUrl);
  }
};