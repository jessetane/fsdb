exports.read = function(fs, fullpath, filename, address, opts, cb) {
  var self = this;
  fs.readFile(fullpath, 'utf8', function(err, data) {
    if (err) return cb(err);
    self.files[filename].data = data;
    cb();
  });
};

exports.update = function(fs, fullpath, filename, address, opts, cb) {
  if (this.files[filename]) {
    fs.writeFile(fullpath, this.files[filename].data || '', cb);
  }
  else {
    fs.unlink(fullpath, cb);
  }
};
