'use strict';

var _ = require('underscore');
var koa = require('koa');
var session = require('./session.js');
var route = require('./route.js');
var path = require('path');
var fs = require('fs');
var logger = require('./logger.js');

module.exports.PromisedObserver = require('./observer.js');
module.exports.BaseLogger = logger.BaseLogger;
module.exports.BaseModel = require('./model.js').BaseModel;
module.exports.BaseSessionStore = session.BaseSessionStroe;
module.exports.BaseDatabaseStore = require('./database.js').BaseDatabaseStore;
module.exports.ConsoleLogger = logger.ConsoleLogger;
module.exports.MySqlDatabaseStore = require('./mysql.js');
module.exports.RedisSessionStore = require('./redis.js');
module.exports.CryptoPasswordHash = require('./crypto.js');
console.log(process.cwd())
var app = null;
var _r = {
  promise: null,
  resolve: null,
  reject: null,
  result: null,
  state: 0
};

function onReady(err) {
  if (err) {
    _r.state = -1;
    _r.result = err;
    if (_r.reject) {
      _r.reject(err);
    }
  } else {
    _r.state = 1;
    if (_r.resolve) {
      _r.resolve(true);
    }
  }
  _r.reject = null;
  _r.resolve = null;
  _r.promise = null;
}

var _midwares_proto = {
  roles: {},
  services: {}
};

module.exports.app = function factory(config) {
  if (app) {
    //singleton factory
    throw new Error('只允许一个app实例');
  }

  app = koa();

  let _logger = new config.logger['class'](config.logger); //initialize logger

  /*
   * app.context.xxx 的赋值，可以使得在controller中 this.xxx 就能取到。
   * 如果说v8引擎在生成koa的上下文实例时，没有为 xxx 分配空间，
   * 而是每次请求来了后，再动态地添加 xxx 属性，会不会有性能的影响呢？我不知道……
   */
  app.context.sendAjax = sendAjax;
  app.context.logger = _logger;
  app.logger = _logger;

  app.on('error', function(err) {
    _logger.debug(err.message);
  });


  if (config.server.access_control_allow_origin) {
    app.use(function* setAccessControl(next) {
      this.set('Access-Control-Allow-Origin', config.server.access_control_allow_origin);
      yield next;
    });
  }

  var _db = new config.db['class'](config.db, _logger);
  var _session = new config.session['class'](config.session, _logger);
  var _hasher = new config.hash['class'](config.hash);
  app.context.hasher = _hasher;
  app.context.db = _db;
  app.context.session = _session;

  Promise.all([
    _hasher.ready().then(function() {
      _logger.debug('hasher ready');
    }),
    _logger.ready().then(function() {
      _logger.debug('logger ready');
    }),
    _db.ready().then(function() {
      _logger.debug('db ready');
    }),
    _session.ready().then(function() {
      _logger.debug('session ready');
    })
  ]).then(function() {
    /*
     * 遍历models目录下的Model，初始化（包括创建表）
     */
    let root = process.cwd();
    let arr = [];
    function loop(dir) {
      fs.readdirSync(dir).forEach(file => {
        let fullpath = path.join(dir, file);
        if (!fs.statSync(fullpath).isDirectory()) {
          let model = require(fullpath);
          let scheme = model.prototype.__scheme;
          scheme.db = _db;
          arr.push(_db.createTable(scheme));
        } else {
          loop(fullpath);
        }
      });
    }
    loop(path.join(root, 'models'));

    Promise.all(arr).then(function() {
      _logger.debug('models ready');
      onReady();
    }, onError);

  }, onError);

  function onError(err) {
    _db.close();
    _session.close();
    onReady(err);
  }
  app.use(session(app));
  app.use(route(app));

  /*
   * 检索 roles, controllers, services 目录，
   *   加载中间件和处理函数。
   */
  loopLoad(app, 'roles');
  loopLoad(app, 'controllers');
  loopLoad(app, 'services');

  app.ready = function() {
    if (_r.state > 0) {
      return Promise.resolve(true);
    } else if (_r.state < 0) {
      return Promise.reject(_r.result);
    } else if (_r.promise === null) {
      _r.promise = new Promise(function(resolve, reject) {
        _r.resolve = resolve;
        _r.reject = reject;
      });
    }
    return _r.promise;
  };

  process.on('SIGINT', ()=> process.exit(0));
  return app;
};

function sendAjax(success, data) {
  this.body = JSON.stringify({
    success: success,
    data: data
  });
}

function loopLoad(app, namespace) {
  let root = process.cwd();
  let ns = app[namespace] || (app[namespace] = {});
  let nsp = [namespace];
  function rd(ns_path, namespace, dir) {
    fs.readdirSync(dir).forEach(file => {
      let fullPath = path.join(dir, file);
      let name = path.basename(fullPath, '.js');
      if (!fs.statSync(fullPath).isDirectory()) {
        registerComponent(ns_path, namespace, name, require(fullPath));
      } else {
        let cn = namespace[name] || (namespace[name] = {});
        rd(nsp.concat(name), cn, fullPath);
      }
    });
  }
  rd(nsp, ns, path.join(root, namespace));
}

/*
 * 通过在函数上添加 __JING_NS__ 标记，标记这个函数所在的命名空间。
 * 比如 roles 目录下的 /someModule/someFile.js 文件，里面的函数
 *   的 __JING_NS__ 是 'roles.someModule.someFile.xxx',
 *
 * __JING_TYPE__ 用于标记函数类型，用来来判断是不是角色权限中间件，
 *   对于 __JING_TYPE__ === 'roles' 类型的函数，一但返回的值是false，就会抛出401。
 *
 * 随着Javascript语言的发展，以后可能可以使用decorator来更原生地实现。
 */

function registerComponent(ns_path, ns, name, component) {
  for (let k in component) {
    let fn = component[k];
    if (!_.isFunction(fn)) {
      console.warn('register ' + ns_path[0] + ' error: not function.');
    } else {
      fn.__JING_NS__ = ns_path.concat(name, k).join('.');
      fn.__JING_TYPE__ = ns_path[0];
    }
  }
  ns[name] = component;
}