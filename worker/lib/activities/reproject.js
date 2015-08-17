"use strict";

var assert = require("assert");

var clone = require("clone"),
    output = require("swfr").output,
    shell = require("swfr").shell;

var vsiCurlify = require("../utilities").vsiCurlify;

module.exports = function reproject(inputPath, outputUri, options, callback) {
  inputPath = vsiCurlify(inputPath);

  try {
    assert.ok(options.targetSRS, "reproject: Target SRS is required");
  } catch (err) {
    return callback(err);
  }

  return output(outputUri, callback, function(err, localOutputPath, done) {
    if (err) {
      return callback(err);
    }

    var args = [
      "-q",
      "-t_srs", options.targetSRS,
      "-wo", "NUM_THREADS=ALL_CPUS",
      "-multi",
      "-co", "tiled=yes",
      "-r", "bilinear"
    ];

    if(!options.nocompression) {
      args = args.concat([
        "-co", "compress=lzw",
        "-co", "predictor=2",
      ]);
    }

    if (options.overwrite) {
      args.push("-overwrite");
    }

    args = args.concat([
      inputPath,
      localOutputPath
    ]);

    if (options.srcNoData != null) {
      args.unshift("-srcnodata", options.srcNoData);
    }

    if (options.dstNoData != null) {
      args.unshift("-dstnodata", options.dstNoData);
    }

    var env = clone(process.env);

    env.GDAL_CACHEMAX = 256;
    env.GDAL_DISABLE_READDIR_ON_OPEN = true;
    env.CHECK_WITH_INVERT_PROJ = true; // handle -180/180, 90/-90 correctly

    return shell("gdalwarp", args, {
      env: env,
      timeout: 10 * 60e3 // 10 minutes
    }, done);
  });
};

module.exports.version = "1.0";
