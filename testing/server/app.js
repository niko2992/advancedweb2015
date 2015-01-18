'use strict';

var express = require('express');
var app = express();
var http = require('http');
var path = require('path');

var server = http.createServer(app).listen('1337');

console.log('server running');

app.use(express.static(path.resolve('client')));

var socketIO = require("./socketHandler");
socketIO(server);

module.exports = app;