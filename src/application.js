'use strict';

const util = require('silence-js-util');
const SilenceContext = require('./context');
const RouteManager = require('./route');
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
    this._route = new RouteManager(config.logger);

    process.on('uncaughtException', err => {
      this.logger.error('UNCAUGHT EXCEPTION');
      this.logger.error(err);
    });
  }

  handle(request, response) {
    if (this.cors) {
      response.setHeader('Access-Control-Allow-Origin', this.cors);
    }
    let ctx = new SilenceContext(this, request, response);
    let handler = this._route.match(ctx);
    if (!handler) {
      this.logger.warn(`(404) ${ctx.method} ${request.url} not found`);
      ctx.error(404);
      ctx.destroy();
      return;
    }

    var app = this;
    co(function*() {
      yield app.session.check(ctx);
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
    }).catch(err => {
      this.logger.error(err);
      ctx.error(500);
      ctx.destroy();
    });
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
