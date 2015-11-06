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

var tester = require('../internal/tester');

var node_config = fs.readFileSync(__dirname + "/nodes.json") + "";

function counterExec(index, cmd, cb) {
  this.cmd = cmd;
  var _this = this;
  _this.index = index;

  _this.callback = function (err, stdout, stderr) {
    cb(err, stdout, stderr, _this.index);
  };

  this.run = function () {
    _this.child = exec(_this.cmd, eopts, _this.callback);
  }
}

function busyCheck(nodes, callback) {
  if (nodes.length == 0) {
    callback(nodes);
    return;
  }

  logme("Identifying Available Nodes", nodes, "yellow");
  var counter = nodes.length;
  var arr = [];
  var cb = function (err, stdout, stderr, index) {
    var msg = stdout + stderr;

    if (msg.indexOf("12READY34") >= 0 && msg.indexOf("12BUSY34") < 0) {
      arr.push(nodes[index]);
    }
    counter--;
    if (counter == 0) {
      callback(arr);
    }
  };

  for (var i = 0; i < nodes.length; i++) {
    var ex = new counterExec(i, "ssh -q pi@" + nodes[i].ip + " [[ -f /home/pi/node.config ]] && echo \"12BUSY34\" || echo \"12READY34\"", cb);
    ex.run();
  }
}

function getAvailableNodes(callback) {
  logme("Ping Testing Nodes", "yellow");
  // read nodes
  var config = JSON.parse(node_config);
  var nodes = [];
  var counter = config.nodes.length;
  var cb = function (err, stdout, stderr, index) {
    if (!err) {
      nodes.push(config.nodes[index]);
    }
    counter--;
    if (counter == 0) {
      busyCheck(nodes, callback);
    }
  };

  for (var i = 0; i < config.nodes.length; i++) {
    var ex = new counterExec(i, "ping -c 1 " + config.nodes[i].ip, cb);
    ex.run();
  }
}

var deployerChild = null;
function deploy(job, nodes, cb) {
  job.nodes = nodes;
  var job64 = new Buffer(JSON.stringify(job)).toString("base64");

  deployerChild = exec("cd " + __dirname + ";jx deployer.js " + job64, eopts, cb);
}

var leaveRecevied = false;
var tryInter = null;
exports.test = function (job, trying, callback_) {
  function callback() {
    callback_(2);
  }

  leaveRecevied = false;
  if (!trying)
    trying = 0;
  getAvailableNodes(function (nodes) {
    if (nodes.length == 0) {
      logme("Error: No active node at the moment", "red");
      if (trying < 4) {
        tryInter = setTimeout(function () {
          exports.test(job, trying++, callback);
        }, 30000);
        return;
      } else {
        tester.report("Android", "Timeout. No node available for testing", null);
        callback();
      }
    } else {
      if (job.config.serverScript && job.config.serverScript.length)
        jxcore.utils.cmdSync("curl 192.168.1.150:8060/nodes=" + nodes.length);

      trying = 0;
      logme("Deploying on", nodes, "green");
      deploy(job, nodes, function (err, stdout, stderr) {
        if (err) {
          logme(err, stdout, stderr, "red");

          if (err.retry && trying < 2) {
            tryInter = setTimeout(function () {
              exports.test(job, trying++, callback);
            }, 10000);
            return;
          } else {
            if (leaveRecevied) {
              if (!stdout)
                stdout = "";
              stdout += "\nTIMEOUT REACHED!";
            }
            tester.report(job, "android", err + stdout + stderr, false);
            callback();
          }
          return;
        }

        var emsg = err ? err + "\n\n" + stdout + "\n\n" + stderr : null;
        tester.report(job, "android", emsg, true);
        callback();
      });
    }
  });
};

exports.leave = function () {
  leaveRecevied = true;
  if (deployerChild) {
    deployerChild.kill();
  }
  sync("cd "+__dirname+";./clean_nodes.sh");
  if (tryInter === null) return;
  clearInterval(tryInter);
};
