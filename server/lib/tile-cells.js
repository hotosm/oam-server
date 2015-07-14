"use strict";

var util = require("util");

// WGS 84 semi-major axis (m)
var SEMI_MAJOR_AXIS = 6378137;

module.exports = function(vrt, extent, targetZoom, targetPrefix, cellWidth, cellHeight) {
  var cells = [],
      widthPx = Math.pow(2, targetZoom + 8), // world's width in px, assuming 256x256 tiles
      heightPx = widthPx,
      // 2 * pi * earth radius * cos(lat)
      circumference = 2 * Math.PI * SEMI_MAJOR_AXIS * Math.cos(0),
      // extents
      minX = (circumference / 2) * -1,
      minY = minX,
      maxX = (circumference / 2),
      maxY = maxX,
      // circumference / pixel width(zoom)
      targetResolution = circumference / widthPx,
      width = cellWidth * targetResolution,
      height = width,
      // human-readable extent components
      left = extent[0][0],
      right = extent[1][0],
      bottom = extent[1][1],
      top = extent[0][1];

  // chop the (overlapping) world into cells
  for (var yi = 0; yi < heightPx / cellHeight; yi++) {
    var y = heightPx / cellHeight - yi - 1, // convert from TMS to XYZ coords (top-left origin)
        y1 = Math.max(minY, (yi * height) - (circumference / 2)),
        y2 = Math.min(maxY, ((yi + 1) * height) - (circumference / 2));

    for (var xi = 0; xi < widthPx / cellWidth; xi++) {
      var x1 = Math.max(minX, (xi * width) - (circumference / 2)),
          x2 = Math.min(maxX, ((xi + 1) * width) - (circumference / 2));

      // check intersection
      if ((((left <= x1 && x1 <= right) ||
           (left <= x2 && x2 <= right)) ||
          (x1 <= left && left <= x2 &&
           x1 <= right && right <= x2)) &&
          (((bottom <= y1 && y1 <= top) ||
           (bottom <= y2 && y2 <= top)) ||
          (y1 <= bottom && bottom <= y2 &&
           y1 <= top && top <= y2))) {        // return a list and then run map in order to limit concurrency
        cells.push({
          source: vrt,
          target: util.format("%s/%d/%d/%d.tiff", targetPrefix, targetZoom, xi, y),
          options: {
            targetExtent: [x1, y1, x2, y2],
            targetResolution: [targetResolution, targetResolution]
          }
        });
      }
    }
  }

  return cells;
};
