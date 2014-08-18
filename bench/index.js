var fsdb = require('../');
var queue = require('queue');
var rimraf = require('rimraf');

// working dir
var root = '/tmp/fsdb';

// queue up benchmarks synchronously
var q = queue({ concurrency: 1 });
q.push(benchSimple.bind(null, 25));
q.push(benchSimple.bind(null, 50));
q.push(benchSimple.bind(null, 500));
q.push(benchSimple.bind(null, 5000));
q.start();

function benchSimple(cnt, cb) {
  rimraf.sync(root);
  var db = fsdb({ root: root });

  var p = cnt;
  var t = cnt;
  var m = p + t;

  var people = db.collect('people', { name: 'txt' });
  var things = db.collect('things', { label: 'txt', people: people });
  var lookup = { people: [], things: [] };

  function write(cb) {
    var x = 0;
    var start = +new Date;
    for (var i=0; i<p; i++) {
      lookup.people.push(
        people.create({ name: 'john q. public' }, onwrite)
      );
      lookup.things.push(
        things.create({ label: 'a thing' }, onwrite)
      );
    }

    function onwrite(err) {
      if (err) throw err;
      if (++x === m) {
        var end = +new Date;
        var elapsed = ((end - start) / 1000).toFixed(3);
        console.log(m + ' models created in ' + elapsed + ' seconds');
        cb();
      }
    }
  }

  function relate(cb) {
    var x = 0;
    var start = +new Date;
    for (var i=0; i<p; i++) {
      var person = lookup.people[i];
      var thing = lookup.things[i];
      thing.people = [ person ];
      thing.update(onrelate);
    }

    function onrelate(err) {
      if (err) throw err;
      if (++x === p) {
        var end = +new Date;
        var elapsed = ((end - start) / 1000).toFixed(3);
        console.log(m + ' relationships created in ' + elapsed + ' seconds');
        cb();
      }
    }
  }

  function read(cb) {
    var start = +new Date;
    people.ls(function(err, models) {
      if (err) throw err;
      var end = +new Date;
      var elapsed = ((end - start) / 1000).toFixed(3);
      console.log(m + ' models read in ' + elapsed + ' seconds');
      if (q.length) console.log();
      cb();
    });
  }

  console.log('running simple benchmark with ' + cnt * 2 + ' ops');
  q.unshift(read);
  q.unshift(relate);
  q.unshift(write);
  cb();
}
