'use strict';

var _ = require('underscore');
var urlUtil = require('./url.js');
var bodyParse = require('./body.js')({});
var routeList = [];
var rootState = null;

function isG(fn) {
  return fn.constructor.name === 'GeneratorFunction';
}

class State {
  constructor(parent, url, midWares) {
    this.fullUrl = parent ? urlUtil.join(parent.fullUrl, url) : url;
    this.midWares = parent ? parent.midWares.concat(midWares) : midWares;
  }
  _route(method, args) {
    let routeFn = args[args.length - 1];
    let passUrl = _.isString(args[0]);
    let url = passUrl ? urlUtil.join(this.fullUrl, args[0]) : this.fullUrl;
    if (!_.isFunction(routeFn)) {
      throw new Error('bad route arguments. last parameter should be handle function. url:' + url);
    }

    let urlMatcher = urlUtil.parse(url);
    let midWares = this.midWares.concat(args.slice(passUrl ? 1 : 0, args.length - 1));

    let proto = {};
    midWares.forEach(mw => {
      if (!_.isFunction(mw)) {
        throw new Error('bad route argument. middleware must be function. url:' + url);
      }
      proto[mw.__JING_NS__] = {
        writable: true,
        enumerable: true
      };
    });
    routeList.push({
      method: method,
      urlMatcher: urlMatcher,
      handler: routeFn,
      midWares: midWares,
      proto: proto
    });
  }
  extend(...args) {
    let passUrl = _.isString(args[0]);
    let url = passUrl ? args[0] : '';
    return new State(this, url, passUrl ? args.slice(1) : args);
  }
  get(...args) {
    this._route('GET', args);
  }
  post(...args) {
    this._route('POST', args);
  }
  put(...args) {
    this._route('PUT', args);
  }
  del(...args) {
    this._route('DELETE', args);
  }
  remove(...args) {
    this._route('DELETE', args);
  }
  head(...args) {
    this._route('HEAD', args);
  }
  all(...args) {
    this._route('GET', args);
    this._route('POST', args);
  }
}

module.exports = function middleware(app) {

  app.createRootState = function(...args) {
    if (rootState) {
      throw new Error('createRootState can be only called once.');
    }
    rootState = new State(null, '', args);
    return rootState;
  };

  return function* dealRoute(next) {
    let url = this.request.originalUrl;
    for (let i = 0; i < routeList.length; i++) {
      let med = routeList[i].method;
      if (this.request.method !== med) {
        continue;
      }
      let matcher = routeList[i].urlMatcher;
      let params = matcher.match(url);
      if (params === null) {
        continue;
      } else {
        // 把url的params写到上下文中. 这种直接在 this 上赋值的方法，
        //   会不会不如预先在上下文的构造函数中生命好 params 性能好?
        // todo check performance and find better method
        this.params = params;
      }
      if (med === 'POST' || med === 'PUT') {
        yield bodyParse(this);
      }
      let handler = routeList[i].handler;
      let midWares = routeList[i].midWares;
      //这里是否是最快的拷贝并生成新的object的方法？
      //直接在上下文中增加middleware属性是否是最佳方法？
      //todo check performance and find better method
      this.middleware = Object.create(null, routeList[i].proto);
      for (let j = 0; j < midWares.length; j++) {
        let midFn = midWares[j];
        let fType = midFn.__JING_TYPE__; //roles or services
        let result = isG(midFn) ? yield midFn.call(this) : midFn.call(this);
        let midVal = result;
        if (fType === 'roles') {
          if (!Array.isArray(result)) {
            throw new Error('roles目录下，函数返回值要求一定是Array类型，第0个元素代码是否通过身份权限验证');
          }
          if (!result[0]) {
            this.throw(401, 'access_denied');
          }
          midVal = result[1];
        }
        this.middleware[midFn.__JING_NS__] = midVal;
      }

      if (isG(handler)) {
        yield handler.call(this);
      } else {
        handler.call(this);
      }

      break; //目前的策略采用唯一性route，一但某个route匹配，则不再判断其它route是否匹配。
    }
    yield next;
  }
};


