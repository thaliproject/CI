var loki = require('lokijs');
var server = new loki('server.json');
var local = new loki('config.json');
var fs = require('fs');
var virtual = require('./builder/virtual');

exports.nodeCount = 2;

var config, hook, test;

if (!fs.existsSync('config.json')) {
  console.log("Creating config.json")
  local.addCollection('config');
  // local.getCollection('config').insert({name: "GithubUser", username: "obastemur", password: ""})
  local.saveDatabase();
}


if (!fs.existsSync('server.json')) {
  console.log("Creating server.json")
  server.addCollection('hooks');
  server.addCollection('test');
  server.saveDatabase();
}

exports.getGithubUser = function (cb) {
  local.loadDatabase({}, function () {
    config = local.getCollection('config');
    var arr = config.find({name: "GithubUser"})
    server.loadDatabase({}, function () {
      hook = server.getCollection('hooks');
      if (!hook) {
        console.error("server.json is empty!");
        process.exit(1);
      }
      test = server.getCollection('test');
      cb(arr.length ? arr[0] : null);
    })
  });
};

exports.getHookInfo = function (repo_name) {
  return hook.findObject({repository: repo_name});
};

exports.saveHook = function (opts) {
  hook.insert(opts);
  server.saveDatabase();
};

exports.updateHook = function (obj) {
  hook.update(obj);
  server.saveDatabase();
};

function find(arr, props, vals) {
  for (var i = 0; i < arr.length; i++) {
    var marker = 0;
    for (var j = 0; j < props.length; j++) {
      if (arr[i][j] == vals[j]) {
        marker++;
      }
    }

    if (marker == props.length)
      return i;
  }

  return -1;
}

function remove(arr, index) {
  var tmp = [];
  for (var i = 0; i < arr.length; i++) {
    if (i != index)
      tmp.push(arr[i])
  }

  return tmp;
}

exports.updateJob = function (job) {
  // grab job list
  var obj = test.findObject({pt_zero: 0});
  if (!obj) {
    return false;
  }

  if (!obj.jobsQueue.length) {
    return false;
  }

  var q = obj.jobsQueue;
  for (var i = 0; i < q.length; i++) {
    if (q[i].uqID == job.uqID) {
      q[i] = job;
      break;
    }
  }

  // update on collection
  test.update(obj);

  // save to file system
  server.saveDatabase();

  return true;
};

exports.removeJob = function (job) {
  // grab job list
  var obj = test.findObject({pt_zero: 0});
  if (!obj) {
    return false;
  }

  if (!obj.jobsQueue.length) {
    return false;
  }

  var q = obj.jobsQueue;
  var arr = [];
  for (var i = 0; i < q.length; i++) {
    if (q[i].uqID != job.uqID) {
      arr.push(q[i]);
    }
  }

  obj.jobsQueue = arr;

  // update on collection
  test.update(obj);

  // save to file system
  server.saveDatabase();

  return true;
};

// result can be null (in case the box is looking for a new job)
exports.getJob = function (isBuilder) {
  // give a job to an empty node
  if (!test) return {noJob: true};

  // grab job list
  var obj = test.findObject({pt_zero: 0});
  if (!obj) {
    test.insert({pt_zero: 0, jobsQueue: []});
    obj = test.findObject({pt_zero: 0});

    // update on collection
    test.update(obj);

    // save to file system
    server.saveDatabase();
  }

  if (!obj.jobsQueue.length) {
    return {noJob: true}; // return empty job
  }

  var q = obj.jobsQueue;
  for (var i = 0; i < q.length; i++) {
    if (!isBuilder) {
      if (!q[i].compiled) continue;

      return q[i];
    } else {
      if (q[i].compiled) continue;

      return q[i];
    }
  }

  return {noJob: true};
};

exports.hasJob = function(prId, commitIndex) {
  // grab job list
  var obj = test.findObject({pt_zero: 0});
  if (!obj) {
    return false;
  }

  if (!obj.jobsQueue.length) {
    return false;
  }

  var uid = prId + commitIndex;
  var q = obj.jobsQueue;
  for (var i = 0; i < q.length; i++) {
    if (q[i].uqID == uid) {
      return true;
    }
  }

  return false;
};

exports.addJob = function (user, repo, branch, opts, json) {
  var obj = test.findObject({pt_zero: 0});
  if (!obj) {
    test.insert({pt_zero: 0, jobsQueue: []});
    obj = test.findObject({pt_zero: 0});
  }

  var job = {
    uqID: opts.prId + opts.commits,
    user: user, // thaliproject
    repo: repo, // postcardapp
    branch: branch, // master
    config: json, // test_mobile.json
    prId: opts.prId, // prId or hookId
    prNumber: opts.prNumber, // null or prNumber
    sender: opts.sender, // sender user
    title: opts.title, // repo or pr title
    target: json.target, // all, ios, android
    priority: json.priority, // normal, asap, now
    compiled: false, // whether osx VM compiled the application file or not
    commitIndex: opts.commits,
    links: [] // apk etc. links for compiled apps
  };

  // locate based on priority
  if (json.priority == "now" || json.priority == "asap") {
    obj.jobsQueue.unshift(job);
  } else {
    obj.jobsQueue.push(job);
  }

  logme("New Test", job.user, job.repo, job.prId, "green");

  // update collection
  test.update(obj);

  // save to file system
  server.saveDatabase();

  if (json.priority == "now" || json.priority == "asap")
    return 1;

  return obj.jobsQueue.length;
};

exports.addGithubUser = function (uname, pass) {
  local.loadDatabase({}, function () {
    config = local.getCollection('config');
    config.insert({name: "GithubUser", username: uname, password: pass});
    local.saveDatabase();
  });
};