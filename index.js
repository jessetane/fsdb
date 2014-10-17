var crypto = require('crypto');
var events = require('events');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var queue = require('queue');
var xtend = require('xtend/mutable');

module.exports = FSDB;

function FSDB(db) {
  if (!(this instanceof FSDB))
    return new FSDB(db);

  db = db || {};

  if (!db.root) {
    throw new Error('missing root');
  }

  xtend(this, db);

  this.id = this.id || '';
  this.idsize = this.idsize || 8;
  this.files = this.files || {};
  this.folders = this.folders || {};
  this.types = xtend({ 'txt': require('./lib/fsdb-txt') }, this.types);
  this.notifications = this.notifications || new events.EventEmitter;
  this.fs = this.fs || require('fs');
}

Object.defineProperty(FSDB.prototype, 'location', {
  get: function() {
    if (!this._location) {
      this._location = [];
    }
    return this._location;
  },
  set: function(location) {
    if (typeof location === 'string') {
      location = normalizepath(location).split('/').slice(1);
    }
    this._location = location;
  }
});

Object.defineProperty(FSDB.prototype, 'address', {
  get: function() {
    return this.id ? this.location.concat([ this.id ]) : this.location.slice();
  },
  set: function(address) {
    if (typeof address === 'string') {
      address = normalizepath(address).split('/');
      this._location = address.slice(1, -1);
      this.id = address.slice(-1)[0] || '';
    }
    else {
      this._location = address.slice(0, -1);
      this.id = address.slice(-1)[0];
    }
  }
});

FSDB.prototype.api = function() {
  var self = this;
  return {
    create: function(pathname, opts, cb) {
      var db = self.clone(pathname);
      db.create(opts, function(err, model) { cb(err, JSON.stringify(model)) });
    },
    read: function(pathname, opts, cb) {
      var db = self.clone(pathname);
      db.read(opts, function(err, model) { cb(err, JSON.stringify(model)) });
    },
    update: function(data, opts, cb) {
      var db = self.clone(data);
      db.update(opts, function(err, model) { cb(err, JSON.stringify(model)) });
    },
    destroy: function(pathname, opts, cb) {
      var db = self.clone(pathname);
      db.destroy(opts, function(err, model) { cb(err, JSON.stringify(model)) });
    },
    search: function(pathname, query, opts, cb) {
      var db = self.clone(pathname);
      db.search(query, opts, function(err, model) { cb(err, JSON.stringify(model)) });
    },
  };
};

FSDB.prototype.clone = function(db, constructor) {
  var clone = xtend({}, this);
  delete clone.id;
  delete clone._location;
  delete clone.folders;
  delete clone.files;

  if (typeof db === 'string') {
    clone.address = db;
    db = null;
  }

  return new (constructor || this.constructor)(xtend(clone, db));
};

FSDB.prototype.create = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = null;
  }
  opts = opts || {};

  if (this.shouldAllowCreate &&
      !this.shouldAllowCreate(opts)) {
    return cb && cb(new Error('permission denied while trying to create: ' + this.location + '/' + this.id));
  }

  create.call(this);
  return this;

  function create() {
    var self = this;
    var hasid = this.id || this.location.length === 0;

    if (!hasid) {
      this.id = crypto.createHash('sha512')
                      .update(crypto.randomBytes(512))
                      .digest('hex')
                      .slice(0, self.idsize || 16).toLowerCase();
    }

    var fullpath = mkroot(this.root) + '/' + this.address.join('/');
    this.fs.exists(fullpath, function(exists) {
      if (exists && !hasid) {
        self.id = '';
        return create.call(self);
      }

      mkdirp(fullpath, { fs: self.fs }, function(err) {
        if (err) return cb(err);
        opts.creating = !exists;
        self.notifications.emit('create', self);
        self.update(opts, cb);
      });
    });
  }
};

FSDB.prototype.shouldAllowRead = function(address, opts, cb) {
  var include = true;
  address = address.join('/');
  if (opts.exclude) {
    for (var i in opts.exclude) {
      var r = opts.exclude[i];
      if (!(r instanceof RegExp)) {
        r = opts.exclude[i] = Array.isArray(r) ? new RegExp('^' + r[0] + '$', r[1]) : new RegExp('^' + r + '$');
      }
      if (address.match(r)) {
        include = false;
        break;
      }
    }
  }
  if (opts.include) {
    for (var i in opts.include) {
      var r = opts.include[i];
      if (!(r instanceof RegExp)) {
        r = opts.include[i] = Array.isArray(r) ? new RegExp('^' + r[0] + '$', r[1]) : new RegExp('^' + r + '$');
      }
      if (address.match(r)) {
        include = true;
        break;
      }
    }
  }
  cb(null, include);
};

FSDB.prototype.didReadFile = function(filename, address, opts, cb) {
  if (opts.search) {
    var matched = false;
    for (var i in opts.search) {
      var r = opts.search[i];
      if (!(r instanceof RegExp)) {
        r = opts.search[i] = Array.isArray(r) ? new RegExp(r[0], r[1]) : new RegExp(r);
      }
      var data = this.files[filename].data;
      if (typeof data === 'string' && data.match(r)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      this.search = 'target';
      var parent = this.parent;
      while (parent) {
        parent.search = parent.search ? parent.search : true;
        parent = parent.parent;
      }
    }
  }
  cb();
};

FSDB.prototype.read = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = null;
  }
  opts = opts || {};

  opts.cache = opts.cache || {};
  var address = this.address;
  var cached = opts.cache[address.join('/')];
  if (cached) {
    this.files = cached.files;
    this.folders = cached.folders;
    cb();
    return this;
  }
  opts.cache[address] = this;
  this.branch = this.branch && this.branch.slice() || this.location.slice();
  this.branch.push(this.id);

  var q = queue();
  var self = this;
  var folders = [];
  var fullpath = mkroot(this.root) + '/' + address.join('/');
  this.fs.readdir(fullpath, function(err, filenames) {
    if (err) return cb(err);

    filenames.map(function(filename) {
      q.push(function(cb) {
        var subaddress = address.concat([ filename ]);
        var fullpath = fullpath;

        if (self.shouldAllowRead) {
          return self.shouldAllowRead(subaddress, opts, function(err, allow) {
            if (err) return cb(err);
            if (allow === false) return cb();
            doread();
          });
        }
        else {
          doread();
        }

        function doread() {
          fullpath = mkroot(self.root) + '/' + subaddress.join('/');
          self.fs.stat(fullpath, onstat);
        }

        function onstat(err, stat) {
          if (err) return cb(err);
          var isfile = stat.isFile();
          var isfolder = stat.isDirectory();
          if (!isfile && !isfolder) return cb();

          if (isfolder) {
            var db = self.clone({ address: subaddress });
            var diropts = mkopts(opts);
            var dbaddress = subaddress.join('/');
            if (opts.sort) {
              diropts.exclude = [ dbaddress + '/.*' ];
              diropts.include = [ dbaddress + '/' + opts.sort ];
            }
            db.parent = self;
            folders.push(db);
            if (!opts.shallow) return db.read(diropts, cb);
            else return cb();
          }
          else {
            var ext = filename.replace(/[.]*[^.]+\.(.*)/, '$1');
            var type = mktype(self.types, ext);
            var file = self.files[filename];
            self.files[filename] = file && typeof file === 'object' ? file : file ? { data: file } : {};
            self.files[filename].type = ext;
            if (type && type.read) {
              return type.read.call(self, self.fs, fullpath, filename, subaddress, opts, function(err) {
                if (err) return cb(err);
                if (self.didReadFile) return self.didReadFile(filename, subaddress, opts, cb);
                cb();
              });
            }
          }

          cb();
        }
      });
    });

    q.start(function(err) {
      if (err) return cb && cb(err);

      if (opts.search && self.branch.length === 1) {
        var tmp = [];
        for (var i in folders) {
          var folder = folders[i];
          if (folder.search) {
            if (folder.search !== 'target') {
              searchfolder(folder);
            }
            tmp.push(folder);
          }
        }
        folders = tmp;
      }

      if (opts.sort) {
        folders.sort(function(dba, dbb) {
          var a = dba.files[opts.sort];
          var b = dbb.files[opts.sort];
          a = a && a.data !== undefined ? a.data : Infinity;
          b = b && b.data !== undefined ? b.data : Infinity;
          if (opts.reverse) return a < b ? 1 : -1;
          else return a > b ? 1 : -1;
        });
      }

      var limit = opts.limit;
      var page = opts.page || 0;
      var pos = opts.position || page * limit;
      if (limit) {
        folders = folders.slice(pos, pos + limit);
      }

      if (opts.sort) {
        q = queue();
        opts = mkopts(opts);
        delete opts.cache;
        delete opts.search;

        for (var i in folders) (function(folder) {
          self.folders[folder.id] = folder;
          q.push(function(cb) {
            folder.read(opts, cb);
          });
        })(folders[i]);

        q.start(function(err) {
          if (err) return cb && cb(err);
          self.notifications.emit('read', self);
          cb && cb(null, self);
        });
      }
      else {
        for (var i in folders) {
          var folder = folders[i];
          self.folders[folder.id] = folder;
        }
        self.notifications.emit('read', self);
        cb && cb(null, self);
      }
    });
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
  var address = this.address;
  var fullpath = mkroot(this.root) + '/' + address.join('/');
  this.fs.exists(fullpath, function(exists) {
    if (!exists) {
      var err = new Error('folder does not exist: ' + address.join('/'));
      err.code = 'ENOENT';
      return cb(err);
    }
    var q = queue();
    var error = null;

    // files
    for (var filename in self.files) (function(filename, file) {
      if (error) return;
      q.push(function(cb) {
        var subaddress = address.concat([ filename ]);

        if (self.shouldAllowUpdate) {
          self.shouldAllowUpdate(subaddress, opts, function(err, allow) {
            if (err) return cb(err);
            if (allow === false) return cb();
            doupdate.call(self);
          });
        }
        else {
          doupdate.call(self);
        }

        function doupdate() {
          if (file !== undefined && file !== null) {
            if (typeof file !== 'object' || file.data === undefined) {
              file = this.files[filename] = { data: file };
            }
          }

          var fullpath = mkroot(this.root) + '/' + subaddress.join('/');
          var ext = (file && file.type) || filename.replace(/[.]*[^.]+\.(.*)/, '$1');
          var type = mktype(this.types, ext);

          if (type && type.update) {
            type.update.call(self, self.fs, fullpath, filename, subaddress, opts, cb);
          }
          else if (file) {
            // we don't know how to write this kind of file so don't do anything
          }
          else {
            delete self.files[filename];
            self.fs.unlink(fullpath, function(err) {
              cb(err && err.code !== 'ENOENT' ? err : null);
            });
          }
        }
      });
    })(filename, self.files[filename]);

    // folders
    for (var id in self.folders) (function(folder) {
      if (error) return;
      if (!(folder instanceof FSDB)) folder = self.folders[id] = self.clone(folder);
      folder.id = id;
      folder.location = address.slice();

      if (folder) {
        q.push(function(cb) {
          folder.create(opts, cb);
        });
      }
      else {
        q.push(function(cb) {
          folder.destroy(opts, cb);
        });
      }
    })(self.folders[id]);

    if (error) return cb && cb(error);
    q.start(function(err) {
      if (!err) self.notifications.emit('update', self);
      cb && cb(err, self);
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
  if (this.shouldAllowDestroy) {
    this.shouldAllowDestroy(opts, function(err, allow) {
      if (err) return cb(err);
      if (allow === false) {
        err = new Error('permission denied');
        err.code = 'EACCES';
        return cb(err);
      }
      dodestroy.call(self);
    });
  }
  else {
    dodestroy.call(this);
  }

  return this;

  function dodestroy() {
    var address = this.address;
    var fullpath = mkroot(this.root) + '/' + address.join('/');
    this.read(function(err) {
      if (err) return cb(err);
      var q = queue();

      // files
      for (var filename in self.files) (function(filename, file) {
        var subaddress = address.concat([ filename ]);
        var fullpath = mkroot(self.root) + '/' + subaddress.join('/');
        var ext = file.type || filename.replace(/[.]*[^.]+\.(.*)/, '$1');
        var type = mktype(self.types, ext);

        if (type && type.update) {
          q.push(function(cb) {
            delete self.files[filename];
            type.update.call(self, self.fs, fullpath, filename, subaddress, opts, cb);
          });
        }
      })(filename, self.files[filename]);

      // folders
      for (var id in self.folders) (function(folder) {
        q.push(function(cb) {
          folder.destroy(opts, cb);
        });
      })(self.folders[id]);

      q.start(function(err) {
        if (err) return cb(err);
        rimraf(fullpath, self.fs, function(err) {
          if (!err) self.notifications.emit('destroy', self);
          cb & cb(err, self);
        });
      });
    });
  }
};

FSDB.prototype.toJSON = function(cache, branch) {
  cache = cache || {};
  branch = branch || [];
  var key = this.address.join('/');
  for (var i in branch) if (branch[i] === key) return null;
  branch.push(key);
  var json = cache[key];
  if (json) return json;
  cache[key] = json = {};
  json.id = this.id;
  json.location = this.location;
  json.folders = toJSON(this.folders, {}, cache, branch);
  json.files = toJSON(this.files, {}, cache, branch);
  return json;
};

FSDB.prototype.fileAtIndex = function(index) {
  var ids = Object.keys(this.files);
  return this.files[ids[0]];
};

FSDB.prototype.folderAtIndex = function(index) {
  var ids = Object.keys(this.folders);
  return this.folders[ids[0]];
};

function toJSON(src, dest, cache, branch) {
  for (var i in src) {
    var item = src[i];
    if (item instanceof FSDB) {
      dest[i] = item.toJSON(cache, branch.slice());
    }
    else if (item.data instanceof FSDB) {
      dest[i] = { data: item.data.toJSON(cache, branch.slice()) };
    }
    else {
      dest[i] = item;
    }
  }
  return dest;
}

function normalizepath(path) {
  if (!path || path === '/') return '/';
  path = path.replace(/\/{2,}/g, '/');
  var parts = path.split('/');
  for (var i=0; i<parts.length; i++) {
    if (parts[i] === '..') {
      if (i > 0) {
        parts.splice(i-1, 1);
        i--;
      }
      parts.splice(i, 1);
      i--;
    }
  }
  path = parts.join('/');
  return path[0] === '/' ? path : '/' + path;
}

function mkroot(root) {
  return root === '/' ? '' : root;
}

function mktype(types, ext) {
  var type = types[ext];
  if (typeof type === 'string') type = types[type];
  return type;
}

function mkopts(opts) {
  var newopts = xtend({}, opts);
  delete newopts.limit;
  delete newopts.sort;
  delete newopts.reverse;
  return newopts;
}

function searchfolder(folder) {
  for (var i in folder.folders) {
    var sub = folder.folders[i];
    if (!sub.search) {
      delete folder.folders[i];
    }
    else if (sub.search === true) {
      searchfolder(sub);
    }
  }
  return folder;
}
