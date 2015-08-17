var util = require("util");

var Promise = require("bluebird"),
    Map = require("collections/map"),
    _ = require("underscore");

// Used to build up a set of hierarchical VRTs.
// The problem with VRTs that have many, many files is...they are sloooow.
// This uses a technique of building VRTs up so that they do not contain
// more images than some threshold. If the original set of images
// is greater than the the threshold, then we build VRTs in a grid based
// on the min/max col and row of the grid coordinates.
// Then those VRTs that we built up are contructed into another VRT.
// This is recursive, so if it ends up that the generated set of VRTs in the first
// level make up more images then the threshold, those images will be partitioned
// into another level's VRT, and so one, until the last VRT has no more images
// then the threshold.
// Requires that you set "this" to a swfr DeciderContext.
module.exports = function buildHierarchicalVrt(initialCoordsAndFiles, vrtPath, options) {
  var threshold = options.vrtThreshold | 256;
  var t = Math.sqrt(threshold) | 0;

  var levelUpHierarchy = function(level, desc) {
    var minCol = desc.minCol,
        minRow = desc.minRow;

    var coordsAndFiles  = desc.coordsAndFiles;

    var newMinCol = -1,
        newMinRow = -1;

    var m = new Map();
    for(var i = 0; i < coordsAndFiles.length; i += 1) {
      var caf = coordsAndFiles[i];
      var coord = caf.coord;

      if(coord[0] < newMinCol || newMinCol < 0) { newMinCol = coord[0]; }
      if(coord[1] < newMinRow || newMinRow < 0) { newMinRow = coord[1]; }

      var file = caf.file;
      var x = (coord[0] - minCol) / t | 0;
      var y = (coord[1] - minRow) / t | 0;
      var s = x + "-" + y;
      if(!m.has(s)) { m.set(s, { coord: [x, y], componentFiles:  [], file: util.format("%s-%d-%s.vrt", vrtPath, level,s) }); }
      m.get(s).componentFiles.push(file);
    }

    return {
      minCol: newMinCol,
      minRow: newMinRow,
      coordsAndFiles: m.values()
    };
  };

  var minCol = -1,
      minRow = -1;
  _.forEach(_.map(initialCoordsAndFiles, function(caf) { return caf.coord; }), function(coord) {
    if(coord[0] < minCol || minCol < 0) { minCol = coord[0]; }
    if(coord[1] < minRow || minRow < 0) { minRow = coord[1]; }
  });

  var desc = { 
    minCol: minCol, 
    minRow: minRow,
    coordsAndFiles: initialCoordsAndFiles
  };

  var level = 1;
  var vrtSteps = [];
  while(desc.coordsAndFiles.length > threshold) {
    desc = levelUpHierarchy(level, desc);
    var vrtStep = _.map(desc.coordsAndFiles, function(caf) { return { vrtPath: caf.file, componentFiles: caf.componentFiles } });
    vrtSteps.push(vrtStep);
    level += 1;
  }
  
  vrtSteps.push([{ vrtPath: vrtPath, componentFiles: _.map(desc.coordsAndFiles, function(caf) { return caf.file; }) }]);

  return Promise
    .resolve(vrtSteps)
    .bind(this)
    .each(function(vrtStep) {
      return Promise
        .resolve(vrtStep)
        .bind(this)
        .map(function(vrtBuildDesc) {
          return this.activity("buildVRT", "1.0", vrtBuildDesc.componentFiles, vrtBuildDesc.vrtPath, { nodata: 0 });
        });
    })
    .then(function() {
      return vrtPath;
    });
};
