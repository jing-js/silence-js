'use strict';

var PromisedObserver = require('./observer.js');
var _ = require('underscore');
var util = require('util');

const LEVELS = {
  ALL: 999,
  DEBUG: 4,
  ERROR: 3,
  FATAL: 2,
  INFO: 1,
  WARN: 0,
  OFF: -1
};
const TIPS = ['WARN', 'INFO', 'FATAL', 'ERROR', 'DEBUG'];

class BaseLogger extends PromisedObserver {
  constructor(config) {
    super();
    let clog = config || {};
    this.level = LEVELS[clog.level || "OFF"];
    this.allSection = !clog.section || clog.section.toUpperCase() === 'ALL';
    this.sections = clog.section ? (() => {
      let rtn = {};
      clog.section.split(',').forEach(sec => {
        rtn[sec.trim()] = true;
      });
      return rtn;
    })() : {ALL: true};
  }
  _log(level, section, args) {
    if (level > this.level) {
      return;
    }
    if (this.allSection || this.sections[section]) {
      this._write(level, section, args);
    }
  }
  _write(level, section, args) {

  }
  log(...args) {
    this._log(LEVELS.INFO, 'ALL', args);
  }
  logs(section, ...args) {
    this._log(LEVELS.INFO, section, args);
  }
  debug(...args) {
    this._log(LEVELS.DEBUG, 'ALL', args);
  }
  debugs(section, ...args) {
    this._log(LEVELS.DEBUG, section, args);
  }
  error(...args) {
    this._log(LEVELS.ERROR, 'ALL', args);
  }
  errors(section, ...args) {
    this._log(LEVELS.ERROR, section, args);
  }
  fatal(...args) {
    this._log(LEVELS.FATAL, 'ALL', args);
  }
  fatals(section, ...args) {
    this._log(LEVELS.FATAL, section, args);
  }
  info(...args) {
    this._log(LEVELS.INFO, 'ALL', args);
  }
  infos(section, ...args) {
    this._log(LEVELS.INFO, section, args);
  }
  warn(...args) {
    this._log(LEVELS.WARN, 'ALL', args);
  }
  warns(section, ...args) {
    this._log(LEVELS.WARN, section, args);
  }
}

BaseLogger.LEVELS = LEVELS;
BaseLogger.TIPS = TIPS;

class ConsoleLogger extends BaseLogger {
  constructor(config) {
    super(config);
    this._resolve('ready');
  }
  _write(level, section, args) {
    if (args.length > 1 && _.isString(args[0])) {
      console.log(TIPS[level] + ':', util.format.apply(null, args));
    } else if (_.isString(args[0])) {
      console.log(TIPS[level] + ':', args[0]);
    } else {
      console.log.apply(console, args);
    }
  }
}

module.exports.BaseLogger = BaseLogger;
module.exports.ConsoleLogger = ConsoleLogger;
