var util = require('util');
var fs = require('fs');
var fileName = false;

exports.toFile = function (name) {
  fileName = name;
  fs.writeFileSync(fileName, "");
};

global.logme = function () {
  if (fileName) {
    var msg = util.format.apply(this, arguments) + "\n";
    fs.appendFileSync(fileName, msg);
    return;
  }

  jxcore.utils.console.log.apply(null, arguments);
};