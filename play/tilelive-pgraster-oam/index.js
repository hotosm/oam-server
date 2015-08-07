"use strict";

var url = require("url"),
    util = require("util");

var async = require("async"),
    debug = require("debug")("tilelive-pgraster-oam"),
    escape = require("pg-escape"),
    holdtime = require("holdtime"),
    mapnik = require("mapnik"),
    merc = new (require("sphericalmercator"))(),
    pg = require("pg");

module.exports = function(tilelive) {
  var PGRaster = function(uri, callback) {
    this.databaseUrl = url.format(uri);

    uri = url.parse(uri, true);

    this.band = (uri.query.band | 0) || 1;
    this.column = uri.query.column || "rast";
    this.table = uri.query.table;
    this.image = uri.query.image;

    return setImmediate(callback, null, this);
  };

  PGRaster.prototype.getTile = function(z, x, y, callback) {
    var column = this.column,
        table = this.table,
        image = this.image;

    return pg.connect(this.databaseUrl, function(err, client, done) {
      if (err) {
        return callback(err);
      }

      var bbox = merc.bbox(x, y, z, false, "900913");

      var query = escape(
        [
          "SELECT DISTINCT ON (zoom) zoom,",
          "  zoom,",
          // "  ST_Width(ST_Clip(ST_Union(%I), ST_SetSRID($1::box2d, 3857))) width,",
          // "  ST_Height(ST_Clip(ST_Union(%I), ST_SetSRID($1::box2d, 3857))) height,",
          // "  ST_AsPNG(ST_Clip(ST_Union(%I), ST_SetSRID($1::box2d, 3857))) png",
          // "  ST_AsPNG(ST_Union(ST_Clip(%I, ST_SetSRID($1::box2d, 3857)))) png",
          // "  ST_AsPNG(ST_Union(%I, ST_SetSRID($1::box2d, 3857))) png",
          "  ST_AsPNG(ST_Clip(%I, ST_SetSRID($1::box2d, 3857))) png",
          // "  ST_AsPNG(%I) png",
          "FROM %I",
          "WHERE image = $2",
          "  AND zoom <= $3",
          "  AND %I && ST_Centroid($1::box2d)",
          // "GROUP BY zoom",
          "ORDER BY zoom DESC",
          "LIMIT 1"
        ].join("\n"),
        // column,
        // column,
        column,
        table,
        column
      );

      return client.query(query,
                          [
                            util.format("BOX(%d %d,%d %d)", bbox[0], bbox[1], bbox[2], bbox[3]),
                            image,
                            z
                          ],
                          holdtime(function(err, result, elapsedMS) {
        console.log("query took %dms", elapsedMS);
        done();

        if (err) {
          return callback(err);
        }

        if (result.rows.length === 0) {
          return callback(new Error("Tile does not exist"));
        }

        // if (result.rows.length > 1) {
        //   return callback(new Error("Too many rows returned."));
        // }

        debug("zoom:", result.rows[0].zoom);
        debug("width:", result.rows[0].width);
        debug("height:", result.rows[0].height);

        console.log(result.rows.length);
        console.log(result.rows.map(function(x) { return x.width; }));

        return callback(null, result.rows[0].png, {
          "Content-Type": "image/png"
        });

        return async.map(result.rows.map(function(row) { return row.png; }), async.apply(mapnik.Image.fromBytes), function(err, images) {
          if (err) {
            return callback(err);
          }

          return async.reduce(images, new mapnik.Image(256, 256, {
            premultiplied: true
          }), function(im1, im2, done) {
            return im2.premultiply(function(err) {
              if (err) {
                return callback(err);
              }

              return im1.composite(im2, done);
            });
          }, function(err, im) {
            return im.encode("png", function(err, buf) {
              if (err) {
                return callback(err);
              }

              return callback(null, buf, {
                "Content-Type": "image/png"
              });
            });
          });
        });


        // return mapnik.Image.fromBytes(result.rows[0].png, function(err, im) {
        //   if (err) {
        //     return callback(err);
        //   }
        //
        //   // we're getting a 257x257 image back, so let's window it
        //   var view = im.view(1, 0, 257, 256);
        //
        //   return view.encode(function(err, png) {
        //     if (err) {
        //       return callback(err);
        //     }
        //
        //     return callback(null, png, {
        //       "Content-Type": "image/png"
        //     });
        //   });
        // });
      }));
    });
  };

  PGRaster.prototype.getInfo = function(callback) {
    // LC81410412014277LGN00
    // 85.273277798802 27.4280691147198
    // TODO query for zooms and center
    return setImmediate(callback, null, {
      format: "png",
      minzoom: 0,
      maxzoom: Infinity
    });
  };

  PGRaster.prototype.close = function(callback) {
    return callback && setImmediate(callback);
  };

  PGRaster.registerProtocols = function(tilelive) {
    tilelive.protocols["pgraster+oam:"] = PGRaster;
  };

  PGRaster.registerProtocols(tilelive);

  return PGRaster;
};
