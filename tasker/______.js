var spawn = require('child_process').spawn;
var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e8,
  killSignal: 'SIGTERM'
};

var target = process.argv[2];

if (!(target == "ios" || target == "android" || target == "all")) {
  console.error("Unidentified target argument", target);
  process.exit(1);
}

var targets = {};
if (target == "ios") {
  targets["ios"] = 0;
} else if (target == "android") {
  targets["android"] = 0;
  targets.nodes = 0;
  targets.droid = 0;
} else {
  targets["ios"] = 0;
  targets["android"] = 0;
  targets.nodes = 0;
  targets.droid = 0;
}
targets.cancel=1;

var http = require('http');
var lock_me = false;

var checkIt = function(){
  var no_exit = false;
  for (var o in targets) {
    if (targets.hasOwnProperty(o)) {
      if (targets[o] == 0) {
        no_exit = true;
        break;
      }
    }
  }

  if (!no_exit) {
    lock_me = true;
    var obj = {devices: targets};
    console.log("IS Running:");
    
    console.log("Running 'jx install'");
    var out = jxcore.utils.cmdSync("cd " + __dirname + "; jx install");
    
    if (out.exitCode != 0) {
      console.log(out.out, "\n");
      // If jx install fails, we can't run the server
      // and without the server, the tests wouldn't run
      process.exit(out.exitCode);
    } else {
      console.log("Skipping the log for NPM since the exitCode was 0");
    }

    obj.devices.cancel = 0;
    delete obj.devices.cancel;

    console.log(">", process.argv[0] + " index.js " + JSON.stringify(obj));
    
    // give a small break for a potential kill SIGNAL from server
    setTimeout(function(){
      var child = spawn(process.argv[0], ["index.js", JSON.stringify(obj)], eopts);

      child.stdout.on('data', function (data) {
        console.log(data+"");
      });

      child.stderr.on('data', function (data) {
        console.error(data+"");
      });
      
      child.on('exit', function (code) {
        process.exit(code);
      });
    }, 500);
  }
};

http.createServer(function (req, res) {
  if (!lock_me) {
    var url = req.url.substr(1).split('=');
    if (url.length < 2) {
      console.error("Unknown information received by IS manager", req.url);
      process.exit(1);
    }

    if (!targets.hasOwnProperty(url[0]) || isNaN(parseInt(url[1])) || parseInt(url[1]) == 0) {
      console.error("Unknown information received by IS manager", req.url);
      process.exit(1);
    }

    var name = url[0];

    if (name == "nodes" || name == "droid" || name == "cancel") {
      if (name == "cancel") {
        url[1] = 0;
      }

      if (name == "nodes") {
        targets.nodes = parseInt(url[1]);
        targets.droid = 0;

        if (targets.nodes == 0) {
          console.error("No android test node available");
          process.exit(1);
        }
      } else {
        targets.nodes--;
        targets.droid += parseInt(url[1]);

        if (targets.nodes == 0) {
          targets.android = targets.droid;
          delete targets.nodes;
          delete targets.droid;
          checkIt();
        }
      }
      res.end();
      return;
    }

    targets[name] = parseInt(url[1]);

    checkIt();
  }

  res.end();
}).listen(8060);
