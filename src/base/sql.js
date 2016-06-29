'use strict';

const util = require('../util/util');
const BaseModel = require('./model');

class BaseSQLModel extends BaseModel {
  static get isDatabaseModel() {
    return true;
  }
  static get info() {
    if (!this.__info) {
      this.__info = {
        fields: null,
        indices: null,
        table: null,
        primaryKey: null,
        sql: null
      };
    }
    return this.__info;
  }
  static get logger() {
    return BaseSQLModel.__logger;
  }
  static get db() {
    return BaseSQLModel.__db;
  }
  static get indices() {
    return this.info.indices;
  }
  static set indices(val) {
    this.info.indices = val;
  }
  static get fields() {
    return this.info.fields;
  }
  static set fields(fields) {
    fields.forEach(field => {
      this.db.initField(field);
    });
    this.info.fields = fields;
  }
  static get table() {
    if (this.info.table === null) {
      this.info.table = this.name.toLowerCase(); // this means constructor
    }
    return this.info.table;
  }
  static set table(tableName) {
    this.info.table = tableName;
  }
  static get primaryKey() {
    if (this.info.primaryKey === null) {
      let fields = this.fields;
      if (!Array.isArray(fields)) {
        this.logger.error(`${this.name} model must have array type 'fields' property`);
      }
      for(let i = 0; i < fields.length; i++) {
        if (fields[i].primaryKey === true) {
          this.info.primaryKey = fields[i].name;
          return this.info.primaryKey;
        }
      }
      this.info.primaryKey = 'id';
    }
    return this.info.primaryKey;
  }
  static dropTable() {
    return this.db.exec(`DROP TABLE ${this.table}`);
  }
  static createTable() {
    return this.db.exec(this.db.genCreateTableSQL(this));
  }
  static remove(conditions) {
    let queryFields = [], queryParams = [];
    for(let k in conditions) {
      queryFields.push(k + '=?');
      queryParams.push(conditions[k]);
    }
    let queryString = `DELETE from ${this.table} WHERE ${queryFields.join(' AND ')}`;
    return this.db.exec(queryString, queryParams).then(result => {
      return result.affectedRows;
    });
  }
  static all(conditions, options) {
    conditions = conditions || {};
    options = options || {};
    let fields = util.isString(options.fields) ? options.fields : (Array.isArray(options.fields) ? options.fields.join(',') : '*');
    let conditionFields = [], conditionParams = [];
    for(let k in conditions) {
      conditionFields.push(k + '=?');
      conditionParams.push(conditions[k]);
    }
    let conditionString = conditionFields.length > 0 ? `WHERE ${conditionFields.join(' AND ')}` : '';
    let limitString = options.limit ? ("LIMIT " + (options.offset ? options.offset + ', ' : '') + options.limit) : '';
    let orderString = options.orderBy ? "ORDER BY " + (_.isArray(options.orderBy) ? options.orderBy.join(',') : options.orderBy) : '';
    let queryString = `SELECT ${fields} from ${this.table} ${conditionString} ${orderString} ${limitString};`;
    return this.db.query(queryString, conditionParams);
  }
  static one(primaryKeyOrConditions = {}, options) {
    let conditions = util.isObject(primaryKeyOrConditions)
      ? primaryKeyOrConditions : {
      [this.primaryKey]: primaryKeyOrConditions
    };
    return this.all(conditions,  Object.assign(options || {}, {
      limit: 1
    })).then(rows => {
      return rows.length > 0 ? rows[0] : null;
    });
  }
  static count(conditions, options) {

  }
  _saveOrUpdate(save, validate) {
    if (validate && !this.validate()) {
      return Promise.resolve(false);
    }
    let fields = this.constructor.fields;
    let queryFields = [], queryParams = [];
    for(let i = 0; i < fields.length; i++) {
      let f = fields[i].name;
      if (this[f] !== undefined) {
        queryFields.push(`\`${f}\`${save ? '' : '=?'}`);
        queryParams.push(this[f]);
      }
    }
    let queryString = `${save ? 'INSERT INTO' : 'UPDATE'} ${this.constructor.table} ${save ? `(${queryFields.join(',')}) VALUES (${queryFields.map(()=>'?').join(',')})` : `SET  ${queryFields.join(', ')}`}`;
    return this.constructor.db.exec(queryString, queryParams)
  }
  save(validate = true) {
    return this._saveOrUpdate(true, validate).then(result => {
      if (result.affectedRows <= 0) {
        return false;
      }
      let pk = this.constructor.primaryKey;
      this[pk] = result.insertId;
      return true;
    });
  }
  update(validate = true) {
    return this._saveOrUpdate(false, validate).then(result => {
      return result.affectedRows > 0;
    });
  }
  remove() {
    let pk = this.constructor.primaryKey;
    if (!pk || !this[pk]) {
      return Promise.resolve(false);
    }
    return this.constructor.remove({
      [pk]: this[pk]
    }).then(result => {
      return result !== 0;
    });
  }
}

BaseSQLModel.__db = null;
BaseSQLModel.__logger = null;

module.exports = BaseSQLModel;
