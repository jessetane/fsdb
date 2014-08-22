var fsdb = require('../');
var rimraf = require('rimraf');
var thru = require('through2');

rimraf.sync(__dirname + '/db');

var db = fsdb({ root: __dirname + '/db' });
var pets = db.collect('pets');
var peeps = db.collect('peeps');

// create some things
var me = peeps.create({
  name: 'me',
  email: 'me@mi.ne'
});

var you = peeps.create({
  name: 'you',
  email: 'you@you.rs',
});

var dog = pets.create({ name: 'dog' });
var cat = pets.create({ name: 'cat' });
var bird = pets.create({ name: 'untitled' });

setTimeout(function() {

  // simple property to change
  bird.name = 'bird';

  // add a sub-collection
  var someReadStream = thru();
  someReadStream.write('not really a jpg either...');
  bird.photos = [
    { id: 'one.jpg', data: Buffer('not really a jpg!') },
    { id: 'two.jpg', data: someReadStream }, 
  ];

  // perform updates
  bird.update();
}, 100);