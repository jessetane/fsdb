var fsdb = require('../../');
var queue = require('queue');
var rimraf = require('rimraf');
var crypto = require('crypto');

// db dir
var root = '/tmp/fsdb';

// get a fresh db
rimraf.sync(root);
var db = fsdb({ root: root });

// set up a bunch of collections
var authors = db.collect('authors', { name: 'text', email: 'text' });
var media = db.collect('media', { title: 'text', date: 'date', file: 'buffer', authors: authors });
var slides = db.collect('slides', { sort: 'number', media: media });
var slideshows = db.collect('slideshows', { slides: slides });
var pages = db.collect('pages', { title: 'text', description: 'text', slideshows: slideshows });

// number of models to creat per collection
var m = 1000;
var s = 500;
var ns = 50;
var ss = 100;
var p = 100;

// some stock data
var fixtures = {
  authors: [
    'eventyr',
    'slothrop',
    'mexico',
    'tantivy',
    'pirate',
  ],
  file: crypto.randomBytes(16),
};

// for relationship building
var lookups = {
  authors: [],
  media: [],
  slides: [],
  slideshows: [],
};

// go
console.log('starting complex example');
var q = queue({ concurrency: 1 })
q.push(write);
q.push(read);
q.start();

function write(cb) {
  var start = +new Date;
  var wq = queue({ concurrency: 1 });

  // create some authors
  wq.push(function(cb) {
    var q = queue();
    for (var i=0; i<fixtures.authors.length; i++) (function(author) {
      q.push(function(cb) {
        lookups.authors.push(authors.create({ name: author, email: author + '@gravity.rainbow' }, cb));
      });
    })(fixtures.authors[i]);
    q.start(cb);
  });

  // create some media
  wq.push(function(cb) {
    var q = queue();
    for (var i=0; i<m; i++) {
      q.push(function(cb) {
        var ra = lookups.authors[Math.floor(Math.random() * lookups.authors.length)];
        lookups.media.push(media.create({
          title: 'a piece of media',
          date: (new Date).toString(),
          file: fixtures.file,
          authors: [ ra ],
        }, cb));
      });
    }
    q.start(cb);
  });

  // create some slides
  wq.push(function(cb) {
    var q = queue();
    for (var i=0; i<s; i++) (function(i) {
      q.push(function(cb) {
        var rm = lookups.media[Math.floor(Math.random() * lookups.media.length)];
        lookups.slides.push(slides.create({
          sort: i,
          media: [ rm ]
        }, cb));
      });
    })(i);
    q.start(cb);
  });

  // create some slideshows
  wq.push(function(cb) {
    var q = queue();
    for (var i=0; i<ss; i++) {
      q.push(function(cb) {
        var rs = [];
        for (var n=0; n<ns; n++) {
          rs.push(lookups.slides[Math.floor(Math.random() * lookups.slides.length)]);
        }
        lookups.slideshows.push(slideshows.create({
          slides: rs
        }, cb));
      });
    }
    q.start(cb);
  });

  // create some pages
  wq.push(function(cb) {
    var q = queue();
    for (var i=0; i<p; i++) (function(i) {
      q.push(function(cb) {
        pages.create({
          title: 'the page title',
          description: 'about the page',
          slideshows: [ lookups.slideshows[i] ],
        }, cb);
      });
    })(i);
    q.start(cb);
  });

  // all done
  wq.start(function(err) {
    if (err) throw err;
    var end = +new Date;
    var elapsed = ((end - start) / 1000).toFixed(3);
    console.log(fixtures.authors.length + m + s + ss + p + ' models created in ' + elapsed + ' seconds');
    cb();
  });
}

function read(cb) {
  var start = +new Date;
  db.ls('pages', function(err, models) {
    if (err) throw err;
    var end = +new Date;
    var elapsed = ((end - start) / 1000).toFixed(3);
    console.log(models.length + ' models read in ' + elapsed + ' seconds (this # is wrong, is there an easy way to count related objects?)');
    cb();
  });
}
