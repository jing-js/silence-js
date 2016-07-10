'use strict';

const util = require('silence-js-util');
const SilenceContext = require('./context');
const RouteManager = require('./route');
const CookieStore = require('./cookie');
const co = require('co');
const DEFAULT_PORT = 80;
const DEFAULT_HOST = '0.0.0.0';

const http = require('http');


class SilenceApplication {
  constructor(config) {
    this.cors = config.cors || false;
    this.logger = config.logger;
    this.db = config.db;
    this.session = config.session;
    this.hash = config.hash;
    this.parser = config.parser;
    this._ContextClass = config.ContextClass || SilenceContext;
    this._CookieStoreClass = config.CookieStoreClass || CookieStore;
    this._route = config.RouteManagerClass ? config.RouteManagerClass(config.logger) : new RouteManager(config.logger);

    process.on('uncaughtException', err => {
      this.logger.error('UNCAUGHT EXCEPTION');
      this.logger.error(err);
    });
  }

  handle(request, response) {
    let handler = this._route.match(request.method, request.url, "OPTIONS_HANDLER");
    if (handler === null) {
      this.logger.error(`(404) ${request.method} ${request.url} not found`);
      response.writeHead(404);
      response.end();
      // 如果还有更多的数据, 直接 destroy 掉。防止潜在的攻击。
      // 大部份 web 服务器, 当 post 一个 404 的 url 时, 如果跟一个很大的文件, 也会让文件上传
      //  (虽然只是在内存中转瞬即逝, 但总还是浪费了带宽)
      // nginx 服务器对于 404 也不是立刻返回, 也会等待文件上传。 只不过 nginx 有默认的 max_body_size
      request.on('data', () => {
        this.logger.debug('DATA RECEIVED AFTER END');
        request.destroy();
      });
      return;
    }
    if (this.cors) {
      response.setHeader('Access-Control-Allow-Origin', this.cors);
    }
    if (handler === 'OPTIONS_HANDLER') {
      response.end();
      request.on('data', () => {
        this.logger.debug('DATA RECEIVED AFTER END');
        request.destroy();
      });
      return;
    }


    let ctx = new this._ContextClass(this, request, response);

    let app = this;
    co(function*() {
      yield app.session.touch(ctx);
      for (let i = 0; i < handler.middlewares.length; i++) {
        let fn = handler.middlewares[i];
        if (util.isGenerateFunction(fn)) {
          yield fn.apply(ctx, handler.params);
        } else {
          fn.apply(ctx, handler.params);
        }
        if (ctx.isSent) {
          return;
        }
      }
      if (util.isGenerateFunction(handler.fn)) {
        return yield handler.fn.apply(ctx, handler.params);
      } else {
        return handler.fn.apply(ctx, handler.params);
      }
    }).then(res => {
      if (ctx.cookie._cookieToSend !== null) {
        response.setHeader('Set-Cookie', ctx.cookie._cookieToSend);
      }
      if (!ctx.isSent) {
        if (!util.isUndefined(res)) {
          ctx.success(res);
        } else if (ctx._body !== null) {
          ctx.success(ctx._body);
        } else {
          ctx.error(404);
        }
      }
      _destroy();
    }, _destroy).catch(_destroy);
    
    function _destroy(err) {
      console.log('finish request', err);
      if (err) {
        app.logger.error(err);
        if (!ctx.isSent) {
          ctx.error(500);
        }
      }
      ctx.destroy();
    }
  }

  initialize() {
    return this.logger.init().then(msg => {
      this.logger.debug(msg || 'logger got ready');
      return Promise.all([
        this.db.init().then(msg => {
          this.logger.debug(msg || 'database got ready.');
        }),
        this.session.init().then(msg => {
          this.logger.debug(msg || 'session got ready.');
        }),
        this.hash.init().then(msg => {
          this.logger.debug(msg || 'password hash got ready.');
        })
      ]);
    });
  }

  listen(port = DEFAULT_PORT, host = DEFAULT_HOST) {
    if (util.isObject(port)) {
      host = port.host || DEFAULT_HOST;
      port = port.port || DEFAULT_PORT;
    }
    return this.initialize().then(() => {
      return new Promise((resolve, reject) => {
        // nextTick 使得 listen 函数在路由定义之前调用,
        // 也仍然会在全部路由定义好之后才真正执行
        process.nextTick(() => {
          this._route.build();
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
    this._route.post(...args);
    return this;
  }

  rest(...args) {
    this._route.rest(...args);
    return this;
  }

  put(...args) {
    this._route.put(...args);
    return this;
  }

  del(...args) {
    this._route.del(...args);
    return this;
  }

  head(...args) {
    this._route.head(...args);
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
