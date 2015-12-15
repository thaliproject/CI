var db = require('./../db_actions');
var sync = jxcore.utils.cmdSync;
var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');

var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e9,
  killSignal: 'SIGTERM'
};

var createBranch = function (branch_name, cb) {
  exec("cd " + process.cwd() + "/reporting;chmod +x ./push_logs.sh;./push_logs.sh " + branch_name,
    eopts, function (err, stdout, stderr) {
      cb(err, stdout + "\n" + stderr);
    });
};

var log_queue = [];

var push_logs = function() {
  if (log_queue.length==0) return;

  var task = log_queue.shift();

  logme("Creating Github Branch for " + task.bn, "red");

  createBranch(task.bn, function (err, res) {
    if (err) {
      task.cb(err, res);
      push_logs();
      return;
    }

    if (task.sk !== -1)
      fs.writeFileSync(process.cwd() + '/TestResults/' + task.fn, task.lg);

    if(fs.existsSync(process.cwd() + "/TMP/" + task.bn + "/")) {
      sync("mv " + process.cwd() + "/TMP/" + task.bn + "/* " + process.cwd() + '/TestResults/');
      sync("rm -rf " + process.cwd() + "/TMP/" + task.bn + "/");
    }

    exec("cd " + process.cwd()
      + "/reporting;chmod +x ./commit_logs.sh;./commit_logs.sh " + task.bn, eopts,
      function (err, stdout, stderr) {
        if (err) {
          task.cb(err, stdout + "\n" + stderr);
        } else {
          task.cb(null);
        }
        push_logs();
      });
  });
};

exports.logIntoBranch = function (branch_name, filename, log, cb, skip) {
  if(skip && skip !== -1) {
    sync("mkdir -p " + process.cwd() + "/TMP/" + branch_name + "/");
    fs.writeFileSync(process.cwd() + '/TMP/' + branch_name + "/" + filename, log);
    cb(null);
    return;
  }

  log_queue.push({bn:branch_name, fn:filename, lg:log, cb:cb, sk:skip});
  if (log_queue.length == 1) {
    push_logs();
  }
};