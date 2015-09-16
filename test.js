var $http = require('./index.js');

$http.get('http://www.google.com/').then(function(res) {
  console.log(res);
}).catch(function(error) {
  console.log(error);
});

$http.get('http://www.google.com/', { responseType: 'arraybuffer' }).then(function(res) {
  console.log(res);
  console.log(res.data.byteLength);
}).catch(function(error) {
  console.log(error);
});
