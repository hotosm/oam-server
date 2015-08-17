"use strict";

var AWS = require("aws-sdk"),
    crypto = require("crypto");

var startWorkflow = require("./start-workflow");

var input = {
  id: "oam-tiler-test",
  images: ["s3://oin-astrodigital/LC81410412014277LGN00_bands_432.TIF"],
  workingBucket: "workspace.oam.hotosm.org"
};

startWorkflow("us-west-2", "oam-tiler-test", "tiler-test", "1.0", "tiler-test-task-list", input);
