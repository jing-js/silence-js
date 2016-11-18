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
const OPTIONS_HANDLER = 'OPTIONS';
const http = require('http');

class SilenceApplication {
  constructor(config) {
    this.cors = config.cors || false;
    this.logger = config.logger;
    this.db = config.db;
    this.session = config.session;
    this.hash = config.hash;
    this.parser = config.parser;
    this.mailers = config.mailers;
    this.asset = config.asset;
    this.passwordService = config.passwordService;
    this.configParameters = config.parameters || {};
    this._route = config.router ? config.router : new RouteManager(config.logger);
    this._CookieStoreFreeList = new FreeList(config.CookieStoreClass || CookieStore, config.freeListSize);
    this._ContextFreeList = new FreeList(config.ContextClass || SilenceContext, config.freeListSize);


    this.__MAXAllowedPCU = config.maxAllowedPCU || 0xfffffff0;
    this.__cleanup = false;
    this.__needReload = false;
    this.__connectionCount = 0;

    process.on('uncaughtException', err => {
      this.logger.serror('uncaught', err);
    });

    if (cluster.isWorker) {
      process.on('message', msg => {
        if (msg === 'RELOAD' || msg === 'STOP') {
          this._exit(true);
        } else if (msg === 'STATUS') {
          util.logStatus(this.__collectStatus());
        }
      });
    }

    process.on('SIGTERM', () => {
      this._exit(true);
    });
    process.on('SIGINFO', () => {
      util.logStatus(this.__collectStatus());
    });
    process.on('SIGHUP', () => {
      this._exit(true);
    });
  }

  __collectStatus() {
    return {
      connections: this.__connectionCount,
      db: this.db.__collectStatus(),
      logger: this.logger.__collectStatus()
    };
  }

  _end(request, response, statusCode) {
    response.writeHead(statusCode);
    response.end();
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
    if (this.__cleanup) {
      // already exited
      this._end(request, response, 503);
      return;
    }

    if (this.__connectionCount + 1 > this.__MAXAllowedPCU) {
      this._end(request, response, 503)
      return;
    }

    let handler = this._route.match(request.method, request.url, OPTIONS_HANDLER);
    if (handler === undefined) {
      this._end(request, response, 404);
      this.logger.access(request.method, 404, 1, request.headers['content-length'] || 0, 0, null, util.getClientIp(request), util.getRemoteIp(request), request.headers['user-agent'], request.url);
      return;
    }

    if (this.cors) {
      response.setHeader('Access-Control-Allow-Origin', this.cors);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (handler === OPTIONS_HANDLER) {
      this._end(request, response, 200);
      this.logger.access('OPTIONS', 200, 1, request.headers['content-length'] || 0, 0, null, util.getClientIp(request), util.getRemoteIp(request), request.headers['user-agent'], request.url);
      return;
    }

    let ctx;
    try {
      ctx = this._ContextFreeList.alloc(this, request, response);
    } catch(ex) {
      // error here is almost impossible
      this.logger.serror('app', ex);
      this._end(request, response, 500);
      return;
    }
    
    let app = this;
    let __destroied = false;
    let __final = false;
    let __cleanup = false;
    this.__connectionCount++;
    co(function*() {
      if (app.session) {
        yield app.session.touch(ctx, handler);
        if (ctx.isSent) {
          return;
        }
      }
      if (handler.middlewares !== undefined) {
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
      }
      if (util.isGenerateFunction(handler.fn)) {
        return yield handler.fn.apply(ctx, handler.params);
      } else if (util.isFunction(handler.fn)) {
        return handler.fn.apply(ctx, handler.params);
      } else {
        app.logger.serror('app', `Handler is not function`);
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
      if (ctx.__parseState === 0) {
        ctx.__parseOnEnd = _final;
        ctx._originRequest.resume()
      } else {
        _final();
      }
    }).catch(_destroy).catch(err => {
      if (__cleanup) return;
      app.__connectionCount--;
      __cleanup = true;
      __final = true;
      __destroied = true;
    });
    
    function _destroy(err) {
      if (__destroied) {
        return;
      }
      __destroied = true;
      if (err) {
        app.logger.error(err);
        if (!ctx.isSent) {
          ctx.error(500);
        }
      }
      if (ctx.__parseState === 0) {
        ctx.__parseOnEnd = _final;
        ctx._originRequest.resume();
      } else {
        _final();
      }
    }

    function _final() {
      if (__final) {
        return;
      }
      __final = true;
      ctx.finallySend();
      let identity = ctx._user ? ctx._user.id : null;
      app.logger.access(ctx.method, ctx._code, ctx.duration, request.headers['content-length'] || 0, ctx._body ? ctx._body.length : 0, identity, util.getClientIp(request), util.getRemoteIp(request), request.headers['user-agent'], request.url);
      app._ContextFreeList.free(ctx);
      app.__connectionCount--;
      __cleanup = true;
    }
  }

  initialize() {

    process.on('exit', this._exit.bind(this, false));
    process.on('SIGTERM', this._exit.bind(this, true));
    process.on('SIGINT', this._exit.bind(this, true));

    return this.logger.init().then(() => {
      this.logger.sinfo('app', 'logger ready.');
      return new Promise((resolve, reject) => {
        let timeOuted = false;
        let tm = setTimeout(() => {
          timeOuted = true;
          reject(new Error('application initialize timeout'));
        }, 10000);
        Promise.all([
          this.db ? this.db.init().then(() => {
            !timeOuted && this.logger.sinfo('app', 'db ready.');
          }) : Promise.resolve(),
          this.session ? this.session.init().then(() => {
            !timeOuted && this.logger.sinfo('app', 'session ready.');
          }) : Promise.resolve()
        ]).then(() => {
          if (timeOuted) {
            return;
          }
          clearTimeout(tm);
          resolve();
        }, err => {
          clearTimeout(tm);
          reject(err);
        }).catch(err => {
          console.log(err);
          clearTimeout(tm);
        });
      });
    });
  }

  _exit(needExit, exitCode = 0) {
    if (this.__cleanup) {
      return;
    }
    this.__cleanup = true;
    let _closeWrap = (m, name) => {
      return new Promise(res => {
        m.close().then(() => {
          this.logger.sinfo('app', name, 'closed.');
          res();
        }, err => {
          this.logger.sinfo('app', name, 'closed with error', err.message);
          res();
        });
      }).catch(ex => {
        this.logger.serror('app', ex);
      });
    }
    let arr = [];
    this.db && arr.push(_closeWrap(this.db, 'db'));
    this.session && arr.push(_closeWrap(this.session, 'session'));

    for(let k in this.mailers) {
      arr.push(this.mailers[k].close());
    }
    Promise.all(arr).then(() => {
      this.logger.sinfo('app', process.title, 'Bye!');
      return new Promise(res => {
        this.logger.close().then(() => {   // finaly we close logger
          console.log('logger closed.');   // as logger has been closed, we can only use console
          res();
        }, err => {
          console.log('logger closed with error', err.message);
          res();
        });
      });
    }).then(() => {
      console.log(process.title, 'process exit.');
      needExit && process.exit(exitCode);
    }).catch(ex => {
      console.log(ex);
      needExit && process.exit(1);
    });
  }

  exit(err) {
    err && this.logger.serror('app', err);
    this._exit(true, 1);
  }

  listen(listenConfig) {
    let port = listenConfig.port || DEFAULT_PORT;
    let host = listenConfig.host || DEFAULT_HOST;
    return new Promise((resolve, reject) => {
      let __ret = false;
      this.initialize().then(() => {
        // nextTick 使得 listen 函数在路由定义之前调用,
        // 也仍然会在全部路由定义好之后才真正执行
        process.nextTick(() => {
          this._route.build();
          let server = http.createServer((request, response) => {
            this.handle(request, response);
          });
          server.on('error', err => {
            if (__ret) {
              this.logger.serror('app', err);
            } else {
              __ret = true;
              reject(err);
            }
          });
          server.listen(port, host, () => {
            __ret = true;
            resolve();
          });
        });
      }, reject).catch(reject);
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
