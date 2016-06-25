'use strict';

const SilenceApplication = require('./server/application');

silence.BaseLogger = require('./base/logger');
silence.BaseModel = require('./base/model');
silence.BaseSessionStore = require('./base/session');
silence.BaseDatabaseStore = require('./base/database');
silence.BasePasswordHash = require('./base/hash');
silence.SessionUser = require('./server/user');
silence.util = require('./util/util');

function silence(config) {

  let logger = new config.logger['class'](config.logger);
  let db = new config.db['class'](config.db, logger);
  let session = new config.session['class'](config.session, logger);
  let hash = new config.hash['class'](config.hash);
  let sessionUserClass = config.session.user || silence.SessionUser;

  return new SilenceApplication(config, logger, db, session, hash, sessionUserClass);
}

module.exports = silence;

