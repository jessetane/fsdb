var fs = require('fs');
var queue = require('queue');
var xtend = require('xtend/mutable');
var crypto = require('crypto');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

module.exports = FSDB;
FSDB.Model = FSDBModel;

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

FSDB.prototype.collect = function(collectionName, modelDefinition) {
  if (this.collections[collectionName]) {
    throw new Error('collection ' + collectionName + ' exists');
  }

  if (typeof modelDefinition !== 'function') {
    var fields = modelDefinition;
    modelDefinition = function FSDBModelExtension(props) {
      if (!(this instanceof FSDBModelExtension))
        return new FSDBModelExtension(props);
      FSDBModel.call(this, props);
    };
    inherits(modelDefinition, FSDBModel);
    modelDefinition.fields = fields;
  }

  modelDefinition.aliases = {};
  modelDefinition.database = this;
  modelDefinition.collection = collectionName;
  modelDefinition.create = function(model, cb) {
    return this.database.create(this.collection, model, cb);
  };
  modelDefinition.ls = function(cb) {
    return this.database.ls(this.collection, cb);
  };
  
  this.collections[collectionName] = modelDefinition;
  updateRelationships.call(this);

  return modelDefinition;
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
    opts = null;
  }

  var self = this;
  fs.readdir(mkroot(this.root) + '/' + collectionName, function(err, ids) {
    if (err) return cb(err);

    var models = [];
    var cache = {};
    var q = queue();

    for (var i in ids) (function(id) {
      var model = new self.collections[collectionName]({ id: id });
      models.push(model);
      q.push(model.read.bind(model, { cache: cache }));
    })(ids[i]);
    
    q.start(function(err) {
      if (err) return cb(err);
      models.collection = collectionName;
      cb(null, models);
    });
  });

  return this;
};

FSDB.prototype.read = function(collectionName, model, cb) {
  model = new this.collections[collectionName](model);
  return model.read(cb);
};

FSDB.prototype.create = 
FSDB.prototype.update = function(collectionName, model, cb) {
  model = new this.collections[collectionName](model);
  return model.update(cb);
};

FSDB.prototype.destroy = function(collectionName, model, cb) {
  model = new this.collections[collectionName](model);
  return model.destroy(cb);
};

function FSDBModel(props) {
  xtend(this, props);
}

FSDBModel.prototype.read = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var self = this;
  var cache = opts.cache || {};

  eachField.call(this, cache, function(name, field, value, cb) {
    if (typeof field === 'function') {
      var q = queue();
      var circular = {};
      circular[name] = {};
      circular[name][self.id] = self;
      self[name] = [];
      
      for (var i in value) {
        var id = value[i];
        if (cache.models &&
            cache.models[field.collection] &&
            cache.models[field.collection][id]) {
          self[name].push(cache.models[field.collection][id]);
        }
        else if (opts.circular &&
                 opts.circular[self.constructor.collection] &&
                 opts.circular[self.constructor.collection][id]) {
          self[name].push(opts.circular[self.constructor.collection][id]);
        }
        else {
          var model = new field({ id: id });
          self[name].push(model);
          cache.models = cache.models || {};
          cache.models[field.collection] = cache.models[field.collection] || {};
          cache.models[field.collection][id] = model;
          q.push(model.read.bind(model, { circular: circular, cache: cache }));
        }
      }

      q.start(cb);
    }
    else if (typeof value !== 'undefined') {
      self[name] = value;
      cb();
    }
    else {
      cb();
    }
  }, function(err) {
    if (err) return cb && cb(err);
    cb && cb(null, self);
  });

  return this;
};

FSDBModel.prototype.update = function(opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  if (!this.id) {
    create.call(this, opts, cb);
    return this;
  }

  var self = this;
  var cache = opts.cache || {};
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collection + '/' + this.id;

  eachField.call(this, cache, function(name, field, value, cb) {
    if (typeof field === 'function') {
      var oldids = {};
      var newids = {};
      var needAssociation = [];
      var needDisassociation = [];

      if (self[name] && !Array.isArray(self[name])) {
        throw Error(self.constructor.collection + ' relationship field "' + name + '" should be of type Array');
      }

      for (var i in value) oldids[value[i]] = true;
      for (var i in self[name]) newids[self[name][i].id] = true;
      for (var id in newids) {
        if (!oldids[id]) {
          needAssociation.push(id);
        }
      }
      for (var id in oldids) {
        if (!newids[id]) {
          needDisassociation.push(id);
        }
      }

      if (needAssociation.length ||
          needDisassociation.length) {
        var q = queue();
        
        if (needAssociation.length) {
          q.push(associate.bind(self, name, field.collection, needAssociation));
        }
        if (needDisassociation.length) {
          q.push(disassociate.bind(self, name, field.collection, needDisassociation));
        }

        q.start(cb);
      }
      else {
        cb();
      }
    }
    else if (self[name] !== value) {
      fs.writeFile(dir + '/' + name, self[name], cb);
    }
    else {
      cb();
    }
  }, function(err) {
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
  var cache = opts.cache || {};
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collection + '/' + this.id;

  eachField.call(this, cache, function(name, field, value, cb) {
    if (typeof field === 'function') {
      var q = queue();

      for (var i in value) {
        var id = value[i];
        var model = new field({ id: id });
        q.push(disassociate.bind(model, self.constructor.collection, [ self.id ]));
      }

      q.start(cb);
    }
    else {
      cb();
    }
  }, function(err) {
    if (err) return cb && cb(err);
    rimraf(dir, cb);
  });

  return this;
};

function updateRelationships() {
  for (var collectionName in this.collections) {
    var collection = this.collections[collectionName];
    for (var fieldName in collection.fields) {
      var field = collection.fields[fieldName];
      if (typeof field === 'function') {
        var relative = this.collections[field.collection];
        if (relative) {
          var needsReverseLookup = true;
          for (var relativeFieldName in relative.fields) {
            var relativeField = relative.fields[relativeFieldName];
            if (relativeField === collection) {
              collection.aliases[relative.collection] = relativeFieldName;
              needsReverseLookup = false;
              break;
            }
          }
          if (needsReverseLookup) {
            relative.fields = relative.fields || {};
            relative.fields[collectionName] = collection;
            relative.aliases[collectionName] = fieldName;
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

function eachField(cache, fn, cb) {
  var self = this;
  var dir = mkroot(this.constructor.database.root) + '/' + this.constructor.collection + '/' + this.id;

  fs.stat(dir, function(err) {
    if (err) return cb(err);

    var fields = self.constructor.fields;
    var q = queue();

    for (var name in fields) (function(name, field) {
      q.push(function(cb) {
        fs.readFile(dir + '/' + name, 'utf8', function(err, value) {
          if (err) {
            if (err.code === 'EISDIR') {
              return fs.readdir(dir + '/' + name, function(err, value) {
                if (err) return cb(err);
                fn(name, field, value, cb);
              });
            }
          }
          else {
            value = value.trim();
          }
          fn(name, field, value, cb);
        });
      });
    })(name, fields[name]);

    q.start(cb);
  });
}

function associate(field, collection, ids, cb) {
  updateAssociations.call(this, field, collection, ids, false, cb);
}

function disassociate(field, collection, ids, cb) {
  updateAssociations.call(this, field, collection, ids, true, cb);
}

function updateAssociations(field, collection, ids, disassociate, cb) {
  var self = this;
  var root = mkroot(this.constructor.database.root);
  var associatedModel = self.constructor.database.collections[collection];
  var alias = self.constructor.aliases[collection] || self.constructor.collection;
  var q = queue();

  for (var i in ids) (function(id) {
    var links = [
      {
        src: '../../../' + self.constructor.collection + '/' + self.id,
        dest: root + '/' + collection + '/' + id + '/' + alias + '/' + self.id,
        dir: root + '/' + collection + '/' + id + '/' + alias,
      }, {
        src: '../../../' + collection + '/' + id,
        dest: root + '/' + self.constructor.collection + '/' + self.id + '/' + field + '/' + id,
        dir: root + '/' + self.constructor.collection + '/' + self.id + '/' + field,
      }
    ];
    for (var i in links) (function(link) {
      q.push(function(cb) {
        mkdirp(link.dir, function(err) {
          if (err) return cb(err);
          fs.stat(link.dest, function(doesNotExist, stat) {
            if (doesNotExist) {
              if (!disassociate) {
                return fs.symlink(link.src, link.dest, cb);
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
    })(links[i]);
  })(ids[i]);
  
  q.start(cb);
}

function randomstring(len) {
  var hash = crypto.createHash('sha256');
  hash.update(crypto.randomBytes(256));
  return hash.digest('hex').slice(0, len || 16).toLowerCase();
}

function mkroot(root) {
  return root === '/' ? '' : root;
}
