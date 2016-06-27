'use strict';

/**
 * Author: petar bojinov - @pbojinov
 * Github: https://github.com/pbojinov/request-ip
 * Get client IP address
 *
 * Modified by Yuhang Ge<abeyuhang@gmail.com>
 *
 */
function getClientIp(req) {

  let headers = req.headers;
  let ipAddress;

  // x-client-ip
  if (ipAddress = headers['x-client-ip']) {
    return ipAddress;
  } else if (ipAddress = headers['x-forwarded-for']) {
    // x-forwarded-for header is more common
    // it may return multiple IP addresses in the format:
    // "client IP, proxy 1 IP, proxy 2 IP"
    // we pick the first one
    return ipAddress.split(',')[0];
  }

  // x-real-ip
  // (default nginx proxy/fcgi)
  else if (ipAddress = headers['x-real-ip']) {
    // alternative to x-forwarded-for
    // used by some proxies
    return ipAddress;
  }

  // x-cluster-client-ip
  // (Rackspace LB and Riverbed's Stingray)
  // http://www.rackspace.com/knowledge_center/article/controlling-access-to-linux-cloud-sites-based-on-the-client-ip-address
  // https://splash.riverbed.com/docs/DOC-1926
  else if (ipAddress = headers['x-cluster-client-ip']) {
    return ipAddress;
  }

  // x-forwarded
  else if (ipAddress = headers['x-forwarded']) {
    return ipAddress;
  }

  // forwarded-for
  else if (ipAddress = headers['forwarded-for']) {
    return ipAddress;
  }

  // forwarded
  else if (ipAddress = headers['forwarded']) {
    return ipAddress;
  }

  // remote address checks
  else if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  else if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  else if (req.connection && req.connection.socket && req.connection.socket.remoteAddress) {
    return req.connection.socket.remoteAddress;
  }
  else if (req.info && req.info.remoteAddress) {
    return req.info.remoteAddress;
  }
  // return unknown if we cannot find an address
  else {
    return 'unknown';
  }
}

module.exports = {
  isGenerateFunction(obj) {
    return typeof obj === 'function' && obj.constructor.name === 'GeneratorFunction';
  },
  isFunction(obj) {
    return typeof obj === 'function';
  },
  isObject(obj) {
    return typeof obj === 'object';
  },
  isNumber(obj) {
    return typeof obj === 'number';
  },
  isString(obj) {
    return typeof obj === 'string';
  },
  isUndefined(obj) {
    return typeof obj === 'undefined';
  },
  getClientIp
};
