# fsdb
Human-friendly databases made with files, directories and symlinks.

## Why
A database backed by filesystem primitives is not very efficient and has no sorting capabilities; it is generally "fast enough" for small datasets though and rather convenient as you can browse and edit from your shell or explorer gui!

## How

Make a database
``` javascript
var fsdb = require('fsdb');
var db = fsdb({ root: __dirname + '/db' });
```

Define some collections
``` javascript
var pets = db.collect('pets', {
  name: 'text',
});

var peeps = db.collect('peeps', {
  name: 'text',
  email: 'text',
  pets: pets	   // indicates a relationship
});
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
var bird = pets.create({ name: 'bird' });
```

Form some relationships
``` javascript
me.pets = [ dog, cat ];
me.update();

you.pets = [ dog, bird ];
you.update();
```

Enjoy your database
``` bash
$ tree db
db/
├── peeps
│   ├── 62fa108b
│   │   ├── name
│   │   └── pets
│   │       ├── bb1e4dbe -> /db/pets/bb1e4dbe
│   │       └── d941e466 -> /db/pets/d941e466
│   └── e493e456
│       ├── name
│       └── pets
│           ├── 3cc31128 -> /db/pets/3cc31128
│           └── d941e466 -> /db/pets/d941e466
└── pets
    ├── 3cc31128
    │   ├── name
    │   └── peeps
    │       └── e493e456 -> /db/peeps/e493e456
    ├── bb1e4dbe
    │   ├── name
    │   └── peeps
    │       └── 62fa108b -> /db/peeps/62fa108b
    └── d941e466
        ├── name
        └── peeps
            ├── 62fa108b -> /db/peeps/62fa108b
            └── e493e456 -> /db/peeps/e493e456

20 directories, 5 files
```

## Tests
There are some simple tests written with [tape](https://github.com/substack/tape). You can browse them [here](https://github.com/jessetane/fsdb/tree/master/test), and run them with:
``` bash
$ npm test
```

## Performance
Write performance is basically terrible - read performance is pretty bad too, but only for bigger data sets - for smallish ones, humans will probably experience quite reasonable speeds (these were run on an macbook pro with an ssd, ymmv):
``` bash
$ node bench
running simple benchmark with 50 ops
50 models created in 0.018 seconds
50 relationships created in 0.007 seconds
50 models read in 0.010 seconds

running simple benchmark with 100 ops
100 models created in 0.042 seconds
100 relationships created in 0.012 seconds
100 models read in 0.015 seconds

running simple benchmark with 1000 ops
1000 models created in 0.315 seconds
1000 relationships created in 0.188 seconds
1000 models read in 0.163 seconds

running simple benchmark with 10000 ops
10000 models created in 5.091 seconds
10000 relationships created in 4.017 seconds
10000 models read in 1.785 seconds
```

## Notes
#### Relationships
Are only, and always(!) symetrical many-to-many relationships. Just some ideas here:
 * Why many-to-many? Everything is cool when you start out building your db and thinking object x will only ever have 1 y, but inevitably you end up pluralizing almost every relationship - so maybe just start out this way?

#### Misc
 * Field types aren't really a thing at this point - data is either text or a relationship
 * No events are broadcast, but you could use [gaze](https://github.com/shama/gaze)?
 * No search or sort for collections or relationships is included - maybe some indexing features could be added?

## Releases
An abbreviated changelog and release tarballs below:
* [1.0.0](https://github.com/jessetane/fsdb/releases/tag/1.0.0)
 * August 10 2014, an experimental prototype

## License
Copyright © 2014 Jesse Tane <jesse.tane@gmail.com>

This work is free. You can redistribute it and/or modify it under the
terms of the [WTFPL](http://www.wtfpl.net/txt/copying).

No Warranty. The Software is provided "as is" without warranty of any kind, either express or implied, including without limitation any implied warranties of condition, uninterrupted use, merchantability, fitness for a particular purpose, or non-infringement.