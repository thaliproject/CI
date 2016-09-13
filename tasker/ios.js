require('../logger');
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

var builds = path.join(__dirname, "../builder/builds");
var arrDevices = [];
// out: [ {name, deviceId} ]
var getIOSDevices = function (cb) {
  exec("ios-deploy --detect --timeout 1", eopts, function (err, stdout, stderr) {
    if (err) {
      logme("Error: ios-deploy", err, stdout, stderr, "");
      cb(err);
      return;
    }

    var arr = stdout.split('\n');
    for (var i = 0; i < arr.length; i++) {
      var str = arr[i];
      str = str.replace("[....] ", "");
      str = str.replace(" connected through USB.", "");

      if (str.indexOf("Found ") >= 0) {
        str = str.replace("Found ", "");
        var n1 = str.indexOf("'");
        if (n1)
          n1 = str.indexOf("'", n1 + 1);

        if (n1 >= 0) {
          var name = str.substr(0, n1 + 1).trim();

          var index = name.indexOf("'");
          if (index >= 0) {
            name = name.substr(index + 1).replace("'", "").trim();
          }
          var deviceId = str.substr(n1 + 1, str.length - (n1 + 1)).trim().replace("(", "").replace(")", "");

          logme('ios: device name: ' + name, ', device identifier: ', deviceId);
          if (deviceId.indexOf('\'') !== -1) {
            logme('ios: unexpected device identifier ', deviceId);
          }

          arrDevices.push({name: name, deviceId: deviceId});
        }
      }
    }

    cb(null);
  });
};

var uninstallApp = function (job, cb) {
  var counter = 0;

  var call_log = [];
  function callback(err, stdout, stderr) {
    if (counter == -1)
      return;
    if (err && err.code != 253) {
      counter = -1;
      logme("Error: uninstalling app from device.", err, stdout, stderr, "");
      cb({"server" : [err + "\n\n" + stdout + stderr + "\n\n**Call Log**  \n" + call_log.join("\n") + "\n"]});
      return;
    }

    counter++;
    if (counter == arrDevices.length) {
      if (cb) cb()
    }
  }

  for (var i = 0; i < arrDevices.length; i++) {
    var cmd = "ios-deploy -t 0 -9 -1 " + job.config.csname.ios + " -i " + arrDevices[i].deviceId;
    call_log.push(cmd);
    exec(cmd, eopts, callback);
  }
};

var appCounter = 0;
var jobCB = null;
var IsFailed = false;
var activeJob = null;
var llChildren = [];
var logArray = {};

var grabLLDB = function (index, loc, deviceId, cb) {
  this.location = loc;
  this.index = index;
  this.deviceId = deviceId;
  this.deviceName = arrDevices[index].name;
  this.cb = cb;
  var _this = this;

  this.run = function () {
    var child = spawn('ios-deploy', ['-i', _this.deviceId, "-b", _this.location, "-I"], eopts);
    arrDevices[_this.index].child = child;

    _this.child = child;
    _this.child.deviceId = _this.deviceId;
    _this.child.grabber = _this;
    logArray[_this.deviceName] = [];

    child.stdout.on('data', function (data) {
      // stop receiving unnecessary logs
      if (_this.killing)
        return;

      data = data + "";

      if (data.indexOf("****TEST_LOGGER:[PROCESS_ON_EXIT") >= 0) {
        if (data.indexOf("****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****") >= 0)
          _this.child.failed = true;

        _this.killing = true;
        exec("ios-deploy -t 0 -9 -1 " + activeJob.config.csname.ios + " -i " + _this.deviceId, eopts, function (err, stdout, stderr) {
          _this.child.kill();
        });
      }

      logArray[_this.deviceName].push(data);
    });

    child.stderr.on('data', function (data) {
      // stop receiving unnecessary logs
      if (_this.killing)
        return;
      logArray[_this.deviceName].push(data + "");
    });

    child.on('exit', function (code) {
      _this.child.killed = true;
      if (!_this.killing) {
        _this.child.failed = true;
        _this.cb("Unexpected exit on device " + _this.deviceId + " app:" + _this.deviceName + " code:" + code);
        logme('ios: child process exited with code ' + code, "on device", _this.deviceId, "");
      }
      process.emit('mobile_ready', _this.deviceId, _this.child.failed);
    });
  }
};

process.on('mobile_ready', function (devId, failed) {
  if (failed)
    IsFailed = true;

  appCounter++;
  if (appCounter == arrDevices.length) {
    jobCB(logArray, IsFailed);
  }
});

var installApp = function (job, cb) {
  llChildren = [];
  jobCB = cb;

  var loc = path.join(builds, job.uqID + "/build_ios/", job.config.binary_path.ios);

  if (job.config.serverScript && job.config.serverScript.length)
    jxcore.utils.cmdSync("curl 192.168.1.150:8060/ios=" + arrDevices.length);

  for (var i = 0; i < arrDevices.length; i++) {
    var ll = new grabLLDB(i, loc, arrDevices[i].deviceId, function (err) {
      if (!logArray.server) {
        logArray.server = [];
      }
      logArray.server.push(err);
    });
    llChildren.push(ll);
    ll.run();
  }
};

var deployIOS = function (job, cb) {
  logme("uninstalling the application", "");
  uninstallApp(job, function (err) {
    if (err) {
      cb(err, true);
      return;
    }

    sync("killall ios-deploy;killall lldb");
    logme("installing the application", "");
    installApp(job, function (err, result) {
      cb(err, result);
    })
  })
};

var test_ = function (job, cb) {
  activeJob = job;
  appCounter = 0;
  IsFailed = false;
  // get devices
  logme("Getting the list of iOS devices", "");
  getIOSDevices(function (err) {
    if (err) {
      cb({"server" : [err.message]}, true);
      return;
    }

    logme("Deploying iOS test app", "")
    // devices are available under arrDevices -> Array of {name, deviceId}
    deployIOS(job, function (err, failed) {
      cb(err, failed)
    })
  });
};

exports.test = function (job, cb) {
  sync("killall ios-deploy;killall lldb");
  test_(job, function (arr, isFailed) {
    activeJob = null;
    var res = sync("cd " + __dirname + ";mkdir -p results/" + job.uqID + "/ios/");
    if (res.exitCode) {
      isFailed = res.out;
    } else {
      if (!arr) {
        arr = {"server": ["no logs recevied"]};
      }

      try {
        fs.writeFileSync(__dirname + "/results/" + job.uqID + "/ios/result_.json", JSON.stringify(arr));
      } catch (e) {
        isFailed = e;
        console.error("Failed to write iOS results", e);
      }
    }

    cb(isFailed);
  });
};

process.on('exit', function () {
  sync("killall ios-deploy;killall lldb");
});

var timeout = job.config.timeout ? parseInt(job.config.timeout) * 1000 : 300000;
var inter = setTimeout(function () {
  if (!logArray['server'])
    logArray['server'] = [];
  logArray.server.push("iOS application timeout\n");

  for (var i = 0; i < llChildren.length; i++) {
    var child = llChildren[i].child;
    if (child && !child.killed) {
      try {
        child.kill();
      } catch (e) {
      }
    }
  }
  setTimeout(function () {
    logme("TIMEOUT REACHED");
    process.exit(1)
  }, 500);
}, timeout);

exports.test(job, function (isFailed) {
  clearInterval(inter);

  if (isFailed) {
    console.error(isFailed);
    process.exit(1);
  } else {
    process.exit(0);
  }
});
