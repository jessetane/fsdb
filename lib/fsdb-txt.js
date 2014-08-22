var fs = require('fs');

exports.read = function(filename, prop, opts, cb) {
  var self = this;
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err) return cb(err);
    self[prop] = data;
    cb();
  });
};

exports.update = function(filename, prop, opts, cb) {
  fs.writeFile(filename, this[prop], cb);
};
