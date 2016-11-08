require('../logger');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var execSync = jxcore.utils.cmdSync;
var spawn = require('child_process').spawn;

var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e8,
  killSignal: 'SIGTERM'
};


if (process.argv.length < 3) {
  console.error("Missing JOB64 argument");
  process.exit(1);
}

var job = JSON.parse(new Buffer(process.argv[2], "base64") + "");

var apk_name = "android_0_" + job.uqID + ".apk";

function CLEANUP() {
  //cleanup target
  for (var i = 0; i < job.nodes.length; i++) {
    execSync("cd " + __dirname + ";ssh pi@" + job.nodes[i].ip + " 'bash -s' < cleanup.sh");
  }

  execSync("cd " + __dirname + ";rm reset.sh;rm run.sh");
}

var logs_copied = false;
process.on('exit', function () {
  if (job && job.nodes) {
    COPY_LOGS();
    CLEANUP();
  }
});

function COPY_LOGS() {
  if (logs_copied) return;
  logs_copied = true;
  for (var i = 0; i < job.nodes.length; i++) {
    execSync("mkdir -p " + __dirname + "/results/" + job.uqID + "/" + job.nodes[i].name + "/");
    var res = execSync("scp pi@" + job.nodes[i].ip + ":~/*.json " + __dirname + "/results/" + job.uqID + "/" + job.nodes[i].name + "/");
    if (res.exitCode)
      console.error("CopyLog Failed ("+job.nodes[i].name+"):", res.out);
  }
}

var reset = fs.readFileSync(__dirname + "/reset_.sh") + "";
reset = reset.replace("{{PR_ID}}", job.uqID);
fs.writeFileSync(__dirname + "/reset.sh", reset)

//cleanup target
var retry = [];
for (var i = 0; i < job.nodes.length; i++) {
  var res = execSync("cd " + __dirname + ";ssh pi@" + job.nodes[i].ip + " 'bash -s' < reset.sh");
  if (res.exitCode != 0) {
    retry.push(job.nodes[i]);
  }
}

for (var i = 0; i < retry.length; i++) {
  var res = execSync("cd " + __dirname + ";ssh pi@" + retry[i].ip + " 'bash -s' < reset.sh");
  if (res.exitCode != 0) {
    console.error("error while trying to reset node on ", retry[i]," details:", res.out, "\n");
    process.exit(1);
    return;
  }
}

var apk_path = "../builder/builds/" + job.uqID + "/build_android/" + apk_name;
//copy apk
for (var i = 0; i < job.nodes.length; i++) {
  var res = execSync("cd " + __dirname + ";scp " + apk_path + " pi@" + job.nodes[i].ip
    + ":~/test/builder/builds/" + job.uqID + "/build_android/" + apk_name);
  if (res.exitCode != 0) {
    console.error("Error while transferring APK:", res.out);
    process.exit(1);
    return;
  }
}

//copy android.js script
for (var i = 0; i < job.nodes.length; i++) {
  var res = execSync("cd " + __dirname + ";scp android.js pi@" + job.nodes[i].ip + ":~/test/tasker/");
  if (res.exitCode != 0) {
    console.error("copy android.js:", res.out);
    process.exit(1);
    return;
  }
}

//copy logger.js script
for (var i = 0; i < job.nodes.length; i++) {
  var res = execSync("cd " + __dirname + ";scp ../logger.js pi@" + job.nodes[i].ip + ":~/test/");
  if (res.exitCode != 0) {
    console.error("copy logger.js:", res.out);
    process.exit(1);
    return;
  }
}

function counterExec(index, cmd, cb) {
  this.cmd = cmd;
  var _this = this;
  _this.index = index;

  _this.cb_ = cb;
  _this.callback = function (err, stdout, stderr) {
    _this.cb_(err, stdout, stderr, _this.index);
  };

  this.run = function () {
    _this.child = exec(_this.cmd, eopts, _this.callback);
  }
}

reset = fs.readFileSync(__dirname + "/run_.sh") + "";
reset = reset.replace("{{JOB64}}", process.argv[2]);
fs.writeFileSync(__dirname + "/run.sh", reset)

var counter = job.nodes.length;
var hasError = false;

function callback(err, stdout, stderr, index) {
  if(err && !hasError) {
    console.log(err + stdout + stderr);
    hasError = true;
  }

  counter--;
  if (counter == 0) {
    COPY_LOGS();
    process.exit(hasError ? 1 : 0);
  }
}

for (var i = 0; i < job.nodes.length; i++) {
  var task = new counterExec(i, "cd " + __dirname + ";ssh pi@" + job.nodes[i].ip + " 'bash -s' < run.sh", callback);
  task.run();
}
