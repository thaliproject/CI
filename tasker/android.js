//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

const exec = require('child-process-promise').exec;
const os = require('os');
const fs = require('fs-extra-promise');
const path = require('path');

const Buffer = require('buffer').Buffer;
const Logger = require('../logger');
const logger = new Logger({ filePath: '../../console.json' });

const Logcat = require('../tools/android/logcat');
const Promise = require('bluebird');

const AndroidDebugBridge = require('../tools/android/adb');
const adb = new AndroidDebugBridge(logger);

const config = {
  bootRetries: 15,
  bootDelay: 10000
};

function installApp(apkPath, appId, device) {
  const deviceId = device.deviceId;
  const sdkVersion = device.sdkVersion;

  return adb.installApp(apkPath, appId, deviceId)
    .then(() => adb.listPackages(deviceId))
    .then(() => {
      if (sdkVersion > 22) {
        logger.warn('SDK > 22. Granting ACCESS_COARSE_LOCATION permission.');

        return  adb.grantPermission(
          appId, deviceId, 'android.permission.ACCESS_COARSE_LOCATION');
      }
    })
    .catch((error) => {
      const message = `Failed deploying '${appId}' Android apk ${apkPath}
        to device ${deviceId}\nerror: ` + error ? `\n${error}` : '';

      return Promise.reject(new Error(message));
    });
}

function runApp(appId, device, timeout) {
  const deviceId = device.deviceId;
  const deviceName = device.deviceName;

  const logcat = new Logcat(logger);

  const stopWithError = function (error) {
    logger.info(error);

    logcat.stop();
    cleanupDevice(device, appId);
  };

  return new Promise((resolve) => {
    logcat.emmiter.on('start', () => {
      exec(`adb -s "${deviceId}" shell am start -n ${appId}/${appId}.MainActivity`)
        .catch(function (error) {
          const newMessage =
            `Running Android app failed. apk: ${appId}, device: ${deviceName}, error: ${error}`;
          const newError = new Error(newMessage);
          stopWithError(newError);

          return;
        })
        .then((result) => {
          const exitCode = result.childProcess.exitCode;
          const stdout = result.stdout;

          if (exitCode !== 0 ||
              stdout.indexOf('Error') !== -1) {
            var message = stdout.toString();
            if (message > 512) {
              message = message.substr(0, 512);
            }

            const error = new Error(message);
            stopWithError(error);
          } else {
            logger.info(`Running Android app success. device: ${deviceId}`);
          }
        });
    });
    logcat.emmiter.on('complete', (result) => {
      cleanupDevice(device, appId);
      resolve(result);
    });

    logcat.start(appId, deviceId, deviceName, timeout);
  });
}

function runInstrumentationTests(device, appId, runner) {
  const deviceId = device.deviceId;
  const deviceName = device.deviceName;

  return exec(
    `adb -s "${deviceId}" shell am instrument -w ${appId}/${runner}`)
    .then((result) => {

      if (result.stdout.indexOf('FAILURES!!!') > -1 ||
          result.stdout.indexOf('INSTRUMENTATION_CODE: 0') > -1) {
        const error = new Error(
          `Failed running Android instrumentation tests (${appId}) on device ${deviceName}`);

        return Promise.reject(error);
      }

      return result;
    });
}

function cleanupDevice(device, appId) {
  const deviceId = device.deviceId;

  return adb.stopApp(appId, deviceId)
    .then(() => adb.uninstallApp(appId, deviceId))
    .then(() => adb.reboot(deviceId));
}

function cleanupDevices(devices, appId) {
  return Promise.reduce(devices, (cleanDevices, device) => {
    return cleanupDevice(device, appId)
      .then(() => cleanDevices.concat([device]));
  }, []);
}

function runTests() {
  if (!process.argv[2]) {
    logger.error('Needs argument!');
    process.exit(1);
    return;
  }

  const bootRetries = config.bootRetries;
  const bootDelay = config.bootDelay;

  const job = JSON.parse(new Buffer(process.argv[2], 'base64') + '');
  const nodeId = 0;

  const appId = job.config.csname.android;
  const className = job.config.csname.android;
  const serverDir = job.config.serverScript;
  const instrumentationTestRunner = job.config.instrumentationTestRunner;
  const timeout = job.config.timeout ? job.config.timeout * 1000 : 300000;
  const jobUID = job.uqID;
  const buildsDir = path.join(
    __dirname, '..', 'builder', 'builds', jobUID, 'build_android');
  const appPath = path.join(
    buildsDir, `android_${nodeId}_${jobUID}.apk`);
  const logsPath = path.join(
    __dirname, '..', '..', 'result_.json');

  return adb.devices()
    .then((devices) => {
      return cleanupDevices(devices, appId)
        .then((cleanDevices) => [devices, cleanDevices]);
    })
    .then(([devices, cleanDevices]) => {
      if (cleanDevices.length !== devices.length) {
        const error = new Error(
          `${cleanDevices.length} of ${devices.length} cleaned.`);
        return Promise.reject(error);
      }

      return [devices, cleanDevices];
    })
    .then(([devices, cleanDevices]) => {
      return Promise.reduce(cleanDevices, (readyDevices, device) => {
        return adb.isDeviceReady(device.deviceId, bootDelay, bootRetries)
          .then((ready) => {
            if (!ready) {
              const error = new Error(`${device} isn't ready.`);
              return Promise.reject(error);
            }

            return readyDevices.concat([device]);
          })
          .then((readyDevices) => {
            if (readyDevices.length !== devices.length) {
              const error = new Error(
                `${readyDevices.length} of ${devices.length} ready.`);
              return Promise.reject(error);
            }

            return cleanDevices;
          });
      }, []);
    })
    .then((devices) => {
      return Promise.reduce(devices, (readyDevices, device) => {
        return installApp(appPath, appId, device)
          .then(() => readyDevices.concat([device]));
      }, [])
      .then((readyDevices) => {
        if (readyDevices.length !== devices.length) {
          const error = new Error(
            `Failed install app for ${readyDevices.length} of
            ${devices.length}.`);
          return Promise.reject(error);
        }

        return readyDevices;
      });
    })
    .then((devices) => {
      if (serverDir && serverDir.length) {
        return exec(`curl 192.168.1.150:8060/droid=${devices.length}`)
          .then(() => devices);
      }

      return devices;
    })
    .then((devices) => {
      if (instrumentationTestRunner) {
        const devicesWithLogs = devices
          .map((device) => {
            return runInstrumentationTests(
              device, appId, instrumentationTestRunner)
              .then(() =>  device);
          });

        return Promise.all(devicesWithLogs);
      } else {
        const devicesWithLogs = devices
          .map((device) => {
            return runApp(appId, device, timeout)
              .then((result) => {
                device.failed = result.failed;
                device.logs = result.logs;

                return device;
              });
          });

        return Promise.all(devicesWithLogs);
      }
    })
    .then((devices) => {
      const result = devices
        .reduce((accumulator, device) => {
          accumulator.logs[device.deviceName] = device.logs;
          accumulator.failed = accumulator.failed || device.failed;

          return accumulator;
        }, { logs: {}, failed: false });

      cleanupDevices(devices, appId)
        .catch((error) => {
          logger.error(`Failed cleaning devices, error: ${error}`);
        });

      return fs.writeFileAsync(logsPath, JSON.stringify(result.logs))
        .then(() => result.failed);
    });
}

if (require.main === module) {
  if (os.platform() !== 'darwin') {
    console.log('WARNING: WE ONLY SUPPORT MACOS AS A BUILD PLATFORM, USING ANY' +
      'OTHER PLATFORM IS NOT OFFICIALLY SUPPORTED. WE STILL CHECK A FEW ' +
      'THINGS BUT YOU ARE REALLY ON YOUR OWN');
  }

  runTests()
    .then((failed) => {
      logger.info('Finish running Android tests');

      process.exit(failed ? 1 : 0);
    })
    .catch((error) => {
      logger.error(`Failed running Android tests with error: ${error}`);

      process.exit(-1);
    });
}
