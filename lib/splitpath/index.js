module.exports = splitpath;

function splitpath(path) {
  path = path || '';

  // ensure no duplicate slashes
  path = path.replace(/\/{2,}/g, '/');

  // strip leading slashes
  path = path.replace(/^[\/]*/, '');

  // empty string
  if (!path) return [ '/', '' ];

  // no slashes
  if (!/\//.test(path)) return [ '/', path ];

  // split path on last slash
  return [ '/' + path.replace(/(.*)\/.*/, '$1'), path.replace(/.*\//, '') ];
}
