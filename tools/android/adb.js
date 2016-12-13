//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

const exec = require('child-process-promise').exec;
const Promise = require('bluebird');

function AndroidDebugBridge(logger) {
  if (logger) {
    this._logger = logger;
  }
};

AndroidDebugBridge.prototype.devices = function() {
  return exec('adb devices')
    .then((result) => {
      if (result.stderr) {
        return Promise.reject(new Error(result.stderr));
      }

      var devices = [];
      var stdoutByLines = result.stdout.split('\n');
      var stdoutTitle = stdoutByLines.shift();
      if (stdoutTitle.indexOf('List of devices') === 0) {
        for (let deviceInfo of stdoutByLines) {

          if (deviceInfo.trim().length === 0) {
            continue;
          }

          if (deviceInfo.indexOf('offline') > 0 ||
              deviceInfo.indexOf('unauthorized') > 0 ||
              deviceInfo.indexOf('no permissions') > 0) {
            this._logger.warn(`Warning: Phone ${deviceInfo} - CANNOT BE USED`);
            continue;
          }

          const device = deviceInfo.split('\t');
          devices.push(device);
        }
      }

      if (devices.length === 0) {
        return Promise.reject(new Error('Android devices weren\'t found.'));
      } else {
        return Promise.resolve(devices);
      }
    })
    .then((dirtyDevices) => {
      const devicesPromise = dirtyDevices
        .map((dirtyDevice) => {
          const deviceId = dirtyDevice[0];

          return Promise.all([
            exec(`adb -s ${deviceId} shell getprop ro.product.manufacturer`),
            exec(`adb -s ${deviceId} shell getprop ro.product.model`),
            exec(`adb -s ${deviceId} shell getprop ro.build.version.sdk`)
          ])
          .then((deviceData) => {
            const manufacturer = deviceData[0].stdout.replace('\n', '').trim();
            const model = deviceData[1].stdout.replace('\n', '').trim();
            const sdkVersion = deviceData[2].stdout.replace('\n', '').trim();

            return {
              deviceId: deviceId,
              manufacturer: manufacturer,
              model: model,
              deviceName: `${manufacturer}-${model}`,
              sdkVersion: sdkVersion
            };
          });
        });

      return Promise.all(devicesPromise);
    });
};

AndroidDebugBridge.prototype.isBootCompleted = function(deviceId) {
  return exec(`adb -s ${deviceId} shell getprop sys.boot_completed`)
    .then((result) => {
      const exitCode = result.childProcess.exitCode;
      const stdout = result.stdout;

      return exitCode === 0 && stdout.startsWith('1');
    })
    .catch (() => false);
};

AndroidDebugBridge.prototype.isDeviceReady = function(deviceId, delay, retries) {
  return Promise.delay(delay)
    .then(() => this.isBootCompleted(deviceId))
    .then((completed) => {
      if (!completed) {
        this._logger.info(
          `waiting device '${deviceId}' boot completed, retry: ${retries}`);

        if (retries && retries !== 0) {
          return this.isDeviceReady(deviceId, delay, retries - 1);
        }

        return false;
      }

      return true;
    });
};

AndroidDebugBridge.prototype.installApp = function(apkPath, appId, deviceId) {
  return exec(`adb -s ${deviceId} install -r ${apkPath}`)
    .then((result) => {
      const exitCode = result.childProcess.exitCode;
      const stdout = result.stdout;
      const stderr = result.stderr;

      if (exitCode !== 0 ||
          stdout.indexOf('Success') === -1) {
        const error = new Error({
          stdout: stdout,
          stderr: stderr
        });

        return Promise.reject(error);
      }

      this._logger.info(`'${appId}' was succesfully deployed to ${deviceId}\n`);

      return;
    });
};

AndroidDebugBridge.prototype.uninstallApp = function(appId, deviceId) {
  return exec(`adb -s "${deviceId}" shell pm uninstall ${appId}`)
    .then(() => exec('sleep 1'))
    .then(() => exec(`adb -s "${deviceId}" uninstall ${appId}`));
};

AndroidDebugBridge.prototype.stopApp = function(appId, deviceId) {
  return exec(`adb -s ${deviceId} shell am force-stop ${appId}`);
};

AndroidDebugBridge.prototype.reboot = function(deviceId) {
  return exec(`adb -s ${deviceId} reboot`);
};

AndroidDebugBridge.prototype.listPackages = function(deviceId) {
  return exec(`adb -s ${deviceId} shell pm list packages`);
};

AndroidDebugBridge.prototype.grantPermission = function(appId, deviceId, permission) {
  return exec(`adb -s ${deviceId} shell pm grant ${appId} ${permission}`);
};

module.exports = AndroidDebugBridge;
