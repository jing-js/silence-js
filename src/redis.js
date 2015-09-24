'use strict';

var BaseSessionStore = require('./session.js').BaseSessionStroe;
var redis = require('redis');
const EXPIRE_TIME = 1800; //过期时间为30分钟
const LONG_EXPIRE_TIME = 604800; //长期时间为1周。

class RedisSessionStore extends BaseSessionStore {
  constructor(config, logger) {
    super(logger);
    var me = this;

    this.redisClient = redis.createClient(config.port, config.host);
    redis.debug_mode = config.debug || false;

    this.redisClient.on('error', function(err) {
      me.logger.error('redis error: %s', err.toString());
    });
    this.redisClient.on('ready', function() {
      me._resolve('ready');
    });
    process.on('SIGINT', function() {
      me.redisClient.end()
    });
  }
  get(sessionId) {
    var redis = this.redisClient;
    var logger = this.logger;
    logger.debug('try get sessionId: ' + sessionId);
    return new Promise((resolve, reject) => {
      ////每取一次都重新更新过期时间，保证用户每次刷新页面都可以延迟登录过期时间。
      redis.get(sessionId, function(err, result) {
        if (err) {
          reject(err);
          return;
        }
        if (!result) {
          resolve(null);
          return;
        }
        let user;
        try {
          user = JSON.parse(result);
        } catch(e) {
          reject(e);
          return;
        }
        logger.debug(`get redis session of '${sessionId}': ${result}`);
        redis.expire(sessionId,
          user.remember === true ? LONG_EXPIRE_TIME : EXPIRE_TIME,
          function (err) {
            if (err) {
              logger.error(`redis [expire] error: ${err.message}`);
            }
          }
        );
        resolve(user);
      });

    });
  }
  set(sessionId, sessionUser) {
    var redis = this.redisClient;
    var logger = this.logger;
    logger.debug('try set sessionId' + sessionId);
    return new Promise((resolve, reject) => {
      redis.setex([sessionId, sessionUser.remember ? LONG_EXPIRE_TIME : EXPIRE_TIME,
        JSON.stringify(sessionUser)], err => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }
  del(sessionId) {
    var redis = this.redisClient;
    return new Promise(function(resolve, reject) {
      redis.del(sessionId, err => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      })
    });
  }
  close() {
    this.redisClient.end();
  }
}

module.exports = RedisSessionStore;
