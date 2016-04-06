require('../logger');
var git = require('./../hook/git_actions');
var db = require('./../db_actions');
var path = require('path');
var fs = require('fs');

exports.validateConfig = function (user, repo, json) {
  if (!json) {
    logme("Error: json is null!", "red");
    return false;
  }

  if (!json.build) {
    git.createIssue(user, repo, "mobile_test.json: no build script", "build property is needed to define package building script");
    return false;
  }

  if (!json.target) {
    git.createIssue(user, repo, "mobile_test.json: no target", "target must be defined (ios, android, all)");
    return false;
  }

  if (!json.timeout || typeof json.timeout !== "number") {
    git.createIssue(user, repo, "mobile_test.json: missing timeout", "test `timeout` must be defined (number)");
    return false;
  }

  if (!json.binary_path) {
    git.createIssue(user, repo, "mobile_test.json: no binary target",
      "binary_path was not defined on mobile_test.json file. i.e. binary_path: {ios:..., android:...}");
    return false;
  }

  if (!json.timeout) {
    git.createIssue(user, repo, "mobile_test.json: no timeout definition",
      "timeout was not defined on mobile_test.json file. i.e. timeout:60  (seconds. min 60 seconds)");
    return false;
  }

  if (isNaN(parseInt(json.timeout)) || json.timeout < 60) {
    git.createIssue(user, repo, "mobile_test.json: wrong timeout definition",
      "timeout value needs to be a number and bigger than 60 on mobile_test.json file. i.e. timeout:60  (seconds. min 60 seconds)");
    return false;
  }

  if (json.target == "all") {
    if (json.build && json.build.length) {
    }
    else if (json.build.ios && json.build.ios.length) {
      if (json.build.android && json.build.android.length) {
      }
      else {
        git.createIssue(user, repo, "mobile_test.json: missing android script",
          "while target=='all' there is no multi platform build script is defined. i.e. build.android is missing");
        return false;
      }
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing ios build script",
        "While target=='all' there is no multi platform build script is defined. i.e. build.ios is missing");
      return false;
    }

    if (json.binary_path.ios && json.binary_path.android) {
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing binary path",
        "while target=='all' both binary_path.android and binary_path.ios must be defined");
      return false;
    }

    if (json.csname.ios && json.csname.android) {
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing application name",
        "while target=='all' both csname.android and csname.ios must be defined");
      return false;
    }
    return true;
  }
  else if (json.target == "android") {
    if (json.build && json.build.length) {
    }
    else {
      if (json.build.android && json.build.android.length) {
      }
      else {
        git.createIssue(user, repo, "mobile_test.json: missing android build script",
          "While target=='android' there is no build or build.android definition found");
        return false;
      }
    }

    if (json.binary_path.android) {
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing binary path",
        "while target=='android' binary_path.android must be defined");
      return false;
    }

    if (json.csname.android) {
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing application name",
        "while target=='android' csname.android must be defined");
      return false;
    }
    return true;
  } else if (json.target == "ios") {
    if (json.build && json.build.length) {
    }
    else {
      if (json.build.ios && json.build.ios.length) {
      }
      else {
        git.createIssue(user, repo, "mobile_test.json: missing ios build script",
          "While target=='ios' there is no build or build.ios definition found");
        return false;
      }
    }

    if (json.binary_path.ios) {
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing ios binary path",
        "while target=='ios' binary_path.ios must be defined");
      return false;
    }

    if (json.csname.ios) {
    } else {
      git.createIssue(user, repo, "mobile_test.json: missing application name",
        "while target=='ios' csname.ios must be defined");
      return false;
    }

    return true;
  } else {
    git.createIssue(user, repo, "mobile_test.json: unkown target",
      "Target `" + json.target + "` is unknown. Possible options are ios, android, all");
    return false;
  }
};


// opts -> prId:pr_id, number:pr_number ..
// opts -> prId:hook_id, ...

exports.createJob = function (user, repo, branch, json, opts) {
  if (user != "thaliproject" && user != "jareksl") {
    logme("Unkown repo:", user + "/" + repo, "(discarding job)", "red");
  } else {
    // see if we have the hook for the user/repo
    if (!db.getHookInfo(user + "/" + repo)) {
      logme("Unkown repo:", user + "/" + repo, "(discarding job)", "red");

      if (opts.prNumber) {
        opts.body = "Discarding the PR Testing JOB. Looks like Repository records are changed. Please re-define the WebHook for testing";
        createComment(opts, function () {
        });
      }
      return;
    }

    return db.addJob(user, repo, branch, opts, json);
  }
};

var logs = {};

var logIssue = function (job, title, body) {
  if (job.prNumber) { //pr
    var opts = {
      user: job.user,
      repo: job.repo,
      number: job.prNumber,
      body: title + "\n\n" + body
    };
    git.createComment(opts, function (err, res) {
      if (err) {
        logme("Error: PR commit failed", err, opts);
      }
    });
  } else {
    git.createIssue(job.user, job.repo, title, body);
  }
};
exports.logIssue = logIssue;

var grabLogs = function (job, target) {
  var loc = path.join(__dirname, "../tasker/results/" + job.uqID + "/");

  var log = "";

  if (target == "android") {
    log += "###Android Logs\n";
    var dirs = fs.readdirSync(loc);

    for (var i = 0; i < dirs.length; i++) {
      if (dirs[i] == 'ios') continue;

      var name = path.join(loc, dirs[i]);
      if (fs.statSync(name).isDirectory()) {
        log += "####Node name: " + dirs[i] + "\n";
        if (fs.existsSync(name + "/console.json")) {
          log += "Console output:\n```\n";
          log += (fs.readFileSync(name + "/console.json") + "");
          log += "```\n"
        }

        if (fs.existsSync(name + "/result.json")) {
          log += "\nLogcat output:\n";
          log += (fs.readFileSync(name + "/result.json") + "");
          log += "\n"
        }

        if (fs.existsSync(name + "/result_.json")) {
          try {
            var res = JSON.parse(fs.readFileSync(name + "/result_.json") + "");
            for(var o in res) {
              if (res.hasOwnProperty(o)) {
                var str = res[o];
                var fname = git.commitFile(job, dirs[i] + "_" + o, "Test " + job.uqID + "_" +dirs[i] + "_"
                  + o + " Logs", "\n```\n" + str + "\n```\n", function (err, res, url) {
                  if (err) {
                    logme("Failed to create a device log gist. (" + dirs[i] + "_" + o + ")", err + "\n" + res, "red");
                  }

                }, true);
                log += "[" + o +"](https://github.com/ThaliTester/TestResults/blob/" + fname + ")\n\n";
              }
            }
          } catch(e) {
            log += "\n\nCouldn't parse the device logs for " + dirs[i] + "\n````"+e+"```\n";
          }
        }
      }
    }
  } else {
    if (fs.existsSync(loc + "ios/result_.json")) {
      log += "###iOS Logs\n";
      try {
        var res = JSON.parse(fs.readFileSync(loc + "ios/result_.json") + "");

        for(var o in res) {
          if (res.hasOwnProperty(o)) {
            if (!o || !res[o]) continue;

            var str = res.join ? res[o].join("") : res[o] + "";
            var ind = str.indexOf("[100%] Installed package ");
            if (ind > 0) {
              str = str.substr(ind);
            }

            var fname = git.commitFile(job, "iOS_" + o, "Test " + job.uqID + "_iOS_"
            + o + " Logs", "\n```\n" + str + "\n```\n", function (err, res, url) {
              if (err) {
                if ((err+"").indexOf("Already on 'master'")<0) {
                  logme("Failed to create a device log gist. (IOS_" + o + ")\n", err + "\n" + res, "red");
                }
              }

            }, true);
            log += "[" + o +"](https://github.com/ThaliTester/TestResults/blob/" + fname + ")\n\n";
          }
        }
      } catch(e) {
        log += "\n\nCouldn't parse the iOS logs"+ "\n````"+e+"```\n";
      }
    }
  }

  return log;
};


/*
 job = {
 user: user,
 repo: repo,
 branch: branch,
 config: json,
 prId: opts.prId,
 prNumber: prNumber or null,
 sender: sender user,
 title: repo / pr title,
 target: json.target,
 priority: json.priority,
 boxes: { finished, result } -> result { name, success, logs }
 };
 */
exports.report = function (job, target, err, result) {
  console.log("Report", target);

  if (!logs[job.uqID]) {
    logs[job.uqID] = {
      job: job,
      failed: "",
      success: ""
    };
  }

  if (err === null || typeof err === "undefined")
    err = "No Error";

  if (target != 'server') {
    if (logs[job.uqID].error) {
      logs[job.uqID].error += "\n\n" + target + " : " + err;
    } else {
      logs[job.uqID].error = "\n\n" + target + " : " + err;
    }

    var log = grabLogs(job, target);

    if (result) {
      logs[job.uqID].success += log + "\n";
    } else {
      logs[job.uqID].failed += log + "\n";
    }
  } else {
    logs[job.uqID].server = "#### Test Server Logs\n```\n" + err + "\n```\n";
  }
};

exports.commitLog = function (uqID) {
  var log = logs[uqID];
  logs[uqID] = null;
  delete logs[uqID];

  var failed = log.failed ? true : false;
  if (!failed) log.failed = "";

  var str =  log.server + "\n\n"
    + "Logs for system : \n```" + log.error + "\n```\n"
    + log.failed
    + "\n\n" + log.success;

  git.commitFile(log.job, "test_log", "Test " + uqID + " Logs", str, function (err, res, url) {
    if (err) {
      logme("Failed to create a fail gist.", err + "\n" + res, "red");
    } else {
      if (failed)
        logIssue(log.job, "Test " + uqID + "("+log.job.commitIndex+") has failed", "See " + url + " for the fail logs");
      else {
        logIssue(log.job, "Test " + uqID + "("+log.job.commitIndex+") has successfully finished without an error", "See " + url + " for the logs");
      }
    }
    log.job = null;
    log.failed = null;
    log.success = null;
  });
};