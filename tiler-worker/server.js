"use strict";

var express = require("express"),
    morgan = require("morgan"),
    bodyParser = require("body-parser");

var app = express().disable("x-powered-by");

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.send("pong");
});

app.post("/tile", function(req, res){
  console.log(req.body);
  return res.json(req.body);
});

app.listen(process.env.PORT || 8000, function() {
  console.log("Listening at http://%s:%d/", this.address().address, this.address().port);
});
