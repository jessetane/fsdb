var fsdb = require('../');
var rimraf = require('rimraf');
var tape = require('tape');

var root = __dirname + '/db'
rimraf.sync(root);

tape('relationship', function(t) {
  t.plan(26);

  var db = fsdb({ root: root });
  var people = db.collect('people', { name: 'txt', email: 'txt' });
  var things = db.collect('things', { label: 'txt', owners: people });
  var animals = db.collect('animals', { name: 'txt', owners: people });

  // create person
  var person = people.create({ name: 'you' }, function(err) {
    t.error(err);
    t.ok(person.id);

    // create thing
    var thing = things.create({ label: 'a thing' }, function(err) {
      t.error(err);
      t.ok(thing.id);

      // create animal
      var animal = animals.create({ name: 'cat' }, function(err) {
        t.error(err);
        t.ok(animal.id);

        // thing -> owners (people)
        thing.owners = [ person ];
        thing.update(function(err) {
          t.error(err);

          // read thing back
          thing = things({ id: thing.id });
          thing.read(function(err) {
            t.error(err);
            t.equal(thing.owners.length, 1);
            t.equal(thing.owners[0].id, person.id);

            // read person back
            person = people({ id: person.id });
            person.read(function(err) {
              t.error(err);
              t.equal(person.things.length, 1);
              t.equal(person.things[0].id, thing.id);

              // person -> animals
              t.notOk(person.animals);
              person.animals = [ animal ];
              person.update(function(err) {
                t.error(err);

                // read person back
                person = people({ id: person.id });
                person.read(function(err) {
                  t.error(err);
                  t.equal(person.animals.length, 1);
                  t.equal(person.animals[0].id, animal.id);

                  // read animal back
                  animal = animals({ id: animal.id });
                  animal.read(function(err) {
                    t.error(err);
                    t.equal(animal.owners.length, 1);
                    t.equal(animal.owners[0].id, person.id);

                    // disassociate thing -> person
                    thing.owners = [];
                    thing.update(function(err) {
                      t.error(err);

                      // read thing back
                      thing = things({ id: thing.id });
                      thing.read(function(err) {
                        t.error(err);
                        t.equal(thing.owners.length, 0);

                        // read person back
                        person = people({ id: person.id });
                        person.read(function(err) {
                          t.error(err);
                          t.equal(person.things.length, 0);
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
