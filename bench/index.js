var fsdb = require('../');
var queue = require('queue');
var rimraf = require('rimraf');

var db = fsdb({ root: '/tmp/fsdb-bench' });

// queue up benchmarks synchronously
var q = queue({ concurrency: 1 });
q.push(rimraf.bind(null, db.root));
q.push(benchSimple.bind(null, 50));
q.push(benchSimple.bind(null, 500));
q.push(benchSimple.bind(null, 5000));
q.start();

function benchSimple(cnt, cb) {

  function write(cb) {
    var x = 0;
    var start = +new Date;
    for (var i=0; i<cnt; i++) {
      var person = db.clone({ location: 'people' });
      person.files['first.txt'] = 'john';
      person.files['middle.txt'] = 'q';
      person.files['last.txt'] = 'public';
      person.create(onwrite);
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
    var people = db.clone('people').read(function(err) {
      if (err) throw err;
      var end = +new Date;
      var elapsed = ((end - start) / 1000).toFixed(3);
      console.log(Object.keys(people.folders).length + ' models read in ' + elapsed + ' seconds');
      if (q.length) console.log();
      cb();
    });
  }

  console.log('running simple benchmark with ' + cnt + ' ops');
  q.unshift(read);
  q.unshift(write);
  cb();
}
