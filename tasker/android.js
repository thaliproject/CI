//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

var fs = require('fs');
var exec = require('child_process').exec;
var execSync = jxcore.utils.cmdSync;
var path = require('path');
var spawn = require('child_process').spawn;

var Logger = require('../logger');
var logger = new Logger({ filePath: '../../console.json' });

var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e8,
  killSignal: 'SIGTERM'
};

if (!process.argv[2]) {
  logger.error('Needs argument!');
  process.exit(1);
  return;
}

var job = JSON.parse(new Buffer(process.argv[2], 'base64') + '');
var nodeId = 0;

// out: [ [ '8a09fc3c', 'device' ] ]
var getAndroidDevices = function () {
  var res = execSync('adb devices');
  var i;

  if (res.exitCode !== 0) {
    logger.error('Error: getAndroidDevices failed', res.out);
    process.exit(1);
    return;
  }

  var devs = [];
  res = res.out.split('\n');
  if (res[0].indexOf("List of devices") == 0) {
    for (i = 1; i < res.length; i++) {
      if (res[i].trim().length == 0) continue;
      if (res[i].indexOf('offline') > 0 ||
          res[i].indexOf('unauthorized') > 0 ||
          res[i].indexOf('no permissions') > 0) {
        logger.warn("Warning: Phone " + res[i] + " - CANNOT BE USED");
        continue; // phone offline/unauthorized/no debug permissions
      }
      var dev = res[i].split('\t');
      devs.push(dev);
    }
  }

  if (devs.length == 0) {
    logger.error('Error: No Android device found.');
    process.exit(1);
    return;
  }

  var manufacturer, model, sdkVersion,
      devices = [];
  for (i = 0; i < devs.length; i++) {
    manufacturer = execSync("adb -s " + devs[i][0] + " shell getprop ro.product.manufacturer");
    model = execSync("adb -s " + devs[i][0] + " shell getprop ro.product.model");
    sdkVersion = execSync("adb -s " + devs[i][0] + " shell getprop ro.build.version.sdk");

    devices.push({
      deviceId: devs[i][0],
      deviceName: manufacturer.out.replace("\n", "").trim() + "-" + model.out.replace("\n", "").trim(),
      sdkVersion: sdkVersion.out.replace("\n", "").trim()
    })
  }

  return devices;
};

var arrDevices = getAndroidDevices();
var builds = path.join(
  __dirname, '..', 'builder', 'builds', job.uqID, 'build_android');
var appCounter = 0;
var testFailed = false;

var deployAndroid = function (apk_path, device_name, class_name, isMarshmallow, callback) {
  var grantPermission = '';
  if (isMarshmallow) {
    grantPermission = '&& adb -s ' + device_name + ' shell pm grant com.test.thalitest android.permission.ACCESS_COARSE_LOCATION';
     logger.warn("Marshmallow device. Granting ACCESS_COARSE_LOCATION permission.");
  }

  var cmd = 'adb -s ' + device_name + ' install -r ' + apk_path +
      '&& adb -s ' + device_name + ' shell pm list packages' + grantPermission;

  exec(cmd, eopts, function (err, stdout, stderr) {
    var res = null;
    var failureReasonIndex = -1;
    var failureReason = '';

    if (err ||
        stdout.indexOf(class_name) === -1 ||
        stdout.indexOf('Success') === -1) {
      res = ('Error: problem deploying Android apk(' + apk_path + ') to device ' + device_name + (err ? ('\n' + err) : ''));
      failureReasonIndex = stdout.indexOf('Failure');
      if (failureReasonIndex > -1) {
        failureReason = stdout.substring(failureReasonIndex);
        failureReason = failureReason.substring(0, failureReason.indexOf('\n'));
        res += '\n' + failureReason;
      }
    } else {
      logger.info('App was succesfully deployed to ' + device_name + '\n');
    }

    callback(res);
  });
};

var logArray = {};
var grabLogcat = function (class_name, deviceId, deviceName, cb) {
  this.deviceId = deviceId;
  this.class_name = class_name;
  this.deviceName = deviceName;
  this.cb = cb;
  var _this = this;

  this.run = function () {
    var child = spawn('adb', ['-s', _this.deviceId, 'logcat', '-v', 'threadtime'], eopts);
    for (var i = 0; i < arrDevices.length; i++) {
      if (arrDevices[i].deviceId == _this.deviceId) {
        arrDevices[i].child = child;
        break;
      }
    }

    _this.child = child;
    _this.child.deviceId = _this.deviceId;
    logArray[_this.deviceName] = [];

    var firstLog = true;
    child.stdout.on('data', function (data) {
      if (firstLog) {
        firstLog = false;
        // logcat in place run app
        _this.cb(null, _this);
      }
      data = data + "";

      if (data.indexOf("****TEST_LOGGER:[PROCESS_ON_EXIT") >= 0) {
        if (data.indexOf("****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****") >= 0)
          _this.child.failed = true;

        if (_this.child.failed) {
          logger.info("STOP log received from " + _this.deviceId + "\nTest has FAILED\n");
        } else {
          logger.info("STOP log received from " + _this.deviceId + "\nTest has SUCCEED\n");
        }

        _this.killing = true;
        stopAndroidApp(_this.class_name, _this.deviceId, function () {
          _this.child.kill();
        });
      }

      logArray[_this.deviceName].push(data);
    });

    child.stderr.on('data', function (data) {
      if (firstLog) {
        firstLog = false;
        // logcat in place run app
        _this.cb(null, _this);
      }

      logArray[_this.deviceName].push(data + "");
    });

    child.on('exit', function (code) {
      if (_this.killing) {
        logger.info("Device test finished on", _this.deviceId);
      } else {
        _this.child.failed = true;
        _this.cb("Unexpected exit on device " + _this.deviceId + " app:" + _this.class_name + " code:" + code);

        logger.info("Child process exited with code " + code, "on device", _this.deviceId);
      }
      process.emit('mobile_ready', _this.deviceId, _this.child.failed);
    });
  }
};

var logcatIndex = 0;
var runAndroidApp = function (class_name, deviceId, deviceName, cb) {
  // clear logcat cache
  execSync('adb -s "' + deviceId + '" logcat -c');
  // !! this may not work on some devices so don't check the failure
  // CI restarts the devices on each run

  //listen logcat on parallel
  var lg = new grabLogcat(class_name, deviceId, deviceName, function (err, _this) {
    logcatIndex++;
    if (!err) {
      var cmd = 'adb -s "' + deviceId + '" shell am start -n ' +
        class_name + '/' + class_name + '.MainActivity';
      var res = execSync(cmd);
      if (res.exitCode !== 0) {
          res.out.indexOf('Error') !== -1) {
        var str = '\n' + res.out;
        if (str.length > 512) {
          str = str.substr(0, 512);
        }

        logger.error('Error: problem running Android apk(' +
          class_name + ') on device ' + deviceName, str, '');

        if (_this) {
          _this.child.kill();
        }

        cb(true, null);
        return false;
      }

      logger.info("App was succesfully started on " + deviceId + "\n");
      cb(null);
    } else {
      cb(err);
    }
  });
  lg.run();
};

var runAndroidInstrumentationTests = function (class_name, runner, deviceIndex) {
  var cmd = 'adb -s "' + arrDevices[deviceIndex].deviceId + '" shell am instrument -w ' + class_name + "/" + runner;
  exec(cmd, eopts, function (err, stdout, stderr) {
    if (err || stdout.indexOf("FAILURES!!!") > -1 || stdout.indexOf("INSTRUMENTATION_CODE: 0") > -1) {
      testFailed = true;
      arrDevices[deviceIndex].failed = true;
      logger.error("Error: problem running Android instrumentation tests (" + class_name + ") on device " + arrDevices[deviceIndex].deviceName);
    }
    logArray[arrDevices[deviceIndex].deviceName] = [stdout, stderr];
    arrDevices[deviceIndex].finished = true;
    appCounter++;

    if (appCounter === arrDevices.length) {
      process.logsOnDisk = true;
      try {
        fs.writeFileSync(path.join(__dirname, "../../result_.json"), JSON.stringify(logArray));
      } catch(e) {
        logger.error("Could not write logs. Error:", e + "");
      }

      logger.info("Android instrumentation tests task is completed.", testFailed ? "[FAILED]" : "[SUCCESS]");
      for (var i = 0; i < arrDevices.length; i++) {
        stopAndroidApp(job.config.csname.android, arrDevices[i].deviceId);
      }
      process.exit(testFailed ? 1 : 0);
    }
  });
  logcatIndex++;
};

var uninstallApp = function (class_name, device_name) {
  var cmd = 'sleep 1;adb -s "' + device_name + '" uninstall ' + class_name;
  var res = execSync(cmd);
  if (res.exitCode !== 0) {
    logger.error("Error: problem stopping Android apk(" + class_name + ") to device " + device_name, res.out);
    return false;
  }

  return true;
};

var stopAndroidApp = function (class_name, device_name, cb) {
  var cmd = 'adb -s "'+device_name+'" shell pm uninstall '+class_name
    + ';adb -s "' + device_name + '" reboot';

  if (cb) {
    exec(cmd, eopts, cb);
  } else {
    execSync(cmd);

    return true;
  }
};

process.on('SIGTERM', function(){
  if(process.logsOnDisk) return;
  try {
    fs.writeFileSync(path.join(__dirname, "../../result_.json"), JSON.stringify(logArray));
  } catch(e) {
    logger.error("Could not write logs. Error:", e + "");
  }
  process.exit(1);
});

process.on('mobile_ready', function (deviceId, failed) {
  for (var i = 0; i < arrDevices.length; i++) {
    if (arrDevices[i].deviceId == deviceId) {
      arrDevices[i].finished = true;
      arrDevices[i].failed = failed;
      if (failed)
        testFailed = true;
      break;
    }
  }
  appCounter++;
  if (appCounter < arrDevices.length) return;
  appCounter = 0;

  process.logsOnDisk = true;
  try {
    fs.writeFileSync(path.join(__dirname, "../../result_.json"), JSON.stringify(logArray));
  } catch(e) {
    logger.error("Could not write logs. Error:", e + "");
  }

  logger.info("Android task is completed.", testFailed ? "[FAILED]" : "[SUCCESS]");

  for (var i = 0; i < arrDevices.length; i++) {
    stopAndroidApp(job.config.csname.android, arrDevices[i].deviceId);
  }
  process.exit(testFailed ? 1 : 0);
});


// remove apps
for (var i = 0; i < arrDevices.length; i++) {
  logger.info("Stopping app on ", arrDevices[i].deviceId);
  stopAndroidApp(job.config.csname.android, arrDevices[i].deviceId);

  logger.info("Uninstalling app on ", arrDevices[i].deviceId);
  uninstallApp(job.config.csname.android, arrDevices[i].deviceId);
}

var isDeviceBooted = function (device_name, timeout) {
  var result = false;
  setTimeout(function () {
    var cmd = 'adb -s ' + device_name + ' shell getprop sys.boot_completed';
    var res = execSync(cmd);
    result = res.exitCode === 0 && res.out.indexOf('1') === 0;
    jxcore.utils.continue();
  }, timeout);
  jxcore.utils.pause();
  return result;
};

// ensure all devices are up and running
var devicesReady = true;
for (var i = 0; i < arrDevices.length; i++) {
  var bootCheckCount = 0;
  var bootMaxCheckCount = 10;
  var bootCheckTimeout = 0;
  while (bootCheckCount < bootMaxCheckCount && !isDeviceBooted(arrDevices[i].deviceId, bootCheckTimeout)) {
    bootCheckCount += 1;
    bootCheckTimeout = 10000;  // wait 10 seconds before next try
  }
  if (bootCheckCount === bootMaxCheckCount) {
    devicesReady = false;
    break;
  }
}
if (!devicesReady) {
  logger.info('\n\nDevices on this node are not ready.\n',
        'Cancelling the test result on this node.\n');
  if (job.config.serverScript && job.config.serverScript.length) {
    execSync("curl 192.168.1.150:8060/cancel=1");
  }
  process.exit(0);
} else {
  logger.info('\nAll devices are ready!\n');
}

var retry_count=0;
// deploy apps
for (var i = 0; i < arrDevices.length; i++) {
  var isMarshmallow = arrDevices[i].sdkVersion > 22;

  logger.info('Deploying to ' + arrDevices[i].deviceId);

  var res = null;

  deployAndroid(
    builds + '/android_' + nodeId + '_' + job.uqID + '.apk',
    arrDevices[i].deviceId,
    job.config.csname.android,
    isMarshmallow,
    function (result) {
      res = result;
      jxcore.utils.continue();
    }
  );

  jxcore.utils.jump();

  if (res && retry_count < 2) {
    retry_count++;
    i--;
    continue;
  }

  if (res) {
    logger.info(
      '\n\nTest on this node has failed but the reason wasn\'t the test application itself.\n',
      'Cancelling the test result on this node.\n',
      res);

    if (job.config.serverScript && job.config.serverScript.length) {
      execSync('curl 192.168.1.150:8060/cancel=1');
    }

    process.exit(0);
  }

  retry_count = 0;
}

var callback = function (err) {
  if (err) {
    logger.error('Error!', err);
  }
};

if (job.config.serverScript && job.config.serverScript.length)
  execSync("curl 192.168.1.150:8060/droid=" + arrDevices.length);

for (var i = 0; i < arrDevices.length; i++) {
  if (job.config.instrumentationTestRunner) {
    runAndroidInstrumentationTests(job.config.csname.android, job.config.instrumentationTestRunner, i);
  } else {
    logger.info("Starting application ThaliTest on " + arrDevices[i].deviceId + "\n");
    runAndroidApp(job.config.csname.android, arrDevices[i].deviceId, arrDevices[i].deviceName, callback);
  }
}

function timeoutKill() {
  // shut down the test;
  logger.info("TIMEOUT REACHED. KILLING the APPS");

  for (var i = 0; i < arrDevices.length; i++) {
    var dev = arrDevices[i];
    if (dev.finished) continue;

    if (!logArray[dev.deviceName]) {
      logArray[dev.deviceName] = [];
    }
    logArray[dev.deviceName].push("TIME-OUT KILL (timeout was " + timeout + "ms)");
    stopAndroidApp(job.config.csname.android, dev.deviceId);
    if (dev.child) {
      dev.child.kill();
    }
  }
  setTimeout(function(){
    process.emit("SIGTERM");
  }, 1000);
}

// set timeout
var timeout = job.config.timeout ? job.config.timeout * 1000 : 300000;
var logcatCounter = 0;
var interTimer = setInterval(function(){
  if (logcatIndex == arrDevices.length) {
    clearInterval(interTimer);
    setTimeout(function () {
      timeoutKill();
    }, timeout + 10000);
  } else {
    if (logcatCounter > 90) {
      timeoutKill();
    }
  }
  logcatCounter++;
}, 1000);
