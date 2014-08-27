var fs = require('fs');
var crypto = require('crypto');

var inherits = require('inherits');
var xtend = require('xtend/mutable');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var queue = require('queue');

FSDB.Model = FSDBModel;

module.exports = FSDB;

function FSDB(opts) {
  if (!(this instanceof FSDB))
    return new FSDB(opts);

  opts = opts || {};

  if (opts.root === undefined) {
    throw new Error('missing root');
  }

  this.fields = {};
  this.collections = {};
  this.idsize = 8;
  this.defaultType = 'txt';
  this.types = {
    'txt': require('./lib/fsdb-txt'),
    '_directory': require('./lib/fsdb-directory'),
    '_hidden': require('./lib/fsdb-hidden'),
  };

  xtend(this, opts);
}

FSDB.prototype.collect = function(collectionName, fields) {
  if (this.collections[collectionName]) {
    throw new Error('collection ' + collectionName + ' exists');
  }

  var Model = function FSDBModelExtension(props) {
    if (!(this instanceof FSDBModelExtension))
      return new FSDBModelExtension(props);
    FSDBModel.call(this, props);
  };
  inherits(Model, FSDBModel);

  Model.fields = fields || {};
  Model.database = this;
  Model.collectionName = collectionName;

  Model.create = function(model, cb) {
    return this.database.create(this.collectionName, model, cb);
  };
  Model.ls = function(opts, cb) {
    return this.database.ls(this.collectionName, opts, cb);
  };
  
  return this.collections[collectionName] = Model;
};

FSDB.prototype.discard = function(collectionName) {
  this.ls(collectionName, function(err, models) {
    if (err) return cb(err);

    var self = this;
    var q = queue();

    for (var i in models) (function(model) {
      q.push(function(cb) {
        model.destroy(cb);
      });
    })(models[i]);
    
    q.start(function(err) {
      if (err) return cb(err);
      delete self.collections[collectionName];
    });
  });

  return this;
};

FSDB.prototype.ls = function(collectionName, opts, cb) {
  if (!collectionName) collectionName = '';
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var self = this;
  var Model = collectionName ? (self.collections[collectionName] || this.collect(collectionName)) : null;

  fs.readdir(mkroot(this.root) + '/' + collectionName, function(err, ids) {
    if (err) return cb(err);

    var models = [];
    var q = queue();
    opts.cache = {};

    for (var i in ids) (function(id) {

      // hidden files can never be considered ids
      if (/^\./.test(id)) return;

      if (Model) {
        var model = new Model({ id: id });
        models.push(model);
        q.push(model.read.bind(model, opts));
      }
      else {
        models.push(id);
      }
    })(ids[i]);
    
    q.start(function(err) {
      if (err) return cb(err);

      var order = opts.order;
      if (Model && order) {
        models.sort(function(a, b) {
          if (a[order] === b[order]) return 0;
          if (a[order] === undefined) a[order] = Infinity;
          if (b[order] === undefined) b[order] = Infinity;
          return a[order] > b[order] ? 1 : -1;
        });
      }

      var limit = opts.limit;
      var page = opts.page || 0;
      var pos = opts.position || page * limit;
      if (limit) {
        models = models.slice(pos, pos + limit);
      }

      cb(null, models);
    });
  });

  return this;
};

FSDB.prototype.read = function(collectionName, model, opts, cb) {
  var Model = this.collections[collectionName] || this.collect(collectionName);
  model = new Model(model);
  return model.read(opts, cb);
};

FSDB.prototype.create = 
FSDB.prototype.update = function(collectionName, model, opts, cb) {
  var Model = this.collections[collectionName] || this.collect(collectionName);
  model = new Model(model);
  return model.update(opts, cb);
};

FSDB.prototype.destroy = function(collectionName, model, opts, cb) {
  var Model = this.collections[collectionName] || this.collect(collectionName);
  model = new Model(model);
  return model.destroy(opts, cb);
};

function FSDBModel(props) {
  xtend(this, props);
}

FSDBModel.prototype.read = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = null;
  }

  var self = this;
  var db = this.constructor.database;
  var collectionName = this.constructor.collectionName;
  var dir = mkroot(db.root) + '/' + collectionName + '/' + this.id;
  var fields = this.constructor.fields;
  var q = queue();

  opts = opts || {};
  opts.cache = opts.cache || {};
  opts.cache.models = opts.cache.models || {};
  opts.cache.models[collectionName] = opts.cache.models[collectionName] || {};
  opts.cache.models[collectionName][this.id] = this;

  fs.readdir(dir, function(err, files) {
    if (err) {
      if (err.code === 'ENOTDIR') {
        self = dir.replace(/.*\//);
        files = [];
      }
      else {
        return cb && cb(err);
      }
    }

    files.forEach(function(file) {
      var name = file.replace(/([.]*[^.]+)\..*/, '$1');
      var ext =  file.replace(/[.]*[^.]+\.(.*)/, '$1');
      var type = fields[name];

      if (!type && /^\./.test(name)) {
        var t = db.types['_hidden'];
        if (t) type = t;
      }

      if (!type && ext && ext !== name) {
        var t = db.types[ext];
        if (t) type = t;
      }

      q.push(function(cb) {
        var filename = dir + '/' + name + (ext && ext !== name ? '.' + ext : '');
        if (type) {
          type.read.call(self, filename, name, opts, cb);
        }
        else {
          fs.stat(filename, function(err, stat) {
            if (err) return cb(err);

            if (stat.isDirectory() && db.types['_directory']) {
              db.types['_directory'].read.call(self, filename, name, opts, cb);
            }
            else {
              //self[name] = fs.createReadStream.bind(null, filename);
              cb();
            }
          });
        }
      });
    });

    q.start(function(err) {
      if (err) return cb && cb(err);
      cb && cb(null, self);
    });
  });

  return this;
};

FSDBModel.prototype.update = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = null;
  }
  opts = opts || {};

  if (!this.id) {
    create.call(this, opts, cb);
    return this;
  }

  var self = this;
  var db = this.constructor.database;
  var dir = mkroot(db.root) + '/' + this.constructor.collectionName + '/' + this.id;
  var fields = this.constructor.fields;
  var q = queue();

  for (var name in this) (function(name, value) {
    if (name === 'id' || typeof value === 'function') return;

    var ext = '';
    var type = fields[name];

    if (!type && Array.isArray(value)) {
      var t = db.types['_directory'];
      if (t) type = t;
    }

    if (!type) {
      type = db.defaultType;
    }

    if (typeof type === 'string') {
      var t = db.types[type];
      if (!t) return cb(new Error('unrecognized field type "' + type + '"'));
      if (!/^_/.test(type)) ext = type;
      type = t;
    }

    if (type) {
      ext = (ext ? '.' + ext : '');
      q.push(function(cb) {
        type.update.call(self, dir + '/' + name + ext, name, opts, cb);
      });
    }
  })(name, this[name]);

  q.start(function(err) {
    if (err) return cb && cb(err);
    cb && cb(null, self);
  });

  return this;
};

FSDBModel.prototype.destroy = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var self = this;
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collectionName + '/' + this.id;
  var fields = this.constructor.fields;
  var q = queue();

  for (var name in fields) (function(name, type) {
    if (type.destroy) {
      q.push(function(cb) {
        type.destroy.call(self, name, type.extension, dir, opts, cb);
      });
    }
  })(name, fields[name]);

  q.start(function(err) {
    if (err) return cb(err);
    rimraf(dir, cb);
  });

  return this;
};

function create(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var self = this;
  var db = this.constructor.database;
  var id = randomstring(this.constructor.database.idsize);
  var dir = mkroot(db.root) + '/' + this.constructor.collectionName + '/' + id;

  fs.exists(dir, function(exists) {
    if (exists) {
      return create.call(self, opts, cb);
    }

    mkdirp(dir, function(err) {
      if (err) return cb(err);

      self.id = id;
      self.update(opts, cb);
    });
  });
}

function randomstring(len) {
  var hash = crypto.createHash('sha256');
  hash.update(crypto.randomBytes(256));
  return hash.digest('hex').slice(0, len || 16).toLowerCase();
}

function mkroot(root) {
  return root === '/' ? '' : root;
}
