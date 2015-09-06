'use strict';


function getInfo(lis, eventName) {
  let info = lis[eventName];
  if (!info) {
    info = lis[eventName] = {
      promise: null,
      resolve: null,
      reject: null,
      result: null,
      state: 0
    };
  }
  return info;
}

function deal(lis, eventName, state, result) {
  let info = getInfo(lis, eventName);
  if (info.state !== 0) {
    console.warn(`Promise of '${eventName}' has been settled`);
    return;
  }
  if (info.promise !== null) {
    if (state > 0) {
      info.resolve(result);
    } else {
      info.reject(result);
    }
    info.promise = null;
    info.resolve = null;
    info.reject = null;
  }
  info.result = result;
  info.state = state;
}
class PromisedObserver {
  constructor() {
    this.__listeners = {};
  }
  _resolve(eventName, val) {
    deal(this.__listeners, eventName, 1, val);
  }
  _reject(eventName, err) {
    deal(this.__listeners, eventName, -1, err);
  }
  ready() {
    return this.on('ready');
  }
  on(eventName) {
    let info = getInfo(this.__listeners, eventName);
    if (info.state > 0) {
      return Promise.resolve(info.result);
    } else if (info.state < 0) {
      return Promise.reject(info.result);
    } else if (info.promise === null) {
      info.promise = new Promise(function(resolve, reject) {
        info.resolve = resolve;
        info.reject = reject;
      });
    }
    return info.promise;
  }
}

module.exports = PromisedObserver;