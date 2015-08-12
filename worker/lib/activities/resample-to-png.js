"use strict";

var assert = require("assert"),
    fs = require("fs"),
    path = require("path");

var clone = require("clone"),
    output = require("swfr").output,
    shell = require("swfr").shell,
    tmp = require("tmp");

var utilities = require("../utilities"),
    vsiCurlify = utilities.vsiCurlify,
    uriJoin = utilities.uriJoin;

module.exports = function resampleToPng(inputPath, outputUri, options, callback) {
  inputPath = vsiCurlify(inputPath);

  try {
    assert.ok(Array.isArray(options.targetExtent), "resampleToPng: targetExtent must be an array");
    assert.equal(4, options.targetExtent.length, "resampleToPng: targetExtent must be an array of 4 elements");
    assert.ok(Array.isArray(options.targetResolution), "resampleToPng: targetResolution must be an array");
    assert.equal(2, options.targetResolution.length, "resampleToPng: targetResolution must be an array of 2 elements");
  } catch (err) {
    return callback(err);
  }

  return output(outputUri, callback, function(err, localOutputPath, done) {
    if (err) {
      return callback(err);
    }
    // Create temp file for intermediate resample output.
    var extension = path.extname(localOutputPath);
    return tmp.tmpName({
      prefix: options.workingDir,
      postfix: extension
    }, function(err, resampleOutputPath) {
      resampleOutputPath = uriJoin(path.dirname(localOutputPath), path.parse(localOutputPath).name + ".tif");
      if (err) {
        return callback(err);
      }

      var args = [
        "-q",
        "-te", options.targetExtent[0], options.targetExtent[1], options.targetExtent[2], options.targetExtent[3],
        "-ts", "256", "256",
        "-wm", 256, // allow GDAL to work with larger chunks (diminishing returns after 500MB, supposedly)
        "-wo", "NUM_THREADS=ALL_CPUS",
        "-multi",
        "-co", "tiled=yes",
        "-r", "bilinear"
      ];

      if(!options.nocompression) {
        args = args.concat([
          "-co", "compress=lzw",
          "-co", "predictor=2"
        ]);
      }

      if (options.overwrite) {
        args.push("-overwrite");
      }

      args = args.concat([
        inputPath,
        resampleOutputPath
      ]);

      var env = clone(process.env);

      env.GDAL_CACHEMAX = 256;
      env.GDAL_DISABLE_READDIR_ON_OPEN = true;
      env.CHECK_WITH_INVERT_PROJ = true; // handle -180/180, 90/-90 correctly
      env.CPL_VSIL_CURL_ALLOWED_EXTENSIONS = ".tiff,.zip,.vrt";

      return shell("gdalwarp", args, {
        env: env,
        timeout: 10 * 60e3 // 10 minutes
      }, function(err) {
        if (err) {
          fs.unlink(resampleOutputPath, function() {});
          return done.apply(err);
        }

        var args = ["-of", "PNG"];

        if (options.bands) {
          var len = options.bands.length;
          for (var i = 0; i < len; i++) {
            args = args.concat(["-b", "" + options.bands[i]]);
          }
        }

        if ("nodata" in options) {
          args = args.concat(["-a_nodata", options.nodata]);
        }

        args = args.concat([
          resampleOutputPath,
          localOutputPath
        ]);

        var env = clone(process.env);

        env.GDAL_CACHEMAX = 256;
        env.GDAL_DISABLE_READDIR_ON_OPEN = true;
        env.CHECK_WITH_INVERT_PROJ = true; // handle -180/180, 90/-90 correctly
        env.CPL_VSIL_CURL_ALLOWED_EXTENSIONS = ".tiff,.zip,.vrt";

        return shell("gdal_translate", args, {
          env: env,
          timeout: 10 * 60e3 // 10 minutes
        }, function(err) {
          fs.unlink(resampleOutputPath, function() {});
          if(err) {
            return done(err);
          }

          return done();
        });
      });
    });
  });
};

module.exports.version = "1.0";
