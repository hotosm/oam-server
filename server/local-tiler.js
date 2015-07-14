"use strict";

var fs = require("fs"),
    os = require("os"),
    path = require("path"),
    url = require("url"),
    util = require("util");

var async = require("async"),
    decider = require("swfr").decider,
    Promise = require("bluebird"),
    range = require("range").range,
    rimraf = require("rimraf"),
    mercator = new (require("sphericalmercator"))(),
    tmp = require("tmp");

var tile = require("./lib/tile-cells");

Promise.promisifyAll(fs);
Promise.promisifyAll(tmp);
rimraf = Promise.promisify(rimraf);

var CELL_HEIGHT = 256,
    CELL_WIDTH = CELL_HEIGHT;

var worker = decider({
  sync: true
}, function(chain, input) {
  return chain
    .then(function() {
      // Keep the directory, we will clean it up manually.
      var tmpOptions = { };//unsafeCleanup : true };
      if (input.tmpDir) { 
        tmpOptions.dir = input.tmpDir; 
      }

      return tmp.dirAsync(tmpOptions);
    })
    .then(function(tmpObj) {
      var tmpDirectory = tmpObj[0];
      var cleanupCallback = tmpObj[1];

      return Promise
        .bind(this)
        .then(function() {
          if(input.images) {
            return input.images;
          };

          return fs.readdirAsync(input.inputDirectory);
        })
        .map(function(file) {
          var inputPath = path.join(input.inputDirectory, file),
              outputPath = path.join(tmpDirectory, path.parse(file).name + "-reprojected.tif");

          this.status = util.format("Reprojecting %s to 4326 -> ", inputPath, outputPath);
          return this.activity("reproject", "1.0", inputPath, outputPath, {
            targetSRS: "EPSG:4326",
            overwrite: true,
            nocompression: true
          });

        }, { concurrency: os.cpus().length })
        .map(function(file) {
          var inputPath = file;
          var p = path.parse(file);
          var outputPath = path.join(p.dir, p.name + "-correctbands.tif");
          this.log("Translating %s to %s", inputPath, outputPath);

          return this.activity("translate", "1.0", inputPath, outputPath, { bands: [1, 2, 3], nodata: "0" });
        }, {  concurrency: os.cpus().length })
        .then(function(files) {
          var output = path.join(tmpDirectory, util.format("%s.vrt", input.imageSetName));
          this.status = "BUILDING INITIAL VRT";
          return this.activity("buildVRT", "1.0", files.reverse(), output);
        })
        .then(function(vrt) {
          var targetZoom = input.zoom;

          // build overviews
          var initialZoom = targetZoom,
              zoomOffset = Math.log(CELL_WIDTH / 256) / Math.log(2);

          return Promise
            .resolve(range(initialZoom, 1, -1))
            .bind(this)
            .each(function(zoom) {
              this.status = util.format("PROCESSING ZOOM LEVEL %d", zoom);
              var targetPrefix = path.join(tmpDirectory, "tiled");

              var getOutputPath = function(z) {
                return path.join(tmpDirectory, util.format("tiled-%d.vrt", z));
              };

              var outputPath = getOutputPath(zoom);
              if (zoom < initialZoom) {
                // use the VRT for higher zoom level
                vrt = getOutputPath(zoom + 1);
              }

              return Promise
                .bind(this)
                .then(function() {
                  return this.activity("getExtent", "1.0", vrt);
                })
                .then(function(extent) {
                  this.log("Creating cells for z%d using %s", zoom, vrt);
                  this.log("Extent:", extent);

                  // initial zoom reads from 4326
                  if (zoom === initialZoom) {
                    extent = extent.map(mercator.forward);
                  }

                  // create cells at the current zoom
                  return tile(vrt,
                              extent,
                              zoom,
                              targetPrefix,
                              CELL_WIDTH,
                              CELL_HEIGHT);
                })
                .map(function(cell) {
                  this.log("Resampling %s", cell.target);
                  cell.options.overwrite = true;
                  cell.options.nocompression = true;
                  return this.activity("resample", "1.0", cell.source, cell.target, cell.options);
                }, { concurrency: os.cpus().length })
                .filter(function(cell) {
                  return !!cell;
                })
                .map(function(file) {
                  var inputPath = file,
                      p = path.parse(file),
                      z = path.parse(path.dirname(p.dir)).name,
                      x = path.parse(p.dir).name,
                      outputPath = path.join(input.outputDirectory, z, x, p.name + ".png");

                  this.log("Translating %s to %s", inputPath, outputPath);

                  return this.activity("translate", "1.0", inputPath, outputPath, { outputFormat: "PNG" });
                }, {  concurrency: os.cpus().length })
                .then(function(files) {
                  this.log("Generated %d cell(s) for zoom %d at %s.", files.length, zoom, outputPath);

                  return this.activity("buildVRT", "1.0", files, outputPath);
                });
            });
        })
        .finally(function() {
          return rimraf(tmpDirectory);
        });
    })
    .then(function() { 
      return this.complete();
    });
});

worker.start({
  inputDirectory: "/Users/rob/proj/oam/data/sampleset2",
  outputDirectory: "/Users/rob/proj/oam/data/oam-tiled",
  imageSetName: "test_image_set",
  zoom: 13 // pre-determined
//  tmpDir: "/var/folders/tmp" // For placing the working directory somewhere specific
});

process.on("SIGTERM", function() {
  worker.cancel();
});
