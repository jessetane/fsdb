var fsdb = require('../');
var rimraf = require('rimraf');
var tape = require('tape');

var root = __dirname + '/db'
rimraf.sync(root);

tape('simple', function(t) {
  t.plan(17);

  var db = fsdb({ root: root });
  var people = db.collect('people', { name: 'txt', email: 'txt' });

  // create
  var person = people.create({ name: 'you' }, function(err, p) {
    t.error(err);
    t.ok(person.id);
    t.notOk(person.email);
    t.equal(person.name, 'you');
    t.equal(p, person);

    // update
    person.email = 'you@yours.com';
    person.update(function(err, p) {
      t.error(err);
      t.ok(person.id);
      t.equal(person.name, 'you');
      t.equal(person.email, 'you@yours.com');
      t.equal(p, person);

      // read
      person  = people({ id: person.id });
      person.read(function(err, p) {
        t.error(err);
        t.ok(person.id);
        t.equal(person.name, 'you');
        t.equal(person.email, 'you@yours.com');
        t.equal(p, person);

        // delete
        person.destroy(function(err) {
          t.error(err);

          // confirm
          person  = people({ id: person.id });
          person.read(function(err) {
            t.ok(err);
          });
        });
      });
    });
  });
});
