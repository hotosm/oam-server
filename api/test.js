"use strict";

var request = require("request");

var host = "oam-server-api";
if(process.env.DOCKER_HOST) {
  // Get the IP out of the DOCKER HOST if this machine is using docker machine or boot2docker.
  var rx = /(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/;
  host = rx.exec(process.env.DOCKER_HOST)[0];
}
var port = process.env.PORT || 8000;

var uri = "http://" + host + ":" + port + "/tile";
console.log("Checking %s", uri);

request.post({
    uri: uri,
    json: { test: "test" }
}, function (error, response, body) {
  if(error) {
    console.log(error);
  } else {
    if (!error && response.statusCode == 200) {
      console.log("%d %j", response.statusCode, body);
    } else {
      console.log(response.statusCode);
    }
  }
});
