//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

const spawn = require('child_process').spawn;
const spawnSync = require('child_process').spawnSync;

const EventEmitter = require('events');

const eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e8,
  killSignal: 'SIGTERM'
};

function Logcat(logger) {
  this.emmiter = new EventEmitter();

  this._logger = logger;
  this._failed = null;
  this._logs = null;
  this._child = null;
  this._completed = false;
  this._timeout = null;
}

Logcat.prototype.start = function (appId, deviceId, deviceName, timeout) {
  // clear logcat cache
  // !! this may not work on some devices so don't check the failure
  // CI restarts the devices on each run
  spawnSync('adb', ['-s', deviceId, 'logcat', '-c']);

  const child = spawn('adb', ['-s', deviceId, 'logcat', '-v', 'threadtime'], eopts);
  const self = this;

  this._child = child;
  this._logs = [];

  this._startTimeout(timeout);

  var starting = true;

  child.stdout.on('data', (data) => {
    if (starting) {
      starting = false;
      // logcat in place run app
      self.emmiter.emit('start');
    }

    data = data.toString();

    if (data.indexOf('****TEST_LOGGER:[PROCESS_ON_EXIT') >= 0) {
      if (data.indexOf('****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****') >= 0) {
        self._failed = true;
      }

      if (self._failed) {
        self._logger.info(
          `logcat: STOP logging received from ${deviceId}\nTest has FAILED\n`);
      } else {
        self._logger.info(
          `logcat: STOP loggin received from ${deviceId}\nTest has SUCCEED\n`);
      }

      self.stop();
    }

    self._logs.push(data);
  });

  child.stderr.on('data', (data) => {
    if (starting) {
      starting = false;
      // logcat in place run app
      self.emmiter.emit('start');
    }

    self._logs.push(data.toString());
  });

  child.on('exit', (code) => {
    self._completed = true;
    self._stopTimeout();

    var error = null;

    if (self._child) {
      self._failed = true;

      const message = `logcat: Unexpected exit.
        code: ${code}, device: ${deviceId}, app: ${appId}`;
      error = new Error(message);

      self._logger.info(message);
    } else {
      self._failed = false;

      self._logger.info(`logcat: Completed. device: ${deviceId}`);
    }

    self.emmiter.emit('complete',
      { failed: self._failed,
        logs: self._logs,
        error: error
      });

    self.stop();
  });
};

Logcat.prototype.stop = function () {
  if (this._child) {
    this._child.kill();

    this._child = null;
  }
};

Logcat.prototype._startTimeout = function (timeout) {
  this._stopTimeout();

  this._timeout = setTimeout(() => {
    if (this._child) {
      this._failed = true;
      this._logs.push(`TIME-OUT KILL (timeout was ${timeout}ms)`);
      this.stop();
    }
  }, timeout);
};

Logcat.prototype._stopTimeout = function () {
  if (this._timeout) {
    clearTimeout(this._timeout);
  }
};

module.exports = Logcat;
