var requires = require('./');

var dir = process.argv[2] || 'test/fixture';

requires(dir, function(err, res){
  if (err) throw err;
  console.log(res);
});
