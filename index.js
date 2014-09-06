var crypto = require('crypto');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var xtend = require('xtend/mutable');
var queue = require('queue');
var splitpath = require('./lib/splitpath');

module.exports = function(opts) {
  opts = opts || {};

  if (!opts.root) {
    throw new Error('missing root');
  }

  var fs = opts.fs || require('fs');
  var root = opts.root || process.cwd();
  var types = xtend({ 'txt': require('./lib/fsdb-txt') }, opts.types);
  var muxer = opts.muxer;
  var idsize = opts.idsize || 8;

  FSDB.create = function(db, opts, cb) {
    return FSDB(db).create(opts, cb);
  };

  FSDB.read = function(db, opts, cb) {
    return FSDB(db).read(opts, cb);
  };

  FSDB.update = function(db, opts, cb) {
    return FSDB(db).update(opts, cb);
  };

  FSDB.destroy = function(db, opts, cb) {
    return FSDB(db).destroy(opts, cb);
  };

  function FSDB(db) {
    if (!(this instanceof FSDB))
      return new FSDB(db);

    db = db || {};

    if (typeof db === 'string') {
      db = splitpath(db);
      this.id = db[1];
      this.location = db[0];
    }
    else {
      this.id = db.id || '';
      this.location = db.location || '/';
    }

    this.files = {};
    this.folders = [];
  }

  FSDB.prototype.create = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = null;
    }
    opts = opts || {};

    var self = this;
    if (!this.id && this.location !== '/') {
      this.id = crypto.createHash('sha256')
                      .update(crypto.randomBytes(256))
                      .digest('hex')
                      .slice(0, idsize || 16).toLowerCase();

      var fullpath = mkfullpath.call(this);
      fs.exists(fullpath, function(exists) {
        if (exists) self.id = '';
        self.create(opts, cb);
      });

      return this;
    }

    var fullpath = mkfullpath.call(this);
    mkdirp(fullpath, { fs: fs }, function(err) {
      if (err) return cb(err);
      self.update(opts, cb);
    });

    return this;
  };

  FSDB.prototype.update = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = null;
    }
    opts = opts || {};

    var self = this;
    var fullpath = mkfullpath.call(this);

    fs.exists(fullpath, function(exists) {
      if (!exists) return cb(new Error('folder does not exist'));
      var q = queue();

      // files
      for (var name in self.files) (function(name, file) {
        if (file && typeof file !== 'object') {
          file = self.files[name] = { data: file };
        }

        var fullpath = mkfullpath.call(self, name);
        var ext = (file && file.type) || name.replace(/[.]*[^.]+\.(.*)/, '$1');
        var type = mktype(ext);

        if (file) {
          if (type && type.update) {
            q.push(function(cb) {
              type.update.call(self, fs, fullpath, name, file.stat, opts, cb);
            });
          }
          else {
            // if no update method was found don't do anything
          }
        }
        else {
          if (type && type.destroy) {
            q.push(function(cb) {
              type.destroy.call(self, fs, fullpath, name, file.stat, opts, cb);
            });
          }
          else {
            q.push(function(cb) {
              delete self.files[name];
              self.fs.unlink(fullpath, cb);
            });
          }
        }
      })(name, self.files[name]);

      // folders
      for (var id in self.folders) (function(folder) {
        if (folder) {
          q.push(function(cb) {
            folder.update(opts, cb);
          });
        }
        else {
          q.push(function(cb) {
            folder.destroy(cb);
          });
        }
      })(self.folders[id]);

      q.start(function(err) {
        cb && cb(err, self);
      });
    });

    return this;
  };

  FSDB.prototype.read = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = null;
    }
    opts = opts || {};

    var self = this;
    var folders = [];
    var fullpath = mkfullpath.call(this);
    var q = queue();

    fs.readdir(fullpath, function(err, filenames) {
      if (err) return cb(err);

      filenames.map(function(filename) {
        q.push(function(cb) {
          var fullpath = mkfullpath.call(self, filename);
          fs.stat(fullpath, function(err, stat) {
            if (err) return cb(err);
            
            var isfile = stat.isFile();
            var isdir = stat.isDirectory();
            if (!isfile && !isdir) return;

            if (isdir) {
              var db = new FSDB(self.location + '/' + self.id + '/' + filename);
              folders.push(db);

              if (!opts.shallow) {
                var diropts = xtend({}, opts);
                diropts.shallow = true;
                delete diropts.limit;
                delete diropts.sort;
                return db.read(diropts, cb);
              }

              cb();
            }
            else {
              var ext =  filename.replace(/[.]*[^.]+\.(.*)/, '$1');
              var type = mktype(ext);
              self.files[filename] = { type: ext, /*stat: stat,*/ };

              if (type && type.read) {
                return type.read.call(self, fs, fullpath, filename, stat, opts, cb);
              }
              
              cb();
            }
          });
        });
      });

      q.start(function(err) {
        if (err) return cb && cb(err);

        // sort
        var sort = opts.sort;
        if (sort) {
          folders.sort(function(dba, dbb) {
            var a = dba.files[sort];
            var b = dbb.files[sort];
            a = a && a.data !== undefined ? a.data : Infinity;
            b = b && b.data !== undefined ? b.data : Infinity;
            return a > b ? 1 : -1;
          });
        }

        // limit
        var limit = opts.limit;
        var page = opts.page || 0;
        var pos = opts.position || page * limit;
        if (limit) {
          folders = folders.slice(pos, pos + limit);
        }

        // save folders
        self.folders = folders;

        cb && cb(null, self);
      });
    });

    return this;
  };

  FSDB.prototype.destroy = function(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = null;
    }
    opts = opts || {};

    var self = this;
    var fullpath = mkfullpath.call(this);

    this.read({ shallow: true }, function(err) {
      if (err) return cb(err);
      var q = queue();

      // files
      for (var name in self.files) (function(name, file) {
        var fullpath = mkfullpath.call(self, name);
        var ext = file.type || name.replace(/[.]*[^.]+\.(.*)/, '$1');
        var type = mktype(ext);

        if (type && type.destroy) {
          q.push(function(cb) {
            type.destroy.call(self, fs, fullpath, name, null, opts, cb);
          });
        }
      })(name, self.files[name]);

      // folders
      for (var id in self.folders) (function(folder) {
        q.push(function(cb) {
          folder.destroy(opts, cb);
        });
      })(self.folders[id]);

      q.start(function(err) {
        if (err) return cb(err);
        rimraf(fullpath, fs, function(err) {
          cb & cb(err, self);
        });
      });
    });

    return this;
  };

  function mkfullpath(id) {
    id = id || '';
    var p = splitpath(root + '/' + this.location + '/' + this.id + '/' + id);
    return p[1] ? p[0] + '/' + p[1] : p[0];
  }

  function mktype(ext) {
    var type = types[ext];
    if (typeof type === 'string') type = types[type];
    return type;
  }

  return FSDB;
};
