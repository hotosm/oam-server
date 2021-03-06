var assert = require("assert"),
    os = require("os"),
    path = require("path"),
    util = require("util");

var async = require("async"),
    range = require("range").range,
    Promise = require("bluebird"),
    Set = require("collections/set"),
    _ = require('underscore');

var buildHierarchicalVrt = require("./build-hierarchical-vrt"),
    tileCells = require("./tile-cells"),
    uriJoin = require("./utilities").uriJoin;

var WEBMERCATOR_WIDTH = 20037508.342789244 * 2,
    WEBMERCATOR_HEIGHT = WEBMERCATOR_WIDTH,
    WEBMERCATOR_XMIN = -20037508.342789244,
    WEBMERCATOR_YMAX = 20037508.342789244;

// A set for accumulating tile grid coordinates.
// Since images can be overlapping, this provides an
// easy way to deduplicate.
var CoordSet = function(arr) {
  return new Set(arr, function(a, b) { return a[0] == b[0] && a[1] == b[1] }, function(a) { return a[0] + '-' + a[1]; });
};

// Gets the zoom level that fits the input resolution.
// This decides the max zoom level for a given image.
var zoomFor = function zoomFor(resolution, maxZoom) {
  var res = Math.abs(Math.min(resolution[0], resolution[1]));
  var _zoomFor = function(z) {
    var r2 = WEBMERCATOR_WIDTH / (Math.pow(2, z + 1) * 256);
    var r1 = WEBMERCATOR_WIDTH / (Math.pow(2, z) * 256);
    if(r2 < res) {
      var dRes = r1 - res;
      var dZoom = r1 - r2;
      if(dRes * 3 < dZoom) {
        return z;
      }
      return z + 1;
    }
    if (maxZoom && z > maxZoom) { return z; }
    assert(z <= 25, "Tiler cannot handle zooms greater than 25");
    return _zoomFor(z + 1);
  };

  return _zoomFor(2);
};

// Returns the [xmin, ymin, xmax, ymax] extent for the given
// tile grid coordinate at the given zoom level.
var gridCoordToExtent = function gridCoordToExtent(z, col, row) {
  var tileWidth = WEBMERCATOR_WIDTH / Math.pow(2, z),
      tileHeight = tileWidth,
      xmin = WEBMERCATOR_XMIN + (col * tileWidth),
      ymin = WEBMERCATOR_YMAX - ((row + 1) * tileHeight),
      xmax = WEBMERCATOR_XMIN + ((col + 1) * tileWidth),
      ymax = WEBMERCATOR_YMAX - (row * tileHeight);

  return [xmin, ymin, xmax, ymax];
};

// Returns [maxZoom, coords], where
// maxZoom is the maximum zoom level for an extent and resolution (see zoomFor),
// and the set of tile coordinates at that zoom level that will cover that image.
var getGridCoords = function getGridCoords(extent, zoom) {
  var layoutCols = Math.pow(2, zoom),
      layoutRows = layoutCols,
      xmin = extent[0],
      ymin = extent[1],
      xmax = extent[2],
      ymax = extent[3];

  var colMin = (((xmin - WEBMERCATOR_XMIN) / WEBMERCATOR_WIDTH) * layoutCols) | 0,
      rowMin = (((WEBMERCATOR_YMAX - ymax) / WEBMERCATOR_HEIGHT) * layoutRows) | 0;

  // Need addition logic for east/south borders, since extents are non-inclusive on those sides.
  var dx = (xmax - WEBMERCATOR_XMIN) / WEBMERCATOR_WIDTH;
  var colMax = (dx * layoutCols) | 0;
  if(dx === Math.floor(dx)) {
    colMax = ((dx * layoutCols) | 0) - 1;
  }

  var dy = (WEBMERCATOR_YMAX - ymin) / WEBMERCATOR_HEIGHT;
  var rowMax = (dy * layoutRows) | 0;
  if(dy === Math.floor(dy)) {
    rowMax = ((dy * layoutRows) | 0) - 1;
  }
  
  var gridCoords = [];
  for(var r = rowMin; r <= rowMax; r += 1) {
    for(var c = colMin; c <= colMax; c += 1) {
      // assert(r > 0, util.format("BAD COORD: %d %d", r, c));
      // assert(c > 0, util.format("BAD COORD: %d %d", r, c));
      gridCoords.push([c, r]);
    }
  }
  
  return { zoom: zoom, coords: gridCoords };
};

// Tile the given source VRT into PNG tiles for each
// of the given grid coordinates at the given zoom level.
// Returns a promise resulting in a VRT of the newly tiled set.
var tile = function tile(source, zoom, coords, options) {
  return Promise
    .resolve(coords)
    .bind(this)
    .map(function(coord) {
      var target = uriJoin(options.target, zoom + '', coord[0] + '', coord[1] + ".png"),
          extent = gridCoordToExtent(zoom, coord[0], coord[1]),
          resampleOptions = {
            overwrite : true,
            targetExtent: extent,
            targetResolution: [
              (extent[2] - extent[0]) / options.tileCols,
              (extent[3] - extent[1]) / options.tileRows
            ],
            nodata : 0,
            workingDir : options.localWorkingDir
          };

      this.log("RESAMPLING %s TO %s", source, target);
      return this.activity("resampleToPng", "1.0", source, target, resampleOptions)
        .then(function(file) {
          return { coord: coord, file: file};
        });

    }, { concurrency: options.concurrency || 0 })
    .then(function(coordsAndFiles) {
      var vrtPath = uriJoin(options.workingDir, "vrt", zoom + '');
      return buildHierarchicalVrt.call(this, coordsAndFiles, vrtPath, { nodata: 0, vrtThreshold : options.vrtThreshold });
    });
};

// Tiles a VRT between two zoom levels, using the last tiling call's VRT as the input for
// the next round of tiling.
// Returns the Promise that resolves to the last zoom's VRT and tile grid coordinates.
var tileBetweenZooms = function tileBetweenZooms(initialVrt, startZoom, endZoom, initialCoords, options) {
  return Promise
    .resolve(range(startZoom, endZoom, -1))
    .bind(this)
    .reduce(function(previous, z) {
      var sourceVrt = previous[0],
          sourceCoords = previous[1];

      return Promise
        .bind(this)
        .then(function() {
          return tile.call(this, sourceVrt, z, sourceCoords, options);
        })
        .then(function(resultVrt) {
          var resultCoords = _.map(sourceCoords, function(coord) {
            return [(coord[0] / 2) | 0, (coord[1] / 2) | 0];
          });
          return [resultVrt, CoordSet(resultCoords).toArray()];
        });
    }, [initialVrt, initialCoords]);
};

// Tiles a set of images to PNGs, based on the resolution of those images.
// Input images are expected to be in EPSG:3857 projection.
// Only creates tiles that will cover the entire image set,
// and will only consider images in the image set available for 
// the mosaic at a certain zoom level if the image's max zoom level is greater than or equal to that
// zoom level.
// Parameters:
//     images   -   Images from which to create the mosaiced tile set. The order in which they are listed
//                  will be the order in which they are prioritized in the mosaic.
//     options  -   Options for the tiling:
//         workingDir      - A local or s3 URI that represents the "working directory",
//                           which is where things like .tiffs and VRTs will be stored as intermediate data.
//                           This should be cleaned up after the final resulting Promise is completed.
//         localWorkingDir - Local temporary directory where activites will place their temprorary files.
//                           These should be cleaned up automatically by the activities.
//         target          - A local or s3 URI where the resulting tile set will be stored. For example,
//                           if "s3://oam.hotosm.org/tileset1" is given, the tile set would be stored
//                           such that "s3://oam.hotosm/org/tileset1/{z}/{x}/{y}.png" would be a valid 
//                           tile service endpoint.
//         tileCols        - The size in pixels of each tile's width. Defaults to 256.
//         tileRows        - The size in pixels of each tile's height. Defaults to 256.
//         concurrency     - Maximum concurrency to set onto BlueBird promises. Default to # of CPUs.
//         vrtThreshold    - Maximum number of files a VRT should hold before it is broken down into a hierarchy of VRTs
//                           via the buildHierarchicalVrt function.
var tileToPngs = function tileToPngs(images, options) {
  options.concurrency = options.concurrency | os.cpus().length;
  options.vrtThreshold = options.vrtThreshold | 256;

  var prioritizedImages = images.reverse();

  return Promise
    .resolve(images)
    .bind(this)
    .map(function(image) {
      return this.activity("getInfo", "1.0", image)
        .then(function(info) {
          var zoom = zoomFor(info.resolution);
          var gridCoordsResult = getGridCoords(info.extent, zoom);
          return { image: image, maxZoom: gridCoordsResult.zoom, coords: gridCoordsResult.coords };
        });
    })
    .then(function(imageInfos) {
      var grouped = _.groupBy(imageInfos, function(imageInfo) {
        return imageInfo.maxZoom;
      });

      // Get the zoom levels for which we have images.
      var zooms = _.map(imageInfos, function(imageInfo) { return imageInfo.maxZoom; });

      var createZoomsToCoords = function() {
        var result = {};

        // Collapse the image and cell information for each 
        for(var i = 0; i < zooms.length; i += 1) {
          var z = zooms[i],
              infos = grouped[z],
              coords = CoordSet();

          for(var j = 0; j < infos.length; j += 1) {
            var imageInfo = infos[j];
            coords.addEach(imageInfo.coords);
          }

          result[z] = coords;
        }

        return result;
      };

      var zoomsToCoords = createZoomsToCoords();

      var sortedZooms = _.sortBy(new Set(zooms).toArray(), function(z) { return -z });
      // Include zoom 1 for sliding window
      sortedZooms.push(1);

      var zoomRanges = [];
      for(var i = 0; i < sortedZooms.length - 1; i += 1) {
        var z = sortedZooms[i];
        var zoomRange = { range: [sortedZooms[i], sortedZooms[i + 1]], coords : zoomsToCoords[z] };
        zoomRanges.push(zoomRange);
      }

      return Promise
        .resolve(zoomRanges)
        .bind(this)
        .reduce(function(previousReturn, zoomRange) {
          var previousVrt = previousReturn[0],
              previousTilingCoords = previousReturn[1],
              z1 = zoomRange.range[0],
              z2 = zoomRange.range[1],
              newCoords = zoomRange.coords,
              coords = newCoords.addEach(previousTilingCoords).toArray();

          var initialVrtImages = [];
          if (previousVrt) {
            initialVrtImages.push(previousVrt);
          }
          initialVrtImages = initialVrtImages.concat(prioritizedImages);
          
          return Promise
            .bind(this)
            .then(function() {
              var vrtPath = uriJoin(options.workingDir, "vrt", util.format("initial-%d.vrt", z1));
              return this.activity("buildVRT", "1.0", initialVrtImages, vrtPath, { nodata: 0 });
            })
            .then(function(vrt) {
              return tileBetweenZooms.call(this, vrt, z1, z2, coords, options);
            });
        }, ["", []]);
    });
};

module.exports = tileToPngs;
