
/**
 * Module dependencies.
 */

var mine = require('mine');
var fs = require('graceful-fs');
var builtins = require('builtins');
var prop = require('to-function');
var join = require('path').join;
var Batch = require('batch');
var keys = Object.keys;
var dirname = require('path').dirname;
var basename = require('path').basename;
var resolve = require('resolve');
var presolve = require('path').resolve;
var entries = require('entry-points');
var lsr = require('lsr');
var debug = require('debug')('module-requires');

/**
 * Expose `requires`.
 */

module.exports = requires;

/**
 * Find all node modules the module in `path` requires.
 *
 * @param {String} path
 * @param {Function} fn
 * @api public
 */

function requires(path, fn){
  path = presolve(path);
  
  fs.readFile(join(path, 'package.json'), function(err, json){
    if (err) return fn(err);
    
    // package
    
    var pkg = JSON.parse(json);
    var pkgDeps = keys(pkg.dependencies || {});
    var pkgDevDeps = keys(pkg.devDependencies || {});
    var pkgAllDeps = pkgDeps.concat(pkgDevDeps).filter(unique);
    
    entries(path, function(err, mains){
      if (err) return fn(err);
      
      debug('mains: %j', mains);
      
      // local files required from mains

      pipe(
        mapStream(mains, function(main){
          return localRequires(_main);
        }),
        dedupe(),
        concat(function(res){
          var local = res.concat(mains);

          // all js files
          pipe(jsFiles(path), concat(function(files){
            if (err) return fn(err);
            
            // add bins, json etc
            files = files.concat(local).filter(unique);
            
            // all deps
            var mdo = moduleDepsOf();
            files.forEach(function(f){ mdo.write(f) });
            mdo.end();
            pipe(mdo, concat(function(allDeps){
              if (err) return fn(err);
              
              // main deps
              moduleDepsOf(local, function(err, deps){
                if (err) return fn(err);
                
                // dev deps
                var devDeps = allDeps.filter(not(isIn(deps)));
                 
                // filter out components etc.
                allDeps = allDeps.filter(isIn(pkgAllDeps));
                deps = deps.filter(isIn(allDeps));
                devDeps = devDeps.filter(isIn(allDeps));
                 
                // obsolete deps
                var obsolete = pkgAllDeps
                  .filter(not(isIn(allDeps)))
                  .filter(function(name){
                    return ['mocha', 'should'].indexOf(name) == -1;
                  });
                
                // missplaced deps
                var missplacedDeps = pkgDeps
                  .filter(isIn(allDeps))
                  .filter(not(isIn(deps)));
                 
                // missplaced dev deps
                var missplacedDevDeps = pkgDevDeps
                  .filter(isIn(allDeps))
                  .filter(not(isIn(devDeps)));
                
                fn(null, {
                  obsolete: obsolete,
                  missplacedDeps: missplacedDeps,
                  missplacedDevDeps: missplacedDevDeps
                });
              });
            })).on('error', fn);
          })).on('error', fn)
          })
      ).on('error', fn);

      // TODO mapStream(arr, fn);
    });
  });
}

/**
 * Find all local files the file at `path` requires.
 *
 * @param {String} path
 * @return {Stream}
 * @api private
 */

function localRequires(src, ignore){
  ignore = ignore || [];
  
  var reqs = mine(src)
    .filter(function(entry){
      return local(entry.name) && !/lib-cov/.test(entry.name);
    })
    .map(function(entry){
      return join(dirname(path), entry.name);
    })
    .filter(function(name){
      return ignore.indexOf(name) == -1;
    })
    .filter(unique);

  debug('%s requires %j', path, reqs);

  // ignore from now on
  reqs.forEach(function(name){
    ignore.push(name);
  });

  var r = new Readable({ objectMode: true });
  r._read = function(){
    if (!reqs.length) return this.push(null);
    var req = reqs.shift();
    resolve(req, {
      extensions: ['.js', '.json']
    }, function(_, dest){
      if (!dest) return r.emit('readable');
      r.push(dest);
    })
  };

  var local = through2.obj(function(src, _, cb){
    localRequires(src, ignore)
      .on('error', cb);
      .on('end', cb);
      .pipe(local, { end: false });
  });

  return pipe(r, local, dedupe());
}

/**
 * Find all node modules `files` depend upon.
 *
 * @return {Stream}
 * @api private
 */

function moduleDepsOf(){
  var tr = through2.obj(function(file, _, cb){
    fs.readFile(file, 'utf8', function(err, source){
      if (err) return cb(err);
      mine(source).forEach(function(entry){
        if (!local(entry.name) && !builtin(entry.name)) {
          tr.push(entry.name);
        }
      });
      cb();
    });
  };
  return pipe(tr, dedupe());
}

function dedupe(){
  var keys = {};
  return through2.obj(function(key, _, cb){
    if (!keys[key]) {
      keys[key] = true;
      this.push(key);
    }
    cb();
  });
}

/**
 * Find all .js files in `path`, except node_modules and components.
 *
 * @param {String} path
 * @return {Stream}
 * @api private
 */

function jsFiles(path){
  function filter(p){ return !/node_modules|components$/.test(p) }
  return pipe(
    lsr.stream(path, { filterPath: filter }),
    through2.obj(function(stat, _, cb){
      if (/\.js$/.test(stat.path)) {
        this.push(presolve(join(path, stat.path)));
      }
      cb();
    })
  );
}

/**
 * Utilities.
 */

function isIn(arr){
  return function(el){
    return arr.indexOf(el) > -1;
  }
}

function not(fn){
  return function(){
    return !fn.apply(null, arguments);
  }
}

function local(name){
  return name[0] == '.';
}

function unique(el, i, els){
  return els.indexOf(el) == i;
}

function builtin(name){
  return builtins.indexOf(name) > -1;
}

