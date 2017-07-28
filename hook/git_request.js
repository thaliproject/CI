var db = require('./../db_actions');
var git = require('./git_actions');

var jobs_done = {};
exports.OnRequest = function (req, res) {
  var json = req.post;

  if (!json || typeof json !== 'object') {
    logme("Error: corrupted request?", req.post, "red");
    return;
  }

  if (json.pull_request) { // pull request
    if (json.action != 'opened' &&
        json.action != 'reopened' &&
        json.action != 'synchronize') {
      console.log('Skipping PR > ', json.action, json.number, json.pull_request.title);
      return;
    }

    try {
      require('fs').writeFileSync('last_request.json', JSON.stringify(json, null, 2));
    } catch (e_) {
      console.error('Couldn\'t write the JSON', e_);
    }

    var prNumber = json.number;
    var pr = json.pull_request;
    var prId = pr.id; // this needs to be unique!! see if we tested this PR before
    var user = pr.user.login; // username
    var title = pr.title; // title of commit / PR
    var branch, repo_name = '';
    var commits = 9999999;
    var target_branch = pr.base.ref;

    if (pr.statuses_url) {
      var ln = pr.statuses_url.indexOf('statuses/');
      if (ln > 0) {
        commits = pr.statuses_url.substr(ln + 9, 7);
      }
    }

    if (pr && pr.state === 'open') { // PR state
      var head = pr.head;
      branch = head.ref;
      repo_name = head.repo.full_name;
    }

    if (!repo_name || repo_name.indexOf('thaliproject/') != 0) {
      if (pr && pr.state && pr.state != 'open') {
        // nothing to do
      } else {
        logme('BAD REQUEST from repo', repo_name, 'red');
      }
    } else {
      if (db.hasJob(prNumber, commits)) return;

      if (jobs_done[prNumber + commits]) return;

      jobs_done[prNumber + commits] = 1;
      logme('PR >', prId, commits, prNumber, user, title, repo_name, branch, 'yellow');
      git.newTest(prId, prNumber, user, title, repo_name, branch, commits, target_branch);
    }
  } else if (json.hook && (typeof json.hook_id !== 'undefined')) { // new web hook
    var hook_id = json.hook_id;
    var repo_name = json.repository.full_name;
    var branch = json.repository.default_branch;
    var user = json.sender.login;

    if (repo_name.indexOf('thaliproject/') != 0) {
      logme("BAD REQUEST from repo", repo_name, "red");
    } else {
      // check if we have the repo on DB
      var obj = db.getHookInfo(repo_name);
      if (!obj) {
        db.saveHook({
          hook_id: hook_id,
          sender: json.sender.login,
          repository: repo_name
        });
        logme("New Hook Received", hook_id, "sender:" + json.sender.login, "repo:" + repo_name, "yellow");
      } else {
        obj.hook_id = hook_id;
        obj.sender = json.sender.login;

        db.updateHook(obj);
        logme("Received webhook for a repository that is already in database", repo_name, "yellow");
      }
      git.newTest(hook_id, null, user, json.repository.description,
        repo_name, branch, /*hook commit index is 99999, meaning
                             no commit will have the same index until
                             the hook registered into db*/ 99999);
    }
  } else {
    logme('Unkown Request Received', 'red');
  }
};
