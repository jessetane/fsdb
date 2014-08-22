var fs = require('fs');
var mkdirp = require('mkdirp');
var queue = require('queue');

exports.read = function(filename, prop, opts, cb) {
  var self = this;
  fs.readdir(filename, function(err, ids) {
    if (err) return cb(err);
    self[prop] = [];
    ids.forEach(function(id) {
      if (/^\./.test(id)) return; // skip hidden files
      self[prop].push(id);
    });
    cb();
  });
};

exports.update = function(filename, prop, opts, cb) {
  var self = this;
  var value = this[prop];
  var q = queue();

  fs.readdir(filename, function(err, ids) {
    if (err && err.code !== 'ENOENT') return cb(err);

    ids = ids || [];
    var newids = {};
    var needUpdate = [];
    var needDestroy = [];

    for (var i in value) {
      var id = value[i];
      if (typeof id === 'object') {
        var model = id;
        if (model.id) {
          newids[model.id] = true;
          if (model.data !== undefined && 
              model.data !== null) {
            needUpdate.push(model);
          }
        }
      }
      else if (typeof id === 'string') {
        newids[id] = true;
      }
    }

    for (var i in ids) {
      var id = ids[i];
      console.log(id, newids[id]);
      if (!newids[id]) {
        needDestroy.push(id);
      }
    }

    if (needUpdate.length) {
      q.push(function(cb) {
        mkdirp(filename, function(err) {
          if (err) return cb(err);

          for (var i in needUpdate) (function(model) {
            var id = model.id;
            var data = model.data;

            if (typeof data === 'string' || Buffer.isBuffer(data)) {
              q.push(function(cb) {
                fs.writeFile(filename + '/' + id, data, cb);
              });
            }
            else if (typeof data === 'object' && data.readable) {
              data.pipe(fs.createWriteStream(filename + '/' + id));
            }
            else {
              cb(new Error('file data for directory item "' + id + '" must be a string, buffer or readable stream'));
            }
          })(needUpdate[i]);

          cb();
        });
      });
    }

    for (var i in needDestroy) (function(id) {
      q.push(function(cb) {
        fs.unlink(filename + '/' + id, cb);
      });
    })(needDestroy[i]);

    q.start(cb);
  });
};
