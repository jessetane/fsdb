var tape = require('tape');
var splitpath = require('./');

tape('undefined', function(t) {
  t.plan(1);
  t.deepEqual(splitpath(), [ '/', '' ]);
});

tape('null', function(t) {
  t.plan(1);
  t.deepEqual(splitpath(null), [ '/', '' ]);
});

tape('empty string', function(t) {
  t.plan(1);
  t.deepEqual(splitpath(''), [ '/', '' ]);
});

tape('root', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('/'), [ '/', '' ]);
});

tape('with root', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('/a'), [ '/', 'a' ]);
});

tape('without root', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('a'), [ '/', 'a' ]);
});

tape('with root and trailing slash', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('/a/'), [ '/a', '' ]);
});

tape('without root and trailing slash', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('a/'), [ '/a', '' ]);
});

tape('multiple components with root', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('/a/b/c/d'), [ '/a/b/c', 'd' ]);
});

tape('multiple components without root', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('a/b/c/d'), [ '/a/b/c', 'd' ]);
});

tape('multiple components with root and trailing slash', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('/a/b/c/d/'), [ '/a/b/c/d', '' ]);
});

tape('multiple components without root and trailing slash', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('a/b/c/d/'), [ '/a/b/c/d', '' ]);
});

tape('duplicate slashes', function(t) {
  t.plan(1);
  t.deepEqual(splitpath('////a///b//c/d'), [ '/a/b/c', 'd' ]);
});
