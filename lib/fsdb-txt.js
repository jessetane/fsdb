exports.read = function(fs, fullpath, filename, stat, opts, cb) {
  var self = this;
  fs.readFile(fullpath, 'utf8', function(err, data) {
    if (err) return cb(err);
    self.files[filename].data = data;
    cb();
  });
};

exports.update = function(fs, fullpath, filename, stat, opts, cb) {
  fs.writeFile(fullpath, this.files[filename].data || '', cb);
};
