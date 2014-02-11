
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

/**
 * Expose `requires`.
 */

module.exports = requires;

/**
 * Find all local files the file at `path` requires.
 *
 * @param {String} path
 * @param {Function} fn
 * @api private
 */

function localRequires(path, fn){
  fs.readFile(path, 'utf8', function(err, src){
    if (err) return fn(err);
    
    var reqs = mine(src)
      .map(prop('name'))
      .filter(unique)
      .filter(local);
    
    var batch = new Batch;
    reqs.forEach(function(name){
      batch.push(function(done){
        resolve(name, { basedir: dirname(path) }, done);
      });
    });
    batch.end(function(err, resolved){
      if (err) return fn(err);
      
      batch = new Batch;
      resolved.forEach(function(loc){
        batch.push(function(done){
          localRequires(loc, done);
        });
      });
      batch.end(function(err, res){
        res.forEach(function(_resolved){
          resolved = resolved.concat(_resolved);
        });
        fn(null, resolved.filter(unique));
      });
    });
  });
}

function moduleDepsOf(files, fn){
  var batch = new Batch;
  files.forEach(function(path){
    batch.push(function(done){
      fs.readFile(path, 'utf8', done);
    });
  });
  batch.end(function(err, sources){
    if (err) return fn(err);
    
    var reqs = [];
    
    sources.forEach(function(source){
      reqs = reqs.concat(mine(source)
      .map(prop('name'))
      .filter(not(local))
      .filter(not(builtin)));
    });
    
    fn(null, reqs.filter(unique));
  });
}

/**
 * Find all node modules the module in `path` requires.
 *
 * @param {String} path
 * @param {Function} fn
 * @api public
 */

function requires(path, fn){
  fs.readFile(join(path, 'package.json'), function(err, json){
    if (err) return fn(err);
    var pkg = JSON.parse(json);
    
    var mains = entries(pkg).map(function(entry){
      return presolve(join(path, entry));
    });
    
    // local files required from mains
    
    var batch = new Batch;
    
    mains.forEach(function(_main){
      batch.push(function(done){
        localRequires(_main, done);
      });
    });
    
    batch.end(function(err, res){
      if (err) return fn(err);
      
      var local = [];
      res.forEach(function(_local){
        local = local.concat(_local);
      });
      local = mains
        .concat(local)
        .filter(unique);
      
      // all js files
      
      jsFiles(path, function(err, files){
        if (err) return fn(err);
        
        // add bins, json etc
        
        files = files.concat(local).filter(unique);
        
        // main deps
        
        moduleDepsOf(local, function(err, deps){
          if (err) return fn(err);
          
          // all deps
          
          moduleDepsOf(files, function(err, allDeps){
            if (err) return fn(err);
            
            // dev deps
            
            var devDeps = allDeps.filter(not(isIn(deps)));
             
            // obsolete deps
            
            var obsolete = keys(pkg.dependencies)
              .concat(keys(pkg.devDependencies || {}))
              .filter(unique)
              .filter(not(isIn(allDeps)));
            
            // missplaced deps
            
            var missplacedDeps = keys(pkg.dependencies)
              .filter(unique)
              .filter(isIn(allDeps))
              .filter(not(isIn(deps)));
             
            // missplaced dev deps
              
            var missplacedDevDeps = keys(pkg.devDependencies || {})
              .filter(unique)
              .filter(isIn(allDeps))
              .filter(not(isIn(devDeps)));
            
            fn(null, {
              main: local,
              all: files,
              deps: deps,
              devDeps: devDeps,
              obsolete: obsolete,
              missplacedDeps: missplacedDeps,
              missplacedDevDeps: missplacedDevDeps
            });
          });
        });
      });
    });
  });
}

/**
 * Find all .js files in `path`, except node_modules and components.
 *
 * @param {String} path
 * @param {Function} fn
 * @api private
 */

function jsFiles(path, fn){
  function filter(p){
    return !/node_modules|components$/.test(p);
  }

  lsr(path, { filterPath: filter }, function(err, files){
    if (err) return fn(err);

    var js = files
    .map(prop('path'))
    .map(function(file){
      return presolve(join(path, file));
    })
    .filter(function(file){
      return /\.js$/.test(file);
    })
    .filter(unique);

    fn(null, js);
  });
}

/**
 * Check if `el` is in `arr`.
 *
 * @param {Array} arr
 * @return {Function}
 * @api private
 */

function isIn(arr){
  return function(el){
    return arr.indexOf(el) > -1;
  }
}

/**
 * Invert `fn`.
 *
 * @param {Function} fn
 * @return {Function}
 * @api private
 */

function not(fn){
  return function(){
    return !fn.apply(null, arguments);
  }
}

/**
 * Check if `name` is that of a local module,
 * e.g. './util' and not 'util'.
 *
 * @param {String} name
 * @return {Boolean}
 * @api private
 */

function local(name){
  return name[0] == '.';
}

/**
 * Array unique utility.
 *
 * @param {Mixed} el
 * @param {Number} i
 * @param {Element els}
 * @return {Boolean}
 * @api private
 */

function unique(el, i, els){
  return els.indexOf(el) == i;
}

/**
 * Check if `name` is not a builtin module.
 *
 * @param {String} name
 * @return {Boolena}
 * @api private
 */

function builtin(name){
  return builtins.indexOf(name) > -1;
}
