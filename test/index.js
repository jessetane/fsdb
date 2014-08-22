var fs = require('fs');
var fsdb = require('../');
var tape = require('tape');
var rimraf = require('rimraf');
var thru = require('through2');
var queue = require('queue');

var root = __dirname + '/db'
rimraf.sync(root);

var db = fsdb({ root: root });
var people = db.collect('people');
var you = null;
var me = null;
var everyone = null;

tape('create', function(t) {
  t.plan(5);

  you = people.create({ name: 'you' }, function(err, person) {
    t.error(err);
    t.equal(you, person);
    t.ok(you.id);
    t.equal(you.name, 'you');
    t.notOk(you.email);

    fs.mkdirSync(__dirname + '/db/pre-existing');
    fs.mkdirSync(__dirname + '/db/pre-existing/thing');
    fs.writeFileSync(__dirname + '/db/pre-existing/thing/name.txt', 'some pre-existing thing');
  });
});

tape('update', function(t) {
  t.plan(6);

  you.email = 'you@yours.com';
  you.sort = '0';
  you.update(function(err, person) {
    t.error(err);
    t.equal(you, person);
    t.ok(you.id);
    t.equal(you.name, 'you');
    t.equal(you.email, 'you@yours.com');
    t.equal(you.sort, '0');
  });
});

tape('read', function(t) {
  t.plan(5);

  you = people({ id: you.id });
  you.read(function(err, person) {
    t.error(err);
    t.equal(you, person);
    t.ok(you.id);
    t.equal(you.name, 'you');
    t.equal(you.email, 'you@yours.com');
  });
});

tape('hidden files', function(t) {
  t.plan(4);

  fs.writeFileSync(__dirname + '/db/people/' + you.id + '/.dotfile.txt', 'this is a hidden file');
  var hiddenType = db.types['_hidden'];
  delete db.types['_hidden'];

  you = people({ id: you.id });
  you.read(function(err) {
    t.error(err);
    t.equal(you['.dotfile'], 'this is a hidden file');
    
    db.types['_hidden'] = hiddenType;
    you = people({ id: you.id });
    you.read(function(err) {
      t.error(err);
      t.equal(you['.dotfile'], undefined);
    });
  });
});

tape('ls', function(t) {
  t.plan(5);

  fs.mkdirSync(__dirname + '/db/people/.hidden');
  fs.writeFileSync(__dirname + '/db/people/.hidden/email.txt', 'everyone we know');

  me = people.create({ name: 'me', email: 'me@mine.com', sort: '1' }, function(err) {
    t.error(err);

    people.ls(function(err, models) {
      t.error(err);
      t.equal(models.length, 2);
      t.ok(models[0].name);
      t.ok(models[1].name);
    });
  });
});

tape('ls pre-existing', function(t) {
  t.plan(3);
  
  db.ls('pre-existing', function(err, models) {
    t.error(err);
    t.equal(models.length, 1);
    t.equal(models[0].name, 'some pre-existing thing');
  });
});

tape('order', function(t) {
  t.plan(6);

  people.create({ name: 'everyone we know', email: 'everyone@we.know.com', sort: '2' }, function(err) {
    t.error(err);
    
    people.ls({ order: 'sort' }, function(err, models) {
      t.error(err);
      t.equal(models.length, 3);
      t.equal(models[0].name, 'you');
      t.equal(models[1].name, 'me');
      t.equal(models[2].name, 'everyone we know');
    });
  });
});

tape('limit', function(t) {
  t.plan(3);
  people.ls({ order: 'sort', limit: 1 }, function(err, models) {
    t.error(err);
    t.equal(models.length, 1);
    t.equal(models[0].name, 'you');
  });
});

tape('page', function(t) {
  t.plan(3);
  people.ls({ order: 'sort', limit: 1, page: 2 }, function(err, models) {
    t.error(err);
    t.equal(models.length, 1);
    t.equal(models[0].name, 'everyone we know');
  });
});

tape('position', function(t) {
  t.plan(3);
  people.ls({ order: 'sort', limit: 2, position: 1 }, function(err, models) {
    t.error(err);
    t.equal(models.length, 2);
    t.equal(models[0].name, 'me');
  });
});

tape('directory read', function(t) {
  t.plan(5);
  
  fs.mkdirSync(__dirname + '/db/people/' + you.id + '/documents');
  fs.writeFileSync(__dirname + '/db/people/' + you.id + '/documents/one', '1');
  fs.writeFileSync(__dirname + '/db/people/' + you.id + '/documents/two', '2');
  fs.writeFileSync(__dirname + '/db/people/' + you.id + '/documents/three', '3');

  you.read(function(err) {
    t.error(err);
    you.documents.sort();
    t.equal(you.documents.length, 3);
    t.equal(you.documents[0], 'one');
    t.equal(you.documents[1], 'three');
    t.equal(you.documents[2], 'two');
  });
});

tape('directory updates (strings/buffers)', function(t) {
  t.plan(4);

  you.documents = [
    { id: 'one', data: 'uno' },
    { id: 'two', data: Buffer('dos') },
    { id: 'three', data: 'tres' },
  ];

  you.update(function(err) {
    t.error(err);

    var one = fs.readFileSync(__dirname + '/db/people/' + you.id + '/documents/one', 'utf8');
    var two = fs.readFileSync(__dirname + '/db/people/' + you.id + '/documents/two', 'utf8');
    var three = fs.readFileSync(__dirname + '/db/people/' + you.id + '/documents/three', 'utf8');

    t.equal(one, 'uno');
    t.equal(two, 'dos');
    t.equal(three, 'tres');
  });
});

tape('directory updates (streams)', function(t) {
  t.plan(4);

  var s1 = thru();
  var s2 = thru();
  var s3 = thru();
  s1.write('eins');
  s2.write('zwei');
  s3.write('drei');

  you.documents = [
    { id: 'one', data: s1 },
    { id: 'two', data: s2 },
    { id: 'three', data: s3 },
  ];

  you.update(function(err) {
    t.error(err);

    setTimeout(function() {
      var one = fs.readFileSync(__dirname + '/db/people/' + you.id + '/documents/one', 'utf8');
      var two = fs.readFileSync(__dirname + '/db/people/' + you.id + '/documents/two', 'utf8');
      var three = fs.readFileSync(__dirname + '/db/people/' + you.id + '/documents/three', 'utf8');
      t.equal(one, 'eins');
      t.equal(two, 'zwei');
      t.equal(three, 'drei');

    // is there a better way to know for sure when these files have been completely written?
    }, 100);
  });
});

tape('directory updates (bad type)', function(t) {
  t.plan(1);

  you.documents = [
    { id: 'one', data: function() {} },
    { id: 'two' },
    { id: 'three' },
  ];

  you.update(function(err) {
    t.ok(/"one" must be a/.test(err.message));
  });
});

tape('directory deletes', function(t) {
  t.plan(5);
  
  you.documents = [ 'one', { id: 'three' } ];
  you.update(function(err) {
    t.error(err);
    
    you = people({ id: you.id });
    you.read(function(err) {
      t.error(err);
      t.equal(you.documents.length, 2);
      t.equal(you.documents[0], 'one');
      t.equal(you.documents[1], 'three');
    });
  });
});

tape('destroy', function(t) {
  t.plan(5);

  me.destroy(function(err) {
    t.error(err);

    people.ls({ order: 'sort' }, function(err, models) {
      t.error(err);
      t.equal(models.length, 2);
      t.equal(models[0].name, 'you');
      t.equal(models[1].name, 'everyone we know');
    });
  });
});
