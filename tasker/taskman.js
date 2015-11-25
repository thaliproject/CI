var db = require('./../db_actions');
var android = require('./deploy');
var sync = jxcore.utils.cmdSync;
var tester = require('../internal/tester');
var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');

var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e9,
  killSignal: 'SIGTERM'
};

var serverChild = null;
var taskerBusy = false;
var lastStartTime = 0;
var taskerReset = false;
var activeJob = null;
var taskCounter = 0;
var iosChild;

function runIos(job, cb) {
  logme("iOS test task is running", 'yellow')
  var job64 = new Buffer(JSON.stringify(job), "").toString("base64");

  return exec("cd " + __dirname + "; jx ios.js " + job64, eopts, function (err, stdout, stderr) {
    if (err) {
      tester.report(job, "ios", err + stdout + stderr, false);
    } else {
      tester.report(job, "ios", false, true);
    }
    logme("iOS test task FINISHED");
    cb(1);
  });
}

// ios callback returns 1, android 2
// if itemTotal == total test numbers, then do not wait for integration server to shutdown
var itemTotal = 0;

var runTask = function (job) {
  var cb = function (itemNumber) {
    if (itemNumber)
      itemTotal -= itemNumber;

    taskCounter--;
    if (taskCounter <= 0 || itemTotal == 0) {
      taskCounter = 0;
      if (!activeJob) return;
      logme("Test " + activeJob.uqID + " has finished", "green");
      taskerReset = true;
      // rebooting nodes give some time

      if (serverChild) {
        serverChild.killing = true;
        logme("Killing IS child");
        sync("cd " + process.cwd() + "/tasker;ssh pi@192.168.1.150 'bash -s' < pkill.sh");
      }

      setTimeout(function () {
        logme("Cleaning up");
        // test is finished
        taskerBusy = false;
        taskerReset = false;
        db.removeJob(activeJob);

        sync("cd " + __dirname + ";rm -rf results/" + activeJob.uqID + "/; rm -rf ../builder/builds/" + activeJob.uqID);

        tester.commitLog(activeJob.uqID);
        activeJob = null;
      }, 5000);
    }
  };

  var res = sync("cd " + __dirname + ";rm -rf results/" + job.uqID + "/;mkdir -p results/" + job.uqID);
  if (res.exitCode) {
    logme("Error while creating the logs folder: ", err, stdout, stderr, "red");
    process.exit(1);
  }

  // it's important delay==1 if there is no server script to run
  // see delay setTimeout below for details
  var delay = 1;

  if (job.config.serverScript && job.config.serverScript.length) {
    delay = 4000;
    var p = path.join(process.cwd(), "builder/builds/server_" + job.uqID);

    if (job.config.serverScript[job.config.serverScript.length-1] != '/')
      job.config.serverScript += "/";

    var ijs_location = path.join(p , job.config.serverScript, "index.js");
    if (!fs.existsSync(ijs_location)) {
      tester.report(job, 'server', "Integration server application folder doesn't have an index.js file.\n\n"
        + "Location:`" + ijs_location + "`"
        + "\n\nTerminating the test.", false);
      cb();
      return;
    }

    var rs_path = process.cwd() + "/tasker/runServerRemote__.sh";
    var rs_final = process.cwd() + "/tasker/runServerRemote.sh";
    var sloc = path.join("server_" + job.uqID + "/", job.config.serverScript);

    p += " pi@192.168.1.150:~/Test/" + sloc;

    var src = fs.readFileSync(rs_path) + "";
    src = src.replace("{{SERVER_LOCATION}}", sloc);
    src = src.replace("{{TARGET}}", job.target);

    fs.writeFileSync(rs_final, src);

    logme("IS Args:", p);
    serverChild = exec("cd " + process.cwd() + "/tasker;chmod +x ./runServer.sh;./runServer.sh " + p,
      eopts, function (err, stdout, stderr) {
      if (err && !serverChild.killing) {
        tester.report(job, 'server', err + stdout + stderr, false);
        if (taskCounter >= 0) {
          if (job.target == "all") {
            iosChild.kill();
            android.leave();
          } else {
            if (job.target == "ios") {
              iosChild.kill();
            } else {
              android.leave();
            }
          }
        }
      } else {
        tester.report(job, 'server', stdout + stderr, true);
      }
      serverChild = null;

      logme("IS exiting");

      sync("rm " + rs_final);
      sync("cd " + process.cwd() + "/tasker; ssh pi@192.168.1.150 'bash -s' < cleanupServer.sh");
      sync("rm -rf " + p);
    });
  }

  setTimeout(function () {
    itemTotal = 0;
    if (delay > 1 && serverChild == null) {
      // serverScript task has failed. do not run tests
      logme("serverChild execution has failed", "red");
      cb();
    } else {
      if (job.target == "all" || job.target == "ios") {
        taskCounter++;
        itemTotal += 1;
        iosChild = runIos(job, cb);
      }

      if (job.target == "all" || job.target == "android") {
        taskCounter++;
        itemTotal += 2;
        android.test(job, 0, cb);
      }
    }
  }, delay);
};


var testTask = function () {
  if (taskerBusy) {
    // a build operation can not take longer than 40 minutes
    if (Date.now() - lastStartTime > 2400000) {
      if (taskerReset)
        return;

      taskerReset = true;
      if (serverChild) {
        serverChild.killing = true;
        sync("cd " + process.cwd() + "/tasker;ssh pi@192.168.1.150 'bash -s' < pkill.sh");
      }
      android.leave();
      if (iosChild)
        iosChild.kill();
    }
    return;
  }

  // anything in the queue ?
  var job = db.getJob(false);

  if (!job || job.noJob) return;

  // start VM from snapshot
  taskerBusy = true;
  activeJob = job;

  var delay = 45000; // phones were rebooting
  // randomly also restart the raspberries
  sync("cd " + __dirname + ";./clean_nodes.sh");
  lastStartTime = Date.now() + delay;

  setTimeout(function() {
    // run task
    runTask(job);
  }, delay);
};

setInterval(testTask, 3000);