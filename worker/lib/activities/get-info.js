"use strict";

var debug = require("debug"),
    url = require("url"),
    util = require("util");

var shell = require("swfr").shell;

var vsiCurlify = require("../utilities").vsiCurlify;

var log = debug("swfr:shell");

// Regex to extract coordinates.
var COORDINATE_REGEX = /([\[\(])([^,]*),(.*?)([\]\)])/;

/**
 * Fetch the resolution of a raster.
 *
 * @returns [upper left, lower right]
 */
module.exports = function getInfo(uri, callback) {
  uri = vsiCurlify(uri);

  var args = [
    "-nofl", // In case this is a VRT with too many files to be caught in stdout
    uri
  ];

  return shell("gdalinfo", args, {}, function(err, stdout) {
    if (err) {
      return callback(err);
    }

    var lines = stdout.split("\n");
    var coords = lines.filter(function(line) {
      return line.match(/Upper Left|Lower Right/);
    })
    .map(function(line) {
      var m = line.match(COORDINATE_REGEX),
          x = +m[2],
          y = +m[3];

      return [x, y];
    });
    var extent = [coords[0][0], coords[1][1], coords[1][0], coords[0][1]];

    var resolution = lines.filter(function(line) {
      return line.match(/Pixel Size/);
    })
    .map(function(line) {
      var m = line.match(COORDINATE_REGEX),
          x = +m[2],
          y = +m[3];

      return [x, y];
    })[0];

    return callback(null, { uri: uri, extent: extent, resolution: resolution });
  });
};

module.exports.version = "1.0";
