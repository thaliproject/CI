//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

const chalk = require('chalk');
const fs = require('fs');

const util = require('util');
const format = util.format;

function Logger(options) {
  if (options) {
    this._filePath = options.filePath;
  }
}

Logger.prototype._log = function (logger, style, messages) {
  const filePath = this._filePath;
  if (filePath) {
    const message = format.apply(null, messages) + '\n';
    fs.appendFileSync(filePath, message);
  }

  var newMessages = messages;
  if (style) {
    newMessages = newMessages
      .map((e) => style(e));
  }

  const now = new Date().toISOString()
    .replace(/T/, ' ')
    .replace(/.[^.]+$/, '');
  newMessages.unshift(now);

  logger.apply(null, newMessages);
};

Logger.prototype.error = function() {
  this._log(console.error, chalk.red, Array.from(arguments));
};

Logger.prototype.info = function() {
  this._log(console.log, null, Array.from(arguments));
};

Logger.prototype.warn = function() {
  this._log(console.log, chalk.yellow, Array.from(arguments));
};

module.exports = Logger;
