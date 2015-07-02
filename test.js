"use strict";

var request = require("request");

request.post({
    uri: "http://localhost:8000/metadata",
    json: { test: "test" }
}, function (error, response, body) {
  if (!error && response.statusCode == 200) {
    console.log("%d %j", response.statusCode, body);
  } else {
    console.log(response.statusCode);
    console.log(error);
  }
});
