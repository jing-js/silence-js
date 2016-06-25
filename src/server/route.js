'use strict';

const util = require('../util/util');

class Handler {
  constructor(handler, middlewares, method) {
    this.fn = handler;
    this.middlewares = middlewares;
    this.method = method;
    this.params = [];
  }
}

class RouteNode {
  constructor(val) {
    this.val = val;
    this.next = [];
    this.handler = null;
  }
  findNext(val) {
    for(let i = 0; i < this.next.length; i++) {
      if (this.next[i].val === val) {
        return this.next[i];
      }
    }
    return null;
  }
  match(url, idx) {
    let end = url.length;
    let len = this.val.length;
    let i;
    for(i = 0; i < len; i++) {
      if (url.charCodeAt(idx) !== this.val.charCodeAt(i)) {
        return null;
      }
      idx++;
      if (idx === end) {
        if (i === len - 1 && this.handler !== null) {
          return this.handler;
        } else {
          return null;
        }
      }
    }

    if (this.next.length === 0) {
      return null;
    }
    let c = url.charCodeAt(idx);
    for(i = 0; i < this.next.length; i++) {
      let c2 = this.next[i].val.charCodeAt(0);
      if (c < c2) {
        return null;
      } else if (c === c2 ) {
        return this.next[i].match(url, idx);
      }
    }
  }
}

function concatUrl(url, sub) {
  let newUrl = (url + '/' + sub).replace(/\/+/g, '/');
  if (newUrl[0] !== '/') {
    newUrl = '/' + newUrl;
  }
  // if (newUrl[newUrl.length - 1] !== '/') {
  //   newUrl = newUrl + '/';
  // }
  return newUrl;
}

class Route {
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
    let newRoute = new Route(isStr ? args[0] : '', middlewares, this);
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
  all(...args) {
    return this._route('ALL', ...args);
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
    let group = new Route(isStr ? args[0] : '', middlewares, this);
    callback(group);
    this.children.push(group);
    return this;
  }
  destroy() {
    this.parent = null;
    this.middlewares.length = 0;
    this.children.forEach(child => child.destroy());
    this.children.length = 0;
  }
}

Route.buildRouteTree = function(route) {

  let root = new RouteNode(0);

  function walk_route(route, idx) {
    if (route.handler) {
      let p = root;
      for(let c = 0; c < route.url.length; c++) {
        let code = route.url.charCodeAt(c);
        let pn = p.findNext(code);
        if (!pn) {
          pn = new RouteNode(code);
          p.next.push(pn);
        }
        p = pn;
      }
      p.handler = route.handler;
    }
    for(let i = 0; i < route.children.length; i++) {
      walk_route(route.children[i], idx)
    }
  }

  walk_route(route, 0);
  route.destroy(); // 回收内存

  let treeNode = new RouteNode('');

  function walk_tree(node, nextArr) {


    let p = node;
    let arr = [node];
    while(p.next.length === 1 && p.handler === null) {
      arr.push(p.next[0]);
      p = p.next[0];
    }

    let newNode = new RouteNode(arr.map(n => String.fromCharCode(n.val)).join(''));
    nextArr.push(newNode);

    if (p.handler) {
      newNode.handler = p.handler;
    }

    if (p.next.length >= 1) {
      for(let i = 0; i < p.next.length; i++) {
        walk_tree(p.next[i], newNode.next);
      }
      newNode.next.sort((a, b) => {
        return a.val === b.val ? 0 : (a.val > b.val ? 1 : -1);
      });
    }
  }

  walk_tree(root.next[0], treeNode.next);

  return treeNode.next[0];
};


module.exports = Route;