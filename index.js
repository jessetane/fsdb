var fs = require('fs');
var crypto = require('crypto');

var inherits = require('inherits');
var xtend = require('xtend/mutable');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var queue = require('queue');

FSDB.Model = FSDBModel;
FSDB.formats = {
  'txt': 'utf8',
  'html': 'uf8',
  'md': 'utf8',
};

module.exports = FSDB;

function FSDB(opts) {
  if (!(this instanceof FSDB))
    return new FSDB(opts);

  if (opts.root === undefined) {
    throw new Error('missing root');
  }

  this.root = opts.root;
  this.collections = {};
  this.idsize = 8;

  for (var name in opts.collections) {
    this.collect(name, opts.collections[name]);
  }
}

FSDB.prototype.collect = function(collectionName, Model) {
  if (this.collections[collectionName]) {
    throw new Error('collection ' + collectionName + ' exists');
  }

  if (typeof Model !== 'function') {
    var fields = Model;
    Model = function FSDBModelExtension(props) {
      if (!(this instanceof FSDBModelExtension))
        return new FSDBModelExtension(props);
      FSDBModel.call(this, props);
    };
    inherits(Model, FSDBModel);
    Model.fields = fields || {};
  }

  Model.aliases = {};
  Model.database = this;
  Model.collection = collectionName;
  Model.create = function(model, cb) {
    return this.database.create(this.collection, model, cb);
  };
  Model.ls = function(cb) {
    return this.database.ls(this.collection, cb);
  };
  
  this.collections[collectionName] = Model;
  updateAssociatedCollections.call(this);

  return Model;
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
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var self = this;
  var Model = self.collections[collectionName];

  fs.readdir(mkroot(this.root) + '/' + collectionName, function(err, ids) {
    if (err) return cb(err);

    var models = [];
    var q = queue();
    opts.cache = {};

    for (var i in ids) (function(id) {

      // ignore hidden files
      if (/^\./.test(id)) return;

      var model = new Model({ id: id });
      models.push(model);
      q.push(model.read.bind(model, opts));
    })(ids[i]);
    
    q.start(function(err) {
      if (err) return cb(err);

      // ordering
      var order = opts.order;
      if (order) {
        models.sort(function(a, b) {
          if (a[order] === b[order]) return 0;
          return a[order] > b[order] ? 1 : -1;
        });
      }

      // limiting / paging
      var limit = opts.limit;
      var page = opts.page || 0;
      var pos = opts.position || page * limit;
      if (limit) {
        models = models.slice(pos, pos + limit);
      }

      models.collection = collectionName;
      cb(null, models);
    });
  });

  return this;
};

FSDB.prototype.read = function(collectionName, model, opts, cb) {
  model = new this.collections[collectionName](model);
  return model.read(opts, cb);
};

FSDB.prototype.create = 
FSDB.prototype.update = function(collectionName, model, opts, cb) {
  model = new this.collections[collectionName](model);
  return model.update(opts, cb);
};

FSDB.prototype.destroy = function(collectionName, model, opts, cb) {
  model = new this.collections[collectionName](model);
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
  var collection = this.constructor.collection;
  var dir = mkroot(this.constructor.database.root) + '/' + collection + '/' + this.id;
  var fields = this.constructor.fields;
  var q = queue();

  opts = opts || {};
  opts.cache = opts.cache || {};
  opts.cache.models = opts.cache.models || {};
  opts.cache.models[collection] = opts.cache.models[collection] || {};
  opts.cache.models[collection][this.id] = this;

  fs.readdir(dir, function(err, files) {
    if (err) return cb && cb(err);

    files.forEach(function(file) {
      if (/^\./.test(file)) return; // skip hidden files

      var name = file.replace(/\.[^.]*/, '');
      var type = fields[name] || file.replace(/.*\./, ''); // use built in type or extension

      if (type === '_ignore_' || 
          type === '_ignore_read_') return;

      q.push(function(cb) {

        // association
        if (typeof type === 'function') {
          fs.readdir(dir + '/' + file, function(err, ids) {
            if (err) return cb(err);

            var collection = type.collection;
            var cache = opts.cache.models[collection] = opts.cache.models[collection] || {};
            self[name] = [];

            ids.forEach(function(id) {
              if (cache[id]) {
                self[name].push(cache[id]);
              }
              else {
                var model = new type({ id: id });
                self[name].push(model);
                cache.models = cache.models || {};
                cache.models[collection] = cache.models[collection] || {};
                cache.models[collection][id] = model;
                q.push(model.read.bind(model, opts));
              }
            });
            cb();
          });
        }

        // known format
        else if (FSDB.formats[type]) {
          fs.readFile(dir + '/' + file, FSDB.formats[type], function(err, data) {
            if (err) return cb(err);
            self[name] = data;
            cb();
          });
        }

        // needs stat
        else {
          fs.stat(dir + '/' + file, function(err, stat) {
            if (err) return cb(err);

            // directory
            if (stat.isDirectory()) {
              fs.readdir(dir + '/' + file, function(err, ids) {
                if (err) return cb(err);
                if (ids.length) self[name] = [];
                ids.forEach(function(id) {
                  if (/^\./.test(id)) return; // skip hidden files
                  self[name].push(id);
                });
                cb();
              });
            }

            // some binary file
            else {
              self[name] = file;
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
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collection + '/' + this.id;
  var fields = this.constructor.fields;
  var q = queue();

  for (var name in this) (function(name, value) {
    var type = fields[name];
    if (typeof value === 'function') return;
    if (typeof value === 'object') {
      var tmp = [];
      for (var i in value) {
        tmp.push(value[i]);
      }
      value = tmp;
    }

    if (Array.isArray(value)) {
      q.push(function(cb) {
        fs.readdir(dir + '/' + name, function(err, ids) {
          if (err && err.code !== 'ENOENT') return cb(err);

          ids = ids || [];
          var oldids = {};
          var newids = {};
          var needCreate = [];
          var needDelete = [];

          for (var i in ids) {
            oldids[ids[i]] = true;
          }

          // update associations
          if (typeof type === 'function') {
            for (var i in value) newids[value[i].id] = true;
            for (var id in newids) {
              if (!oldids[id]) {
                needCreate.push(id);
              }
            }
            for (var id in oldids) {
              if (!newids[id]) {
                needDelete.push(id);
              }
            }

            if (needCreate.length) {
              associate.call(self, q, name, type.collection, needCreate);
            }
            if (needDelete.length) {
              disassociate.call(self, q, name, type.collection, needDelete);
            }
          }

          // assume dir
          else {
            for (var i in value) {
              var id = value[i];
              if (id) {
                if (typeof id === 'object' && id.id && id.stream) {
                  needCreate.push(id);
                }
              }
              else if (oldids[id]) {
                needDelete.push(id);
              }
            }

            if (needCreate.length) {
              q.push(function(cb) {
                mkdirp(dir + '/' + name, function(err) {
                  if (err) return cb(err);
                  for (var i in needCreate) {
                    var id = needCreate[i].id;
                    var stream = needCreate[i].stream;
                    stream.pipe(fs.createWriteStream(dir + '/' + name + '/' + id));
                  }
                  cb();
                });
              });
            }

            if (needDelete.length) {
              for (var i in needDelete) {
                q.push(fs.unlink.bind(null, dir + '/' + name + '/' + needDelete[i]));
              }
            }
          }

          cb();
        });
      });
    }

    // write files
    else if (value) {
      type = type || 'txt';
      if (value.readable) {
        value.pipe(fs.createWriteStream(dir + '/' + name + '.' + type));
      }
      else {
        q.push(function(cb) {
          fs.writeFile(dir + '/' + name + '.' + type, value, FSDB.formats[type] || 'utf8', cb);
        });
      }
    }

    // delete files
    else {
      q.push(fs.unlink.bind(null, dir + '/' + name + '.' + type));
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
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collection + '/' + this.id;
  var fields = this.constructor.fields;
  var q = queue();

  for (var name in fields) (function(name, type) {
    if (typeof type === 'function') {
      q.push(function(cb) {
        fs.readdir(dir + '/' + name, function(err, ids) {
          if (err) return cb(err);
          for (var i in ids) {
            var id = ids[i];
            var model = new type({ id: id });
            disassociate.call(model, q, self.constructor.collection, [ self.id ]);
          }
          cb();
        });
      });
    }
  })(name, fields[name]);

  q.start(function(err) {
    if (err) return cb(err);
    rimraf(dir, cb);
  });

  return this;
};

function updateAssociatedCollections() {
  for (var collectionName in this.collections) {
    var collection = this.collections[collectionName];
    for (var fieldName in collection.fields) {
      var field = collection.fields[fieldName];
      if (typeof field === 'function') {
        var associated = this.collections[field.collection];
        if (associated) {
          var needsReverseLookup = true;
          for (var associatedFieldName in associated.fields) {
            var associatedField = associated.fields[associatedFieldName];
            if (associatedField === collection) {
              collection.aliases[associated.collection] = associatedFieldName;
              needsReverseLookup = false;
              break;
            }
          }
          if (needsReverseLookup) {
            associated.fields = associated.fields || {};
            associated.fields[collectionName] = collection;
            associated.aliases[collectionName] = fieldName;
          }
        }
      }
    }
  }
}

function create(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var self = this;
  var id = randomstring(this.constructor.database.idsize);
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collection + '/' + id;

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

function associate(q, field, collection, ids, cb) {
  updateAssociations.call(this, q, field, collection, ids, false);
}

function disassociate(q, field, collection, ids, cb) {
  updateAssociations.call(this, q, field, collection, ids, true);
}

function updateAssociations(q, field, collection, ids, disassociate) {
  var self = this;
  var root = mkroot(this.constructor.database.root);
  var associatedModel = self.constructor.database.collections[collection];
  var alias = self.constructor.aliases[collection] || self.constructor.collection;

  for (var i in ids) (function(id) {
    [
      {
        src: '../../../' + self.constructor.collection + '/' + self.id,
        dest: root + '/' + collection + '/' + id + '/' + alias + '/' + self.id,
        dir: root + '/' + collection + '/' + id + '/' + alias,
      }, {
        src: '../../../' + collection + '/' + id,
        dest: root + '/' + self.constructor.collection + '/' + self.id + '/' + field + '/' + id,
        dir: root + '/' + self.constructor.collection + '/' + self.id + '/' + field,
      }
    ].forEach(function(link) {
      q.push(function(cb) {
        fs.stat(link.dest, function(doesNotExist, stat) {
          if (doesNotExist) {
            if (!disassociate) {
              return mkdirp(link.dir, function(err) {
                if (err) return cb(err);
                fs.symlink(link.src, link.dest, cb);
              });
            }
          }
          else {
            if (disassociate) {
              return fs.unlink(link.dest, cb);
            }
          }
          cb();
        });
      });
    });
  })(ids[i]);
}

function randomstring(len) {
  var hash = crypto.createHash('sha256');
  hash.update(crypto.randomBytes(256));
  return hash.digest('hex').slice(0, len || 16).toLowerCase();
}

function mkroot(root) {
  return root === '/' ? '' : root;
}
