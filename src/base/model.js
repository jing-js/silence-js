'use strict';

const validators = require('./../util/validator.js');
const _ = require('lodash');

//todo support enum
const typesMap = {
  'varchar': 'string',
  'int': 'number',
  'smallint': 'number',
  'mediumint': 'number',
  'tinyint': 'number',
  'integer': 'number',
  'float': 'number',
  'double': 'number',
  'decimal': 'number',
  'numeric': 'number',
  'real': 'number',
  'char': 'string',
  'date': 'object',
  'text': 'string'
};

function convertType(mysqlType) {
  let idx = mysqlType.search(/\(|\s/);
  let type = idx < 0 ? mysqlType : mysqlType.substring(0, idx);
  return typesMap[type];
}

class BaseModel {
  constructor(values) {
    var columns = this.__scheme.columns;
    var defaults = this.__scheme.defaults;
    for(let i = 0; i < columns.length; i++) {
      let fieldName = columns[i];
      Object.defineProperty(this, fieldName, {
        enumerable: true,
        writable: true,
        configurable: false,
        value: (values && _.isDefined(values[fieldName])) ? values[fieldName] : defaults[fieldName]
      });
    }
  }
  static *find(conditions, options) {
    conditions = conditions || {};
    options = options || {};
    //静态函数调用时，this 指代这个类。而__scheme 是绑定在.prototype上的。
    let scheme = this.prototype.__scheme;
    let fields = options.fields && _.isArray(options.fields) ? options.fields.join(',') : '*';
    let conditionFields = [], conditionParams = [];
    for(let k in conditions) {
      conditionFields.push(k + '=?');
      conditionParams.push(conditions[k]);
    }
    let conditionString = conditionFields.length > 0 ? `WHERE ${conditionFields.join(' AND ')}` : '';
    let limitString = options.limit ? ("LIMIT " + (options.offset ? options.offset + ', ' : '') + options.limit) : '';
    let orderString = options.orderBy ? "ORDER BY " + (_.isArray(options.orderBy) ? options.orderBy.join(',') : options.orderBy) : '';
    let queryString = `SELECT ${fields} from ${scheme.name} ${conditionString} ${orderString} ${limitString};`;
    return yield scheme.db.query(queryString, conditionParams);
  }
  static *query(queryString, queryParams) {
    return yield this.prototype.__scheme.db.query(queryString, queryParams);
  }
  static *findOne(conditions, options) {
    let rows = yield this.find(conditions || {},  _.assign(options || {}, {
      limit: 1,
      offset: null
    }));
    return rows.length > 0 ? rows[0] : null;
  }
  static *findById(id, options) {
    var rows = yield this.find({
      [this.prototype.__scheme.primary]: id
    }, options);
    return rows.length > 0 ? rows[0] : null;
  }

  static *count(conditions, options) {
    //return new Promise(function(resolve, reject) {
    //  this.__scheme.db.query(queryString, queryParams, function(err, val) {
    //    if(err) {
    //      reject(err);
    //    } else {
    //      resolve(val);
    //    }
    //  });
    //});
  }
  validate() {
    let validators = this.__scheme.validators;
    let columns = this.__scheme.columns;
    for(let i = 0; i < columns.length; i++) {
      let fieldName = columns[i];
      let validatorArray = validators[fieldName];
      let val = this[fieldName];
      if (!validatorArray[0].fn(val)) {
        return false;
      }
      if (val === undefined) {
        continue;
      }
      for(let j = 1; j < validatorArray.length; j++) {
        let ov = validatorArray[j];
        if(!ov.fn(this[fieldName], ov.param)) {
          return false;
        }
      }
    }
    return true;
  }
  assign(obj) {
    var columns = this.__scheme.columns;
    for(let i = 0; i < columns.length; i++) {
      var f = columns[i];
      if (obj.hasOwnProperty(f)) {
        this[f] = obj[f];
      }
    }
  }
  *_saveOrUpdate(save, validate) {
    if (validate && !this.validate()) {
      return false;
    }
    let columns = this.__scheme.columns;
    let queryFields = [], queryParams = [];
    for(let i = 0; i < columns.length; i++) {
      let f = columns[i];
      if (this[f] !== undefined) {
        queryFields.push(f + '=?');
        queryParams.push(this[f]);
      }
    }
    let queryString = `${save ? 'INSERT INTO' : 'UPDATE'} ${this.__scheme.name} SET ${queryFields.join(', ')}`;
    let result = yield this.__scheme.db.query(queryString, queryParams);
    return result.affectedRows > 0 ? (save ? result.insertId : true) : false;
  }
  *save(validate) {
    //todo 使用es6的default parameters
    if (arguments.length === 0) {
      validate = true;
    }
    let insertId = yield this._saveOrUpdate(true, validate);
    if (insertId === false) {
      return false;
    } else {
      this.id = insertId;
      return true;
    }
  }
  *update(validate) {
    //todo 使用es6的default parameters
    if (arguments.length === 0) {
      validate = true;
    }
    let rtn = yield this._saveOrUpdate(false, validate);
    return rtn !== false;
  }
  *remove() {
    if (!this.id) {
      return false;
    }
    var affectRows = yield BaseModel.removeAll({
      id: this.id
    });
    return affectRows !== 0;
  }
  static *removeAll(conditions) {
    let queryFields = [], queryParams = [];
    for(let k in conditions) {
      queryFields.push(k + '=?');
      queryParams.push(conditions[k]);
    }
    let queryString = `DELETE from ${this.__scheme} WHERE ${queryFields.join(' AND ')}`;
    let result = yield this.__scheme.db.query(queryString, queryParams);
    return result.affectedRows;
  }
}

BaseModel.register = function(model, schemeName, fields, options) {
  let __scheme = {
    db: null,
    createTableSql: '',
    name: schemeName,
    primary: undefined,
    columns: [],
    validators: {},
    defaults: {}
  };

  let segments = [];

  for(let fieldName in fields) {
    let field = fields[fieldName];
    if (!_.isObject(field)) {
      throw new Error('filed must be Object');
    }
    let type = field['type'] || 'varchar(15)'; //todo check type
    let sqlSeg = `\`${fieldName}\` ${type.toLowerCase()}`;

    let validatorArray = __scheme.validators[fieldName] = [];
    if (field['require'] === true || field.primary === true) {
      sqlSeg += ' NOT NULL';
    }
    if (field['require'] === true && !field.primary) {
      validatorArray.push({
        fn: validators.require
      });
    } else {
      validatorArray.push({
        fn: validators.pass
      });
    }

    if (field.hasOwnProperty('defaultValue')) {
      __scheme.defaults[fieldName] = field.defaultValue;
      sqlSeg += ` DEFAULT '${field.defaultValue}'`;
    } else {
      __scheme.defaults[fieldName] = undefined;
    }

    if (field.autoIncrement === true) {
      sqlSeg += ' AUTO_INCREMENT';
    }
    if (field.comment) {
      sqlSeg += ` COMMENT '${field.comment || ''}'`;
    }


    __scheme.columns.push(fieldName);

    if (field.primary === true) {
      __scheme.primary = fieldName;
    }

    validatorArray.push({
      fn: validators.type,
      param: convertType(type)
    });
    for(let validatorName in field) {
      if (['type', 'require', 'comment', 'autoIncrement', 'primary'].indexOf(validatorName) >= 0) {
        continue;
      }
      let valFn = validators[validatorName] || field[validatorName];
      if (!_.isFunction(valFn)) {
        console.warn('validator ', validatorName , 'is not function! ignored!');
        continue;
      }
      validatorArray.push({
        fn: valFn,
        param: field[validatorName]
      });
    }
    __scheme.validators[fieldName] = validatorArray;
    segments.push(sqlSeg);
  }

  if (__scheme.primary) {
    segments.push(`PRIMARY KEY (\`${__scheme.primary}\`)`);
  }
  if (_.isArray(options.uniqueFields) && options.uniqueFields.length > 0) {
    [].push.apply(segments, options.uniqueFields.map(uniqueColumn => `UNIQUE INDEX \`${uniqueColumn}_UNIQUE\` (\`${uniqueColumn}\` ASC)`));
  }
  if (_.isObject(options.indexes)) {
    [].push.apply(segments, _.map(options.indexes, (idx, name) => {
      let idxFields = _.map(idx, (val, key) => `\`${key}\` ${val}`).join(',');
      return `INDEX \`${name}_INDEX\` (${idxFields})`;
    }));
  }
  //todo support foreign keys

  Object.defineProperty(model.prototype, '__scheme', {
    enumerable: false,
    writable: false,
    configurable: false,
    value: __scheme
  });

  __scheme.createTableSql = `CREATE TABLE \`${__scheme.name}\` (\n  ${segments.join(',\n  ')});`;

};

module.exports = BaseModel;
