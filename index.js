
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
 * Find all node modules the module in `path` requires.
 *
 * @param {String} path
 * @param {Function} fn
 * @api public
 */

function requires(path, fn){
  fs.readFile(join(path, 'package.json'), function(err, json){
    if (err) return fn(err);
    
    // package
    
    var pkg = JSON.parse(json);
    var pkgDeps = Object.keys(pkg.dependencies || {}).filter(unique);
    var pkgDevDeps = Object.keys(pkg.devDependencies || {}).filter(unique);
    var pkgAllDeps = pkgDeps.concat(pkgDevDeps).filter(unique)
    
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
        
        // all deps
        
        moduleDepsOf(files, function(err, allDeps){
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
              .map(function(name){
                return ['mocha', 'jade', 'should'].indexOf(name) > -1
                  ? '(' + name + ')'
                  : name;
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
              /* main: local, */
              /* all: files, */
              /* deps: deps, */
              /* devDeps: devDeps, */
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
      .filter(function(entry){
        return local(entry.name);
      })
      .map(prop('name'))
      .filter(unique);
    if (!reqs.length) return fn(null, []);

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
        if (err) return fn(err);
        res.forEach(function(_resolved){
          resolved = resolved.concat(_resolved);
        });
        fn(null, resolved.filter(unique));
      });
    });
  });
}

/**
 * Find all node modules `files` depend upon.
 *
 * @param {Array} filter
 * @param {Function} fn
 * @api private
 */

function moduleDepsOf(files, fn){
  var deps = {};
  var batch = new Batch;
  files.forEach(function(path){
    batch.push(function(done){
      fs.readFile(path, 'utf8', function(err, source){
        if (err) return done(err);
        mine(source).forEach(function(entry){
          if (!local(entry.name) && !builtin(entry.name)) {
            deps[entry.name] = true;
          }
        });
        done();
      });
    });
  });
  batch.end(function(err, sources){
    if (err) return fn(err);
    fn(null, Object.keys(deps));
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

    var js = [];
    files.forEach(function(stat){
      if (/\.js$/.test(stat.path)) {
        js.push(presolve(join(path, stat.path)));
      }
    });

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
