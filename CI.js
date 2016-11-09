//  Copyright (C) Microsoft. All rights reserved.
//  Licensed under the MIT license. See LICENSE.txt file in the project root
//  for full license information.
//

'use strict';

var db = require('./db_actions');
var git = require('./hook/git_actions');
var greq = require('./hook/git_request');
var http = require('http');

var Logger = require('./logger');
var logger = new Logger();

// VM builder
require('./builder/virtual.js');

// task manager
require('./tasker/taskman');

function getPost(request, response, callback) {
  var queryData = '';
  if (typeof callback !== 'function') return null;

  if (request.method == 'POST') {
    request.on('data', function (data) {
      queryData += data;
      if (queryData.length > 1e6) {
        queryData = '';
        response.writeHead(413, {'Content-Type': 'text/plain'}).end();
        request.connection.destroy();
      }
    });

    request.on('end', function () {
      try {
        request.post = JSON.parse(queryData);
        callback();
      } catch (e) {
        // TODO log bad request
        response.writeHead(200, 'OK', {'Content-Type': 'text/plain'});
        response.end();
      }
    });

  } else {
    response.writeHead(405, {'Content-Type': 'text/plain'});
    response.end();
  }
}

db.getGithubUser(function (data) {
  if (!data || !data.username) {
    throw new Error('Github user data or data.username is undefined or null');
  }

  git.setLogin(data.username, data.password);

  http.createServer(function (request, response) {
    if (request.method == 'POST') {
      getPost(request, response, function () {
        try {
          greq.OnRequest(request, response);
        } catch (e) {
          // TODO log the things went bad
          logger.error('Error On Request: ', e);
        }
        response.writeHead(200, 'OK', {'Content-Type': 'text/plain'});
        response.end();
      });
    } else {
      // TODO locate webUI here

      response.writeHead(200, 'OK', {'Content-Type': 'text/plain'});
      response.end();
    }

  })
  .listen(8080);

  logger.info('Github WebHook Server Started on 8080');
});
