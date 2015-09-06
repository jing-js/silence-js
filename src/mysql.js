'use strict';

var BaseDatabaseStore = require('./database.js').BaseDatabaseStore;
var mysql = require('mysql');

class MySQLDatabase extends BaseDatabaseStore {
  constructor(config, logger) {
    super(logger);
    this.db = mysql.createPool({
      connectionLimit: config.connectionLimit,
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database || config.schema
    });
    this._DEBUG = config.debug || false;
    this.db.on('error', err => console.error('database error:', err));
    var me = this;
    //this.db.on('connection', function() {
    //  console.log('db');
    //  me._resolve('ready');
    //});
    this._resolve('ready'); //pool没有ready事件
    process.on('SIGINT', function() {
      me.db.end();
    });
  }
  createTable(scheme) {
    let db = this.db;
    let DEBUG = this._DEBUG;
    return new Promise(function(resolve, reject) {
      db.query(`SHOW CREATE TABLE ${scheme.name}`, function(err, result) {
        if (err) {
          if (err.code === 'ER_NO_SUCH_TABLE') {
            createTable(resolve, reject);
          } else {
            reject(err);
          }
        } else {
          let ct = result[0] ? result[0]['Create Table'] : '';
          if (DEBUG && ct && !isSame(ct, scheme.createTableSql)) {
            db.query(`DROP TABLE \`${scheme.name}\``, function(err) {
              if (err) {
                reject(err);
              } else {
                createTable(resolve, reject);
              }
            });
          } else {
            resolve();
          }
        }
      });
    });

    /**
     * 对比两个Create Table语句是否一样。
     * 当前版本不作判断，直接返回true，也就是只有数据库里面有这个表了就不覆盖。
     * todo 检查两个create table是否一样。
     * @param c1
     * @param c2
     */
    function isSame(c1, c2) {
      return true;
    }

    function createTable(resolve, reject) {
      db.query(scheme.createTableSql, function(err, result) {
        if (err) {
          reject(err);
        } else {
          console.log(result);
          resolve();
        }
      });
    }
  }
  close() {
    this.db.end();
  }
  *query(queryString, queryParams) {
    var db = this.db;
    this.logger.debug(queryString);
    return new Promise(function(resolve, reject) {
      db.query(queryString, queryParams, function(err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    })
  }
}

module.exports = MySQLDatabase;
