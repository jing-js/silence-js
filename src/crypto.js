'use strict';

var crypto = require('crypto');
var BasePasswordHash = require('./hash.js');

class CryptoPasswordHash extends BasePasswordHash {
  constructor(config) {
    super();
    this.algorithm = config.algorithm || 'sha256';
    this.iterations = config.iterations || 2048;
    this.saltBytesLength = config.saltBytesLength || 32;
    this.hashBytesLength = config.hashBytesLength || 32;
    this._resolve('ready');
  }
  *encode(password) {
    let iters = this.iterations;
    let len = this.hashBytesLength;
    let algo = this.algorithm;
    let slen = this.saltBytesLength;
    return new Promise(function(resolve, reject) {
      crypto.randomBytes(slen, function(err, salt) {
        if (err) {
          reject(err);
          return;
        }
        let saltS = salt.toString('hex');
        crypto.pbkdf2(password, saltS, iters, len, algo, function(err, key) {
          if(err) {
            reject(err);
          } else {
            resolve(`${algo}\$${iters}\$${len}\$${saltS}\$${key.toString('hex')}`);
          }
        });
      });
    });
  }
  *verify(password, hash) {
    return new Promise(function(resolve, reject) {
      let keys = hash.split('$');
      if (keys.length !== 5) {
        resolve(false);
        return;
      }
      let algo = keys[0];
      let iters = parseInt(keys[1]);
      let len = parseInt(keys[2]);
      let salt = keys[3];
      let code = keys[4];
      if (!algo || !iters || !len || !salt || !code) {
        resolve(false);
        return;
      }
      crypto.pbkdf2(password, salt, iters, len, algo, function(err, key) {
        if(err) {
          reject(err);
        } else {
          resolve(key.toString('hex') === code);
        }
      });
    });

  }
}

module.exports = CryptoPasswordHash;