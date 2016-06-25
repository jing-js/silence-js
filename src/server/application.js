'use strict';

const util = require('../util/util');
const SilenceContext = require('./context');
const uuid = require('uuid');
const Route = require('./route');
const co = require('co');
const DEFAULT_PORT = 80;
const DEFAULT_HOST = '0.0.0.0';

const http = require('http');


class SilenceApplication {
  constructor(config, logger, db, session, hasher, SessionUser) {
    this.cors = config.cors || false;
    this.logger = logger;
    this.db = db;
    this.session = session;
    this.hasher = hasher;
    this._route = new Route('/');
    this.SessionUser = SessionUser;
    this._sessionKey = config.session.key || 'SILENCE_SESSION';

    process.on('uncaughtException', err => {
      this.logger.error('UNCAUGHT EXCEPTION');
      this.logger.error(err);
    });
  }
  _getSessionKey() {
    return uuid.v4();
  }
  *_checkSessionUser(ctx) {
    let sid = ctx.cookie.get(this._sessionKey); //fetch cookie
    let ru;
    if (!sid) {
      ctx.cookie.set(this._sessionKey, this._getSessionKey());
      return;
    }
    ru = yield ctx.session.get(sid);
    if (ru) {
      let user = new this.SessionUser(ctx);
      user.isLogin = true;
      user.sessionKey = sid;
      user.rememberMe = ru.rememberMe;
      ctx._user = user;
    }
  }
  handle(request, response) {
    if (this.cors) {
      response.setHeader('Access-Control-Allow-Origin', this.cors);
    }
    let ctx = new SilenceContext(this, request, response);
    let handler = this._route.match(ctx.url.path, 0);
    if (!handler || (handler.method !== 'ALL' && handler.method !== request.method)) {
      this.logger.warn(`${request.url} not found`);
      ctx.error(404);
      ctx.destroy();
      return;
    }

    var app = this;
    co(function* () {
      yield app._checkSessionUser(ctx);
      for(let i = 0; i < handler.middlewares.length; i++) {
        let fn = handler.middlewares[i];
        if (util.isGenerateFunction(fn)) {
          yield fn.apply(ctx, handler.params);
        } else {
          fn.apply(ctx, handler.params);
        }
        if (ctx.response.isSent) {
          return;
        }
      }
      console.log(ctx._user);
      if (util.isGenerateFunction(handler.fn)) {
        return yield handler.fn.apply(ctx, handler.params);
      } else {
        return handler.fn.apply(ctx, handler.params);
      }
    }).then(res => {
      console.log(res);
      if (!ctx.isSent) {
        if (!util.isUndefined(res)) {
          ctx.success(res);
        } else if (ctx._body !== undefined) {
          ctx.success(ctx._body);
        } else {
          ctx.error(404);
        }
      }
      ctx.destroy();
    }, err => {
      this.logger.error(err);
      ctx.error(500);
      ctx.destroy();
    });
  }
  __printRoute(route) {

    function loop(p, level) {
      console.log(new Array(level).fill(0).map(() => ' ').join('') + String.fromCharCode(p.val));
      p.next.forEach(function (c) {
        loop(c, level + 1);
      });
    }

    loop(route, 0);
  }
  __printTree(tree) {
    console.log(tree)
    function loop(t, level) {
      console.log(new Array(level).fill(0).map(() => ' ').join('') + t.val + (t.handler ? `[h:${t.handler.method} ${t.handler.fn.name}]` : ''));
      t.next.forEach(function (c) {
        loop(c, level + 1);
      });
    }
    loop(tree, 0)
  }
  listen(port = DEFAULT_PORT, host = DEFAULT_HOST) {
    if (util.isObject(port)) {
      host = port.host || DEFAULT_HOST;
      port = port.port || DEFAULT_PORT;
    }
    return this.logger.init().then(msg => {
      this.logger.debug(msg || 'logger got ready');
      return Promise.all([
        new Promise(res => {
          // nextTick 使得 listen 函数在路由定义之前调用,
          // 也仍然会在全部路由定义好之后才真正执行
          process.nextTick(() => {
            this._route = Route.buildRouteTree(this._route);
            res();
          });
        }),
        this.db.init().then(msg => {
          this.logger.debug(msg || 'database got ready.');
        }),
        this.session.init().then(msg => {
          this.logger.debug(msg || 'session got ready.');
        }),
        this.hasher.init().then(msg => {
          this.logger.debug(msg || 'password hasher got ready.');
        })
      ]).then(() => {
        return new Promise((resolve, reject) => {
          let server = http.createServer((request, response) => {
            this.handle(request, response);
          });
          server.on('error', reject);
          server.listen(port, host, resolve);
        });
      });
    });
  }


  /*
   * route helper
   */
  get(...args) {
    this._route.get(...args);
    return this;
  }
  post(...args) {
    this._route.get(...args);
    return this;
  }
  rest(...args) {
    this._route.get(...args);
    return this;
  }
  put(...args) {
    this._route.get(...args);
    return this;
  }
  del(...args) {
    this._route.del(...args);
    return this;
  }
  group(...args) {
    this._route.group(...args);
    return this;
  }
  all(...args) {
    this._route.all(...args);
    return this;
  }
}

module.exports = SilenceApplication;
