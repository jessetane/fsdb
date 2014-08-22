# fsdb
Human-friendly databases made with files and directories.

## Why
A database backed by filesystem primitives is not particularly efficient and has no native sorting capabilities; it is generally "fast enough" for small datasets though and rather convenient as you can browse and edit from your shell or explorer gui!

## How

Make a database
``` javascript
var fsdb = require('fsdb');
var db = fsdb({ root: __dirname + '/db' });
```

Define some collections
``` javascript
var pets = db.collect('pets');
var peeps = db.collect('peeps');
```

Make some stuff
``` javascript
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
```

Make updates
``` javascript
bird.name = 'bird';
bird.update();
```

Add sub-collections
``` javascript
bird.photos = [
  { id: 'one.jpg', data: someReadStream }, 
  { id: 'two.jpg', Buffer('not really a jpg!') }
];
bird.update();
```

Enjoy your database
``` bash
$ tree db
db/
├── peeps
│   ├── 302920c4
│   │   ├── email.txt
│   │   └── name.txt
│   └── ecc19d3e
│       ├── email.txt
│       └── name.txt
└── pets
    ├── 076b5241
    │   └── name.txt
    ├── 9b554948
    │   └── name.txt
    └── ab234997
        ├── name.txt
        └── photos
            ├── one.jpg
            └── two.jpg

8 directories, 9 files
```

## Fields
* Each field is a separate file
* There are three built-in types: text files, hidden files and directories
* Field types are implemented as modular plugins, see the [built-ins](https://github.com/jessetane/fsdb/tree/master/lib) for examples
* Register custom field types by name: `db.collections.peeps.fields.photo = require('some-fsdb-binary-file-plugin')`
* Register custom field types by extension: `db.types['tar.gz'] = require('some-fsdb-tar-plugin')`

## Tests
The tests are written with [tape](https://github.com/substack/tape). You can browse them [here](https://github.com/jessetane/fsdb/tree/master/test), and run them with:
``` bash
$ npm test
```

## Performance
Performance is basically terrible, but only compared to more traditional databases - unless you're operating at a pretty significant scale, you will probably experience quite reasonable speeds (these were run on an macbook pro with an ssd, ymmv):
``` bash
$ node bench
running simple benchmark with 50 ops
50 models created in 0.029 seconds
50 models read in 0.015 seconds

running simple benchmark with 500 ops
500 models created in 0.199 seconds
500 models read in 0.117 seconds

running simple benchmark with 5000 ops
5000 models created in 2.505 seconds
5000 models read in 0.981 seconds
```

## Releases
An abbreviated changelog and release tarballs below:
* [2.0.x](https://github.com/jessetane/fsdb/releases/tag/2.0.1)
 * August 21 2014, major redesign to support modular field types
* [1.0.0](https://github.com/jessetane/fsdb/releases/tag/1.0.0)
 * August 10 2014, an experimental prototype

## License
Copyright © 2014 Jesse Tane <jesse.tane@gmail.com>

This work is free. You can redistribute it and/or modify it under the
terms of the [WTFPL](http://www.wtfpl.net/txt/copying).

No Warranty. The Software is provided "as is" without warranty of any kind, either express or implied, including without limitation any implied warranties of condition, uninterrupted use, merchantability, fitness for a particular purpose, or non-infringement.