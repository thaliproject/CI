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

  var currentDate = new Date();
  var dateTime = currentDate.getDate() + "/"
               + (currentDate.getMonth() + 1) + "/"
               + currentDate.getFullYear() + "@"
               + (currentDate.getHours() < 10 ? "0" : "")
               + currentDate.getHours() + ":"
               + (currentDate.getMinutes() < 10 ? "0" : "")
               + currentDate.getMinutes() + ":"
               + (currentDate.getSeconds() < 10 ? "0" : "")
               + currentDate.getSeconds() + " ";
  util.print(dateTime);
  jxcore.utils.console.log.apply(null, arguments);
};