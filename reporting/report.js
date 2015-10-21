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

var createBranch = function(branch_name, cb) {
  exec("cd " + process.cwd() + "/reporting;chmod +x ./push_logs.sh;./push_logs.sh " + branch_name,
    eopts, function (err, stdout, stderr) {
      cb(err, stdout + "\n" + stderr);
    });
};


// this needs to be syched!
// why ? we don't want any other test worker write in between
exports.logIntoBranch = function(branch_name, filename, log, cb) {
  createBranch(branch_name, function (err, res) {
    if (err) {
      cb(err, res);
      return;
    }

    var res = sync("cd " + process.cwd() + "/TestResults;git checkout " + branch_name);
    if (res.exitCode) {
      cb("exit code:" + res.exitCode, res.out);
      return;
    }

    fs.writeFileSync(process.cwd() + '/TestResults/' + filename, log);

    var res = sync("cd " + process.cwd() + "/reporting;chmod +x ./commit_logs.sh;./commit_logs.sh " + branch_name);
    if (res.exitCode) {
      cb("exit code:" + res.exitCode, res.out);
      return;
    }

    cb(null);
  });
};