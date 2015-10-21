require('../logger').toFile("../../console.json");
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var sync = jxcore.utils.cmdSync;
var spawn = require('child_process').spawn;
var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e8,
  killSignal: 'SIGTERM'
};

if (!process.argv[2]) {
  logme("Needs argument!");
  process.exit(1);
  return;
}

var job = JSON.parse(new Buffer(process.argv[2], "base64") + "");
var nodeId = 0;

// out: [ [ '8a09fc3c', 'device' ] ]
var getAndroidDevices = function () {
  var res = sync("adb devices");

  if (res.exitCode != 0) {
    logme("Error: getAndroidDevices failed", res.out);
    process.exit(1);
    return;
  }

  var devs = [];
  res = res.out.split('\n');
  if (res[0].indexOf("List of devices") == 0) {
    for (var i = 1; i < res.length; i++) {
      if (res[i].trim().length == 0) continue;
      var dev = res[i].split('\t');
      devs.push(dev);
    }
  }

  if (devs.length == 0) {
    logme("Error: No Android device found.", "");
    process.exit(1)
    return;
  }

  var arr = [];
  for (var i = 0; i < devs.length; i++) {
    var man = sync("adb -s " + devs[i][0] + " shell getprop ro.product.manufacturer");
    var pro = sync("adb -s " + devs[i][0] + " shell getprop ro.product.model")
    arr.push({
      deviceId: devs[i][0],
      deviceName: man.out.replace("\n", "").trim() + "-" + pro.out.replace("\n", "").trim()
    })
  }

  if (job.config.serverScript && job.config.serverScript.length)
    jxcore.utils.cmdSync("curl 192.168.1.150:8060/droid=" + arr.length);

  return arr;
};

var arrDevices = getAndroidDevices();
var builds = path.join(__dirname, "../builder/builds/" + job.uqID + "/build_android");
var appCounter = 0;
var testFailed = false;

var deployAndroid = function (apk_path, device_name, retry_count) {
  var cmd = 'sleep 2;adb -s "' + device_name + '" install -r ' + apk_path;
  var res = sync(cmd);
  if (res.exitCode != 0) {
    if(retry_count < 2) {
      return deployAndroid(apk_path, device_name, retry_count ? retry_count + 1 : 1 );
    }

    logme("Error: problem deploying Android apk(" + apk_path + ") to device " + device_name, res.out);
    return false;
  }

  return true;
};

var logArray = {};
var grabLogcat = function (class_name, deviceId, deviceName, cb) {
  this.deviceId = deviceId;
  this.class_name = class_name;
  this.deviceName = deviceName;
  this.cb = cb;
  var _this = this;

  this.run = function () {
    var child = spawn('adb', ['-s', _this.deviceId, 'logcat', "-s", "jxcore-log"], eopts);
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

        logme("STOP log received from ", _this.deviceId, "Test has ", _this.child.failed ? "FAILED" : "SUCCEEDED");
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
        logme("Device test finished on", _this.deviceId, "");
      } else {
        _this.child.failed = true;
        _this.cb("Unexpected exit on device " + _this.deviceId + " app:" + _this.class_name + " code:" + code);
        logme('child process exited with code ' + code, "on device", _this.deviceId, "");
      }
      process.emit('mobile_ready', _this.deviceId, _this.child.failed);
    });
  }
};

var logcatIndex = 0;
var runAndroidApp = function (class_name, deviceId, deviceName, cb) {
  // clear logcat cache
  sync('adb -s "' + deviceId + '" logcat -c');

  //listen logcat on parallel
  var lg = new grabLogcat(class_name, deviceId, deviceName, function (err, _this) {
    logcatIndex++;
    if (!err) {
      var cmd = 'adb -s "' + deviceId + '" shell am start -n ' + class_name + "/" + class_name + ".MainActivity";
      var res = sync(cmd);
      if (res.exitCode != 0) {
        var str = "\n" + res.out;
        if (str.length > 512) str = str.substr(0, 512);
        logme("Error: problem running Android apk(" + class_name + ") on device " + deviceName, str, "");
        if (_this) _this.child.kill();
        cb(true, null);
        return false;
      }

      cb(null);
    } else {
      cb(err)
    }
  });

  lg.run();
};

var uninstallApp = function (class_name, device_name) {
  var cmd = 'sleep 1;adb -s "' + device_name + '" uninstall ' + class_name;
  var res = sync(cmd);
  if (res.exitCode != 0) {
    logme("Error: problem stopping Android apk(" + class_name + ") to device " + device_name, res.out, "");
    return false;
  }

  return true;
};

var stopAndroidApp = function (class_name, device_name, cb) {
  var cmd = 'sleep 1;adb -s "' + device_name + '" shell am force-stop ' + class_name;

  if (cb) {
    exec(cmd, eopts, cb);
  } else {
    var res = sync(cmd);
    if (res.exitCode != 0) {
      logme("Error: problem stopping Android apk(" + class_name + ") to device " + device_name, res.out, "");
      return false;
    }

    return true;
  }
};

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

  var str = "```\n";
  for (var o in logArray) {
    if (logArray.hasOwnProperty(o)) {
      str += o + ": \n";
      if (logArray[o].join) {
        str += logArray[o].join();
      }
      str += "\n\n";
    }
  }
  str += "```\n";

  fs.writeFileSync(path.join(__dirname, "../../result.json"), str);
  logme("Android task is completed", testFailed ? "" : "");
  for (var i = 0; i < arrDevices.length; i++) {
    stopAndroidApp(job.config.csname.android, arrDevices[i].deviceId);
  }
  process.exit(testFailed ? 1 : 0);
});


// remove apps
for (var i = 0; i < arrDevices.length; i++) {
  stopAndroidApp(job.config.csname.android, arrDevices[i].deviceId);
  uninstallApp(job.config.csname.android, arrDevices[i].deviceId);
}

// deploy apps
for (var i = 0; i < arrDevices.length; i++) {
  if (!deployAndroid(builds + "/android_" + nodeId + "_" + job.uqID + ".apk", arrDevices[i].deviceId)) {
    logme("\n\nTest on this node has failed but the reason wasn't the test application itself.\n",
      "Cancelling the test result on this node.\n");
    process.exit(0);
  }
}

var callback = function (err) {
  if (err) {
    logme("Error!", err, "");
  }
};

for (var i = 0; i < arrDevices.length; i++) {
  runAndroidApp(job.config.csname.android, arrDevices[i].deviceId, arrDevices[i].deviceName, callback);
}

function timeoutKill() {
  // shut down the test;
  logme("TIMEOUT REACHED. KILLING the APPS");
  for (var i = 0; i < arrDevices.length; i++) {
    var dev = arrDevices[i];
    if (dev.finished) continue;

    logArray[dev.deviceName].push("TIME-OUT KILL (timeout was " + timeout + "ms)");
    if (dev.child) {
      stopAndroidApp(job.config.csname.android, dev.deviceId);
      dev.child.kill();
    }
  }
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
}, 1000);