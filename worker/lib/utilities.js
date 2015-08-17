"use strict";

var path = require("path"),
    util = require("util");

var url = require("url"),
    _ = require("underscore");

// Turns a gdal input URI into a vsicurl URI if it's an s3 or http URI.
module.exports.vsiCurlify = function vsiCurlify(uri) {
  var parsed = url.parse(uri);
  if(parsed.protocol == "http:") {
    return "/vsicurl/" + uri;
  }

  if(parsed.protocol == "s3:") {
    return util.format("/vsicurl/http://%s.s3.amazonaws.com%s", parsed.hostname, parsed.path);
  }

  return uri;
};

module.exports.uriJoin = function uriJoin() {
  if(arguments.length == 0) { return null; }
  if(arguments.length == 1) { return arguments[0]; }
  var head = arguments[0] + '';
  var tail = _.map(_.rest(arguments), function(p) { return p + ''; });
  var urlParsed = url.parse(head);
  if(urlParsed.protocol) {
    var joined = path.join.apply(null, [urlParsed.hostname, urlParsed.path].concat(tail));
    return util.format("%s//%s", urlParsed.protocol, joined);
  } else {
    return path.join.apply(null, [urlParsed.path].concat(tail));
  }
};
