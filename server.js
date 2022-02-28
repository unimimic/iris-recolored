// server.js
var express = require('express');
var serveStatic = require('serve-static');
var port = process.env.PORT || 8080;

app = express();
app.use(serveStatic(__dirname + "/dist/"));
app.listen(port);

console.log('server started at '+ 'http://localhost:' +port);