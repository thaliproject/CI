//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

var db = require('./../db_actions');
var exec = require('child_process').exec;
var execSync = jxcore.utils.cmdSync;
var fs = require('fs');
var path = require('path');

var Logger = require('../logger');
var logger = new Logger();

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

  logger.warn("Creating Github Branch for " + task.bn);

  createBranch(task.bn, function (err, res) {
    if (err) {
      task.cb(err, res);
      push_logs();
      return;
    }

    if (task.sk !== -1)
      fs.writeFileSync(process.cwd() + '/TestResults/' + task.fn, task.lg);

    if(fs.existsSync(process.cwd() + "/TMP/" + task.bn + "/")) {
      execSync("mv " + process.cwd() + "/TMP/" + task.bn + "/* " + process.cwd() + '/TestResults/');
      execSync("rm -rf " + process.cwd() + "/TMP/" + task.bn + "/");
    }

    exec("cd " + process.cwd()
      + "/reporting;chmod +x ./commit_logs.sh;./commit_logs.sh " + task.bn, eopts,
      function (err, stdout, stderr) {
        logger.info("Creating Github Branch for " + task.bn + " was " + (err ? "failed" : "successful"));

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
    execSync("mkdir -p " + process.cwd() + "/TMP/" + branch_name + "/");
    fs.writeFileSync(process.cwd() + '/TMP/' + branch_name + "/" + filename, log);
    cb(null);
    return;
  }

  log_queue.push({bn:branch_name, fn:filename, lg:log, cb:cb, sk:skip});
  if (log_queue.length == 1) {
    push_logs();
  }
};
