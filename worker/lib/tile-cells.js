"use strict";

var util = require("util");

// WGS 84 semi-major axis (m)
var SEMI_MAJOR_AXIS = 6378137;

var targetResolution = function(zoom, cellWidth, cellHeight) {
  var layoutCols = Math.pow(2, zoom),
      layoutRows = layoutCols,
      worldXmin = -20037508.342789244,
      worldYmax = 20037508.342789244,
      worldXmax = 20037508.342789244,
      worldYmin = -20037508.342789244,

      worldWidth = worldXmax - worldXmin,
      worldHeight = worldYmax - worldYmin,
      tileWidth = worldWidth / layoutCols,
      tileHeight = worldHeight / layoutRows;

  return [tileWidth / cellWidth, tileHeight / cellHeight];
};

// Assumins WebMercator! Could be abstracted by passing in the world extent.
var tiler = function(vrt, extent, targetZoom, targetPrefix, cellWidth, cellHeight) {

  var xmin = extent[0][0],
      ymax = extent[0][1],
      xmax = extent[1][0],
      ymin = extent[1][1];

  var layoutCols = Math.pow(2, targetZoom),
      layoutRows = layoutCols;

  var worldXmin = -20037508.342789244,
      worldYmax = 20037508.342789244,
      worldXmax = 20037508.342789244,
      worldYmin = -20037508.342789244,

      worldWidth = worldXmax - worldXmin,
      worldHeight = worldYmax - worldYmin,
      tileWidth = worldWidth / layoutCols,
      tileHeight = worldHeight / layoutRows;

  // Converts a point to a layout grid coordinate for the target zoom.
  var xToGrid = function (x) {
    // Perhaps rounding issue?
    return (((x - worldXmin) / worldWidth) * layoutCols) | 0;
  };

  var yToGrid = function (y) {
    return (((worldYmax - y) / worldHeight) * layoutRows) | 0;
  };

  var extentFor = function (col, row) {
    var xmin = worldXmin + (col * tileWidth),
        ymin = worldYmax - ((row + 1) * tileHeight),
        xmax = worldXmin + ((col + 1) * tileWidth),
        ymax = worldYmax - (row * tileHeight);

    return [[xmin, ymax],[xmax, ymin]];
  };
  
  // First step: Take each of the extent points and map them to the tile layout for this zoom.
  var colMin = xToGrid(xmin);
  var colMax = xToGrid(xmax);
  var rowMin = yToGrid(ymax);
  var rowMax = yToGrid(ymin);

  console.log("TARGET RESOLUTION %d %d %d", targetZoom, tileWidth / cellWidth, tileHeight / cellHeight);

  console.log("SETUP (%d, %d, %d, %d)", worldWidth, layoutCols, worldHeight, layoutRows);
  console.log("GRID BOUNDS (%d, %d, %d, %d)", colMin, colMax, rowMin, rowMax);

  var cells = [];

  for (var col = colMin; col <= colMax; col++) {
    for (var row = rowMin; row <= rowMax; row++) {
      var cellExtent = extentFor(col, row);
      console.log("EXTENT FOR %d %d %d (%d, %d, %d, %d)", targetZoom, col, row, cellExtent[0][0], cellExtent[1][1], cellExtent[1][0], cellExtent[0][1]);
      cells.push({
        source: vrt,
        target: util.format("%s/%d/%d/%d.tiff", targetPrefix, targetZoom, col, row),
        options: {
          targetExtent: [
            cellExtent[0][0],
            cellExtent[1][1],
            cellExtent[1][0],
            cellExtent[0][1]
          ],
          targetResolution: [
            tileWidth / cellWidth,
            tileHeight / cellHeight
          ]
        }
      });
    }
  }

  return cells;
};

module.exports = tiler;
