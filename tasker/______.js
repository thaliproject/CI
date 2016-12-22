//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

var execSync = jxcore.utils.cmdSync;
var spawn = require('child_process').spawn;
var eopts = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 1e8,
  killSignal: 'SIGTERM'
};

var errors = {
  unidentifiedTargetArgument: {
    message: 'Unidentified target argument',
    code: 1
  },
  unknownInformationReceivedByISManager: {
    message: 'Unknown information received by IS manager',
    code: 2
  },
  androidNodeNotAvailable: {
    message: 'No android test node available',
    code: 3
  },
  jxInstallFailed: {
    message: 'jx install failed',
    code: 4
  },
  indexJsFailed: {
    message: 'index.js failed',
    code: 5
  }
};

function logAndExit(error, args) {
  if (error) {
    console.error(error.message, args);

    process.exit(error.code);
  } else {
    console.error(args);

    process.exit(-1);
  }
}

var target = process.argv[2];

if (!(target === 'ios' || target === 'android' || target === 'all')) {
  logAndExit(errors.unidentifiedTargetArgument, [target]);
}

var targets = {};
if (target === 'ios') {
  targets.ios = 0;
} else if (target === 'android') {
  targets.android = 0;
  targets.nodes = 0;
  targets.droid = 0;
} else {
  targets.ios = 0;
  targets.android = 0;
  targets.nodes = 0;
  targets.droid = 0;
}
targets.cancel = 1;

var http = require('http');
var lock_me = false;

var checkIt = function(){
  var no_exit = false;
  for (var o in targets) {
    if (targets.hasOwnProperty(o)) {
      if (targets[o] === 0) {
        no_exit = true;
        break;
      }
    }
  }

  if (!no_exit) {
    lock_me = true;
    var obj = {devices: targets};
    console.log('IS Running:');

    console.log('Running \'jx install\'');
    var out = execSync('cd ' + __dirname + '; jx install');

    if (out.exitCode !== 0) {
      // If jx install fails, we can't run the server
      // and without the server, the tests wouldn't run
      logAndExit(errors.jxInstallFailed, [out.exitCode, out.out]);
    } else {
      console.log('Skipping the log for NPM since the exitCode was 0');
    }

    obj.devices.cancel = 0;
    delete obj.devices.cancel;

    console.log('>', process.argv[0] + ' index.js ' + JSON.stringify(obj));

    // give a small break for a potential kill SIGNAL from server
    setTimeout(function(){
      var child = spawn(process.argv[0], ['index.js', JSON.stringify(obj)], eopts);

      child.stdout.on('data', function (data) {
        console.log(data+'');
      });

      child.stderr.on('data', function (data) {
        console.error(data+'');
      });

      child.on('exit', function (code) {
        logAndExit(errors.indexJsFailed, [code]);
      });
    }, 500);
  }
};



http.createServer(function (req, res) {
  if (!lock_me) {
    var url = req.url.substr(1).split('=');
    if (url.length < 2) {
      logAndExit(errors.unknownInformationReceivedByISManager, [req.url]);
    }

    if (!targets.hasOwnProperty(url[0]) ||
        isNaN(parseInt(url[1])) ||
        parseInt(url[1]) === 0) {
      logAndExit(errors.unknownInformationReceivedByISManager, [req.url]);
    }

    var name = url[0];

    if (name === 'nodes' || name === 'droid' || name === 'cancel') {
      if (name === 'cancel') {
        url[1] = 0;
      }

      if (name === 'nodes') {
        targets.nodes = parseInt(url[1]);
        targets.droid = 0;

        if (targets.nodes === 0) {
          logAndExit(errors.androidNodeNotAvailable);
        }
      } else {
        targets.nodes--;
        targets.droid += parseInt(url[1]);

        if (targets.nodes === 0) {
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
