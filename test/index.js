var fs = require('fs');
var tape = require('tape');
var rimraf = require('rimraf');
var mkfsdb = require('../');

var root = '/tmp/fsdb-' + ~~(Math.random() * 1000);
var fsdb = mkfsdb({ root: root });
var db = null;
var people = null;
var me = null;
var you = null;
var everyone = null;
var auto = null;

tape('create', function(t) {
  t.plan(2);

  db = fsdb().create(function(err) {
    t.error(err);
    t.equal(db.id, '');
  });
});

tape('create collection', function(t) {
  t.plan(2);

  people = fsdb('people').create(function(err) {
    t.error(err);
    t.equal(people.id, 'people');
  });
});

tape('create model', function(t) {
  t.plan(2);

  var tmp = fsdb('people/you');
  tmp.files['name.txt'] = { data: 'you' };
  tmp.create(function(err) {
    t.error(err);
    t.equal(tmp.id, 'you');
  });
});

tape('create model with auto generated id', function(t) {
  t.plan(1);

  auto = fsdb({ location: 'people' });
  auto.files['name.txt'] = { data: 'auto' };
  auto.create(function(err) {
    t.error(err);
  });
});

tape('read model', function(t) {
  t.plan(3);

  you = fsdb('people/you');
  you.read(function(err) {
    t.error(err);
    t.equal(you.files['name.txt'].data, 'you');
    t.equal(you.files['email.txt'], undefined);
  });
});

tape('update model', function(t) {
  t.plan(3);

  you.files['name.txt'] = { data: 'you?' };
  you.files['email.txt'] = { data: 'you@yours.com' };
  you.update(function(err) {
    t.error(err);
    t.equal(you.files['name.txt'].data, 'you?');
    t.equal(you.files['email.txt'].data, 'you@yours.com');
  });
});

tape('destroy model', function(t) {
  t.plan(4);

  you.destroy(function(err) {
    t.error(err);
    fs.readdir(root + '/people', function(err, files) {
      t.error(err);
      t.equal(files.length, 1);
      t.equal(files[0], auto.id);
    });
  });
});
