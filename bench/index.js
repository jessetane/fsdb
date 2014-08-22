var fsdb = require('../');
var queue = require('queue');
var rimraf = require('rimraf');

// working dir
var root = '/tmp/fsdb';

// queue up benchmarks synchronously
var q = queue({ concurrency: 1 });
q.push(benchSimple.bind(null, 50));
q.push(benchSimple.bind(null, 500));
q.push(benchSimple.bind(null, 5000));
q.start();

function benchSimple(cnt, cb) {
  rimraf.sync(root);
  var db = fsdb({ root: root });
  var people = db.collect('people');

  function write(cb) {
    var x = 0;
    var start = +new Date;
    for (var i=0; i<cnt; i++) {
      people.create({ name: 'john', middle: 'q', last: 'public' }, onwrite)
    }

    function onwrite(err) {
      if (err) throw err;
      if (++x === cnt) {
        var end = +new Date;
        var elapsed = ((end - start) / 1000).toFixed(3);
        console.log(cnt + ' models created in ' + elapsed + ' seconds');
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
      console.log(cnt + ' models read in ' + elapsed + ' seconds');
      if (q.length) console.log();
      cb();
    });
  }

  console.log('running simple benchmark with ' + cnt + ' ops');
  q.unshift(read);
  q.unshift(write);
  cb();
}
