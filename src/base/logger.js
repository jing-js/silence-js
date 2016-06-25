'use strict';

const BaseService = require('./base');
const format = require('util').format;

const LEVELS = {
  NONE: 4,
  ERROR: 3,
  WARN: 2,
  INFO: 1,
  DEBUG: 0
};
const TIPS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];

function formatDate(date) {
  function fn(n) {
    return n < 10 ? '0' + n : n.toString()
  }
  date = date ? date : new Date();
  return `${date.getFullYear()}/${fn(date.getMonth()+1)}/${fn(date.getDate())} ${fn(date.getHours())}:${fn(date.getMinutes())}:${fn(date.getSeconds())}`;
}
class BaseLogger extends BaseService {
  constructor(config) {
    super();
    this.level = LEVELS[config.level || ""];
  }
  _log(level, ...args) {
    if (level < this.level) {
      return;
    }
    this._write(level, ...args);
  }
  _format(level, ...args) {
    let prefix = `[${TIPS[level]}] ${formatDate()} `;
    return prefix + format(...args);
  }
  _write(level, args) {
    // abstract method
  }
  log(...args) {
    this._log(LEVELS.INFO, ...args);
  }
  debug(...args) {
    this._log(LEVELS.DEBUG, ...args);
  }
  error(...args) {
    this._log(LEVELS.ERROR, ...args);
  }
  info(...args) {
    this._log(LEVELS.INFO, ...args);
  }
  warn(...args) {
    this._log(LEVELS.WARN, ...args);
  }
}

BaseLogger.LEVELS = LEVELS;
BaseLogger.TIPS = TIPS;

module.exports = BaseLogger;
