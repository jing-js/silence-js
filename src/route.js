'use strict';

const util = require('silence-js-util');

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'];
const ANY = 0xffff;

class AbstractHandler {
  constructor(handler, middlewares) {
    this.fn = handler;
    this.middlewares = middlewares;
  }
}

class Handler extends AbstractHandler {
  constructor(handler, middlewares, method) {
    super(handler, middlewares);
    this.method = method;
  }
}

class RuntimeHandler extends AbstractHandler {
  constructor(ah, params) {
    super(ah.fn, ah.middlewares);
    this.params = params;
  }
}


class Route {
  constructor(code) {
    this.code = code;
    this.next = null;
    this.handler = null;
  }
  findNext(code) {
    if (this.next === null) {
      return null;
    }
    for(let i = 0; i < this.next.length; i++) {
      if (this.next[i].code > code) {
        return null;
      } else if (this.next[i].code === code) {
        return this.next[i];
      }
    }
    return null;
  }
  addNext(node) {
    if (this.next === null) {
      this.next = [node];
      return;
    }
    for(let i = 0; i < this.next.length; i++) {
      if (this.next[i].code >= node.code) {
        this.next.splice(i, 0, node);
        return;
      }
    }
    this.next.push(node);
  }
  match(method, url, OPTIONS_HANDLER) {
    let p = this;
    let params = null;
    let i = 0;
    let __pre_i = null;
    let end = url.length - 1;
    while(i <= end) {
      if (url.charCodeAt(i) === 63) { // '?'.charCodeAt(0) = 63
        end = i - 1;
        break;
      }
      i++;
    }
    if (end > 1 && url.charCodeAt(end) === 47) {
      end--; // ignore last '/'
    }
    i = 0;
    while(true) {
      if (p.code === ANY) {
        let pi = i;
        while(i <= end && url.charCodeAt(i) !== 47) {
          i++;
        }
        __pre_i = null;
        if (params === null) {
          params = [];
        }
        params.push(url.substring(pi, i));
      } else {
        let c = url.charCodeAt(i);
        if (c !== p.code) {
          if (__pre_i === null) {
            return null;
          } else {
            p = __pre_i.p;
            i = __pre_i.i;
            // console.log('try last state')
            continue; // continue while, return to last state
          }
        } else if (c === 47) {
          __pre_i = null;
        }
        i++;
      }

      if (i > end) {
        // console.log(p.handler);
        if ((p.handler !== null && p.handler.has(method)) || (OPTIONS_HANDLER && method === 'OPTIONS')) {
          break; // exit while
        } else {
          if (__pre_i === null) {
            return null;
          } else {
            p = __pre_i.p;
            i = __pre_i.i;
            // console.log('try last state');
            continue; // continue while, return to last state
          }
        }
      }
      if (p.next === null) {
        if (__pre_i === null) {
          return null;
        } else {
          p = __pre_i.p;
          i = __pre_i.i;
          // console.log('try last state')
        }
      } else if (p.next.length === 1) {
        p = p.next[0];
      } else {
        let c = url.charCodeAt(i);
        let found = null;
        let k = 0;
        for(;k < p.next.length; k++) {
          let c2 = p.next[k].code;
          if (c2 === c) {
            found =  p.next[k];
            break; // exit for
          } else if (c2 > c) {
            break;
          }
        }
        k = p.next.length - 1;
        if (p.next[k].code === ANY) {
          if (found !== null) {
            __pre_i = {
              i: i,
              p: p.next[k]
            };
            p = found;
            // console.log('save state');
          } else {
            p = p.next[k];
          }
        } else {
          if (found !== null) {
            p = found;
          } else {
            if (__pre_i === null) {
              return null;
            } else {
              p = __pre_i.p;
              i = __pre_i.i;
              // console.log('try last state')
              // continue; // continue while, return to last state
            }
          }
        }
      }
    }
    return (p.handler && p.handler.has(method)) ? p.handler.get(method) : OPTIONS_HANDLER;
  }
}

function concatUrl(url, sub) {
  let newUrl = (url + '/' + sub).replace(/\/+/g, '/');
  if (newUrl[0] !== '/') {
    newUrl = '/' + newUrl;
  }
  return newUrl;
}

class RouteDefine {
  constructor(name, middlewares = [], parent = null) {
    this.name = name;
    this.url = concatUrl(parent? parent.url : '', name);
    this.parent = parent || null;
    this.middlewares = (parent ? parent.middlewares : []).concat(middlewares);
    this.handler = null;
    this.children = [];
  }
  _route(method, ...args) {
    let handler = args[args.length - 1];
    let isStr = util.isString(args[0]);
    let middlewares = args.slice(isStr ? 1 : 0, args.length - 1);
    let newRoute = new RouteDefine(isStr ? args[0] : '', middlewares, this);
    newRoute.handler = new Handler(handler, newRoute.middlewares, method);
    this.children.push(newRoute);
    return this;
  }
  get(...args) {
    return this._route('GET', ...args);
  }
  put(...args) {
    return this._route('PUT', ...args);
  }
  post(...args) {
    return this._route('POST', ...args);
  }
  del(...args) {
    return this._route('DELETE', ...args);
  }
  head(...args) {
    return this._route('HEAD', ...args);
  }
  all(...args) {
    METHODS.forEach(med => this._route(med, ...args));
    return this;
  }
  rest(name, ...args) {
    let controllers = args[args.length - 1];
    let middlewares = args.slice(0, args.length - 1);
    this.get(name + 's', ...middlewares, controllers.list);
    this.post(name + 's', ...middlewares, controllers.create);
    this.put(name + '/:id', ...middlewares, controllers.update);
    this.del(name + '/:id', ...middlewares, controllers.remove);
    this.get(name + '/:id', ...middlewares, controllers.view);
    return this;
  }
  group(...args) {
    let callback = args[args.length - 1];
    let isStr = util.isString(args[0]);
    let middlewares = args.slice(isStr ? 1 : 0, args.length - 1);
    let group = new RouteDefine(isStr ? args[0] : '', middlewares, this);
    callback(group);
    this.children.push(group);
    return this;
  }
  destroy() {
    this.parent = null;
    this.handler = null;
    this.middlewares = null;
    this.children.forEach(child => child.destroy());
    this.children = null;
  }
}

function buildTree(route, logger) {

  var root = new Route(0);

  function walk_route(route, idx) {
    if (route.handler) {
      let p = root;
      let url = route.url;
      if (url.length > 1 && url[url.length - 1] === '/') {
        url = url.substring(0, url.length - 1);
      }

      let end = url.length;
      for(let c = 0; c < end; c++) {
        let code = route.url.charCodeAt(c);
        if (code === 58) { // skip ':xxx' until '/'
          while(c < end - 1 && code !== 47) {
            c++;
            code = url.charCodeAt(c);
          }
          if (code === 47) {
            c--;
          }
          code = ANY;
        }
        let pn = p.findNext(code);
        if (!pn) {
          pn = new Route(code);
          p.addNext(pn);
        }
        p = pn;
      }
      if (!p.handler) {
        p.handler = new Map();
      }
      // console.log(`${route.handler.method} ${route.handler.fn.name}`);
      if (p.handler.has(route.handler.method)) {
        logger.error(`Duplicate route define, METHOD ${route.handler.method}, URL ${url}. process exit`);
        process.exit(-1);
      } else {
        logger.debug(`Add router with ${route.handler.middlewares.length} middlewares: ${route.handler.method} ${url}`);
      }
      p.handler.set(route.handler.method, new AbstractHandler(route.handler.fn, route.handler.middlewares));
    }
    for(let i = 0; i < route.children.length; i++) {
      walk_route(route.children[i], idx)
    }
  }

  walk_route(route, 0);
  route.destroy();

  return root.next[0];
}

class RouteManager extends RouteDefine {
  constructor(logger) {
    super('');
    this.logger = logger;
    this.tree = null;
  }
  match(method, url, OPTIONS_HANDLER) {
    return this.tree.match(method, url, OPTIONS_HANDLER);
  }
  build() {
    this.tree = buildTree(this, this.logger);
    // console.log(this.tree);
    // console.log(this.tree.match('GET', '/login'));
  }
}

function printTree(tree) {
  function loop(t, level) {
    let prefix = new Array(level).fill(0).map(() => ' ').join('');
    console.log(prefix + t.val);
    if (t.handler) {
      console.log(t.handler);
    }
    t.next.forEach(function (c) {
      loop(c, level + 1);
    });
  }
  loop(tree, 0)
}

module.exports = RouteManager;