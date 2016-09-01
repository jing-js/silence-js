'use strict';

const $util = require('util');
const util = require('silence-js-util');
const SilenceContext = require('./context');
const cluster = require('cluster');
const FreeList = util.FreeList;
const RouteManager = require('./route');
const CookieStore = require('./cookie');
const co = require('co');
const DEFAULT_PORT = 80;
const DEFAULT_HOST = '0.0.0.0';

const http = require('http');
const STATUS_CODES = http.STATUS_CODES;
const NOT_FOUND_MESSAGE = `{\n  "code": 404,\n  "data": "${STATUS_CODES['404']}"\n}`;
const NOT_AVALIABLE_MESSAGE_1 = `{\n "code": 503,\n "data": "${STATUS_CODES['503']}, Server Reloading"\n}`;
const NOT_AVALIABLE_MESSAGE_2 = `{\n "code": 503,\n "data": "${STATUS_CODES['503']}, Too Many Connections"\n}`;

if (cluster.isWorker) {
  process.title = 'SILENCE_JS_WORKER_' + cluster.worker.id;
} else {
  process.title = 'SILENCE_JS';
}

class SilenceApplication {
  constructor(config) {
    this.cors = config.cors || false;
    this.logger = config.logger;
    this.db = config.db;
    this.session = config.session;
    this.hash = config.hash;
    this.parser = config.parser;
    this._route = config.RouteManagerClass ? config.RouteManagerClass(config.logger) : new RouteManager(config.logger);
    this._CookieStoreFreeList = new FreeList(config.CookieStoreClass || CookieStore, config.freeListSize);
    this._ContextFreeList = new FreeList(config.ContextClass || SilenceContext, config.freeListSize);


    this.__MAXAllowedPCU = config.maxAllowedPCU || 0xfffffff0;
    this.__PCUBound = config.PCUBound || 1000;
    this.__cleanup = false;
    this.__needReload = false;
    this.__connectionCount = 0;
    this.__maxConnectionCount = 0;

    process.on('uncaughtException', err => {
      this.logger.error('UNCAUGHT EXCEPTION');
      this.logger.error(err.stack || err.message || err.toString());
    });

    if (cluster.isWorker) {
      process.on('message', msg => {
        if (msg === 'RELOAD') {
          this.__needReload = true;
          this.__checkReload();
        } else if (msg === 'STATUS') {
          util.logStatus(this.__collectStatus());
        } else if (msg === 'STOP') {
          this._exit(true);
        }
      });
    }
    process.on('SIGINFO', () => {
      util.logStatus(this.__collectStatus());
    });
    process.on('SIGHUP', () => {
      this.__needReload = true;
      this.__checkReload();
    });
  }

  __collectStatus() {
    return {
      connectionCount: this.__connectionCount
    };
  }

  __checkReload() {
    if (this.__connectionCount === 0 && this.__needReload) {
      this.logger.debug(process.title, 'exit for reload');
      this._exit(true);
    }
  }

  _end(request, response, statusCode, text) {
    this.__connectionCount--;
    response.writeHead(statusCode);
    response.end(text);
    // 如果还有更多的数据, 直接 destroy 掉。防止潜在的攻击。
    // 大部份 web 服务器, 当 post 一个 404 的 url 时, 如果跟一个很大的文件, 也会让文件上传
    //  (虽然只是在内存中转瞬即逝, 但总还是浪费了带宽)
    // nginx 服务器对于 404 也不是立刻返回, 也会等待文件上传。 只不过 nginx 有默认的 max_body_size
    // 暂时不清楚是否可以更直观地判断, request 中是否还有待上传的内容。
    request.on('data', () => {
      request.destroy();
    });
  }
  handle(request, response) {
    if (this.__needReload) {
      this._end(request, response, 503, NOT_AVALIABLE_MESSAGE_1);
      return;
    }

    this.__connectionCount++;
    let bound = (this.__connectionCount / this.__PCUBound) | 0;
    if (this.__maxConnectionCount < bound) {
      this.__maxConnectionCount = bound;
      this.logger.info('[PCU] Meet peak concurrent connections new up', this.__connectionCount);
    }

    if (this.__connectionCount > this.__MAXAllowedPCU) {
      this._end(request, response, 503, NOT_AVALIABLE_MESSAGE_2);
      this.logger.access(request.method, 503, 1, request.headers['content-length'] || 0, 0, null, util.getClientIp(request), request.headers['user-agent'], request.url);
      return;
    }

    let handler = this._route.match(request.method, request.url, "OPTIONS_HANDLER");
    if (handler === null) {
      this._end(request, response, 404, NOT_FOUND_MESSAGE);
      this.logger.access(request.method, 404, 1, request.headers['content-length'] || 0, 0, null, util.getClientIp(request), request.headers['user-agent'], request.url);
      this.__checkReload();
      return;
    }

    if (this.cors) {
      response.setHeader('Access-Control-Allow-Origin', this.cors);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (handler === 'OPTIONS_HANDLER') {
      this.logger.access('OPTIONS', 200, 1, request.headers['content-length'] || 0, 0, null, util.getClientIp(request), request.headers['user-agent'], request.url);
      this._end(request, response, 200);
      this.__checkReload();
      return;
    }

    let ctx = this._ContextFreeList.alloc(this, request, response);

    let app = this;
    co(function*() {
      if (app.session) {
        yield app.session.touch(ctx);
      }
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
      } else if (util.isFunction(handler.fn)) {
        return handler.fn.apply(ctx, handler.params);
      } else {
        app.logger.error(`Handler is not function`);
      }
    }).then(res => {
      if (ctx._cookie && ctx._cookie._cookieToSend.length > 0) {
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
      if (err) {
        app.logger.error(err.stack || err.mssage || err.toString());
        if (!ctx.isSent) {
          ctx.error(500);
        }
      }
      let identity = ctx._user ? ctx._user.id : null;
      app.logger.access(ctx.method, ctx._code, ctx.duration, request.headers['content-length'] || 0, ctx._body.length, identity, util.getClientIp(request), request.headers['user-agent'], request.url);
      app._ContextFreeList.free(ctx);
      app.__connectionCount--;
      app.__checkReload();
    }
  }

  initialize() {
    return this.logger.init().then(msg => {
      this.logger.debug(msg || 'logger got ready');
      return Promise.all([
        this.db ? this.db.init().then(msg => {
          this.logger.debug(msg || 'database got ready.');
        }) : Promise.resolve(),
        this.session ? this.session.init().then(msg => {
          this.logger.debug(msg || 'session got ready.');
        }) : Promise.resolve(),
        this.hash ? this.hash.init().then(msg => {
          this.logger.debug(msg || 'password hash got ready.');
        }) : Promise.resolve()
      ]).then(() => {
        process.on('exit', this._exit.bind(this, false));
        process.on('SIGTERM', this._exit.bind(this, true));
        process.on('SIGINT', this._exit.bind(this, true));
      });
    });
  }

  _exit(needExit) {
    if (this.__cleanup) {
      return;
    }
    console.log(`${process.title} Bye!`);
    this.__cleanup = true;
    this.logger.close();
    this.db && this.db.close();
    this.hash && this.hash.close();
    this.session && this.session.close();
    needExit && process.exit();
  }

  listen(listenConfig) {
    let port = listenConfig.port || DEFAULT_PORT;
    let host = listenConfig.host || DEFAULT_HOST;
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
