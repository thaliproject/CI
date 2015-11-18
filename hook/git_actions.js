var GitHubApi = require("github");
var path = require('path');
var tester = require('./../internal/tester');
var virtual = require('./../builder/virtual')
var reporting = require('../reporting/report');

var github = new GitHubApi({
  // required
  version: "3.0.0",
  // optional
  debug: false,
  protocol: "https",
  host: "api.github.com",
  timeout: 5000,
  headers: {
    "user-agent": "jxcore-thali-testing"
  }
});

var createIssue = function (user, repo, title, body, cb) {
  logme("Creating Github Issue", "red");

  if (!cb)
    cb = function () {
    };

  github.issues.create(
    {
      user: user,
      repo: repo,
      title: title,
      body: body
    }, cb);
};
exports.createIssue = createIssue;

var createGist = function (title, body, cb) {
  logme("Creating Github Gist", "red");

  var opts = {
    description: title,
    public: "true",
    files: {}
  };

  opts.files["logs_" + Date.now() + ".md"] = {
    "content": body
  };


  github.gists.create(
    opts,
    function (err, res) {
      cb(err, res);
    });
};
exports.createGist = createGist;

var commitFile = function (job, name, title, body, cb, skip) {
  var bname = job.uqID + "_" + job.title.replace(/[ $\?>.*,;:@\"|\'\+<&]/g, '_')
    + "_" + job.sender;

  var txt = "#### " + title + "\n\n" + body;

  reporting.logIntoBranch(bname, name + ".md", txt, function(err, res){
    cb(err, res, "https://github.com/ThaliTester/TestResults/tree/" + bname + "/");
  }, skip);

  return bname + "/" + name + ".md";
};
exports.commitFile = commitFile;

// opts = {user, repo, number}
var getFiles = function (opts, cb) {
  opts.page = "1";
  opts.per_page = "100";
  github.pullRequests.getFiles(opts,
    function (err, res) {
      if (!cb) return;
      if (err) {
        cb(err);
      } else {
        cb(null, res);
      }
    }
  );
};
exports.getFiles = getFiles;

// opts = {user, repo, number, body}
var createComment = function (opts, cb) {
  github.issues.createComment(opts,
    function (err, res) {
      if (!cb)
        return;
      if (err) {
        cb(err);
      } else {
        cb(null, res);
      }
    }
  );
};
exports.createComment = createComment;


var setLogin = function (username, password) {
  var opt = {type: "basic"};
  opt.username = username;
  opt.password = password;

  github.authenticate(opt);
};
exports.setLogin = setLogin;

var getContent = function (user, repo, path, branch, cb) {
  github.repos.getContent({
    user: user,
    repo: repo,
    path: path,
    ref: branch
  }, function (err, res) {
    if (err) {
      cb(err, null);
    } else {
      if (res.type && res.content) {
        cb(null, new Buffer(res.content, res.encoding));
      } else {
        cb(err, res);
      }
    }
  });
};
exports.getContent = getContent;

// opts -> prId:pr_id, number:pr_number ..
// opts -> prId:hook_id, ...
var addBranchToQueue = function (user, repo, branch, opts) {
  // check if branch has mobile_test.json
  getContent(user, repo, "/mobile_test.json", branch, function (err, res) {
    if (err) {
      createIssue(user, repo, "mobile_test.json is missing", "Skipped testing branch `" + branch + "`. There was no mobile_test.json file");
      logme("skipped testing branch", branch, "on", user + "/" + repo, "(no mobile_test.json found)", "red");
      return;
    } else {
      if (res instanceof Buffer) {
        var json;
        try {
          json = JSON.parse(res);

          // validate test file
          if (tester.validateConfig(user, repo, json)) {
            var upd_message = "PR";
            if (virtual.IsActive(json.prId))
              upd_message = "Cancelling the previous build job. New commit";

            var index = tester.createJob(user, repo, branch, json, opts);

            if (index && opts.prNumber) {
              var opt = {
                user: user,
                repo: repo,
                number: opts.prNumber,
                body: upd_message + " is added to the queue for testing as " + index + ". task. (" + opts.commits + ")"
              };

              exports.createComment(opt, function () {
              });
              delete json.body;
            }

            logme("Job Index", index);
            return;
          }

        } catch (e) {
          Error.captureStackTrace(e);
          logme("Error at addBranchQueue", e, e.stack, "red");
          err = e;
        }
      }

      createIssue(user, repo, "mobile_test.json is broken", "Skipped testing branch "
      + branch + ". mobile_test.json file must be broken. \n\n> " + (err ? err : "") + "\n\n```\n"
      + res + "\n```");

      logme("skipped testing branch", branch, "on", user + "/" + repo, "(mobile_test.json file must be corrupted)", "red");
    }
  });
};
exports.addBranchToQueue = addBranchToQueue;

// pdId -> can be hookId or prId
// if prNumber == null, prId = hookId
var newTest = function (prId, prNumber, user, title, repo_name, branch, commits, target_branch) {
  var opts = {
    user: repo_name.split('/')[0],
    repo: repo_name.split('/')[1],
    number: prNumber
  };

  if (!prNumber) {// test hook
    addBranchToQueue(opts.user, opts.repo, branch, {
      commits: commits,
      prId: prId, prNumber: null,
      target_branch: target_branch,
      sender: user, title: title});
    return;
  }

  // testing PR
  // check the updated file types to see if this PR deserves testing
  getFiles(opts, function (err, res) {
    if (err) {
      logme("Error newTest (getFiles) : " + err, "red");
    } else {
      for (var i = 0; i < res.length; i++) {
        var ext = path.extname(res[i].filename).toLowerCase();

        if (ext && ext != '.md' && ext != '.txt') {
          addBranchToQueue(opts.user, opts.repo, branch, {
            commits: commits,
            prId: prId, prNumber: prNumber,
            target_branch: target_branch,
            sender: user, title: title});
          return;
        }
      }

      opts.body = "Skipping PR - No APP related changes";
      createComment(opts, function () {
      });
      logme("Skipping PR (no app changes):", prNumber, repo_name, "green");
    }
  });
};
exports.newTest = newTest;
