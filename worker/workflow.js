"use strict";

var assert = require("assert"),
    fs = require("fs"),
    os = require("os"),
    path = require("path"),
    util = require("util");

var decider = require("swfr").decider,
    env = require("require-env"),
    Promise = require("bluebird"),
    rimraf = require("rimraf"),
    tmp = require("tmp");

var tileToPngs = require("./lib/tile-to-pngs"),
    uriJoin = require("./lib/utilities").uriJoin;

Promise.promisifyAll(fs);
Promise.promisifyAll(tmp);
rimraf = Promise.promisify(rimraf);

var CELL_HEIGHT = 256,
    CELL_WIDTH = CELL_HEIGHT;

var TARGET_BUCKET = "oam-tiles";

// Workflow input:
// {
//   id: "this-tiling-job", // Unique ID for tiling job.
//   images: [ "s3://bucket/image1.tif", "s3://bucket/image2.tif" ], // Images to be tiled *in order of prioritization*
//   workingBucket: "workspace.oam.hotosm.org", // For placing the working directory somewhere specific
// }

var worker = decider({
//  sync: true,
  domain: env.require("OAM_SWF_DOMAIN"),
  taskList: env.require("OAM_SWF_DECIDER_TASKLIST"),
  activitiesFolder: path.join(__dirname, "lib", "activities")
}, function(chain, input) {
  assert.ok(input.id, "Input requires 'id'.");
  assert.ok(input.images, "Input requires 'images'.");
  assert.ok(Array.isArray(input.images), "Input 'images' must be an array");
  assert.ok(input.workingBucket, "Input requires 'workingBucket'.");

  var workingFolder = util.format("s3://%s/%s", input.workingBucket, input.id);
  console.log(workingFolder);
  return chain
    .then(function() {
      // Reverse the images, since in VRT's, the last images win.
      return input.images.reverse();
    })
    .map(function(inputPath) {
      var outputPath = uriJoin(workingFolder, path.parse(inputPath).name + "-reprojected.tif");

      this.status = util.format("Reprojecting %s to 3857 -> ", inputPath, outputPath);
      return this.activity("reproject", "1.0", inputPath, outputPath, {
        targetSRS: "EPSG:3857",
        overwrite: true
      });
    }, { concurrency: os.cpus().length })
    .then(function(images) {
      var options = {
        workingDir : workingFolder,
        target: util.format("s3://%s/%s", TARGET_BUCKET, input.id),
        tileCols : CELL_WIDTH,
        tileRows : CELL_HEIGHT,
        vrtThreshold : 256
      };

      return tileToPngs.call(this, images, options);
    })
    .then(function() { 
      return this.complete();
    })
    .catch(function(e) {
      this.log("Error: %s", e);
      throw e;
    });
});

// worker.start({
//   id: "oam-tiler-test",
//   images: ["s3://oin-astrodigital/LC81410412014277LGN00_bands_432.TIF"],
//   workingBucket: "workspace-oam-hotosm-org"
// });

process.on("SIGTERM", function() {
  worker.cancel();
});
