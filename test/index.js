var fs = require('fs');
var tape = require('tape');
var rimraf = require('rimraf');
var fsdb = require('../');

var root = '/tmp/fsdb';
var db, people, me, you, everyone, auto;

tape('fresh db', function(t) {
  t.plan(1);
  rimraf(root, function(err) {
    t.error(err);
  });
});

tape('create', function(t) {
  t.plan(2);

  db = fsdb({ root: root }).create(function(err) {
    t.error(err);
    t.equal(db.id, '');
  });
});

tape('create collection', function(t) {
  t.plan(2);

  people = db.clone('people').create(function(err) {
    t.error(err);
    t.equal(people.id, 'people');
  });
});

tape('create model', function(t) {
  t.plan(2);

  var tmp = db.clone('people/you');
  tmp.files['name.txt'] = { data: 'you' };
  tmp.create(function(err) {
    t.error(err);
    t.equal(tmp.id, 'you');
  });
});

tape('create model with auto generated id', function(t) {
  t.plan(1);

  auto = db.clone({ location: 'people' });
  auto.files['name.txt'] = { data: 'auto' };
  auto.create(function(err) {
    t.error(err);
  });
});

tape('read model', function(t) {
  t.plan(3);

  you = db.clone('people/you');
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
