(function() {
  var http = null;
  var https = null;
  var url = null;
  var fs = null;
  var $http = null;
  var $q = null;
  
  var isArray = Array.isArray;
  
  if (!isArray) {
    isArray = function(arg) {
      return (Object.prototype.toString.call(arg) === '[object Array]');
    };
  }  
  
  function isObject(arg) {
    return (arg !== null && typeof(arg) === 'object');
  }
  
  function isFunction(arg) {
    return (typeof(arg) === 'function');
  }
  
  function isString(arg) {
    return (typeof(arg) === 'string');
  }
  
  function isPromise(obj) {
    return (obj && isFunction(obj.then));
  }
  
  function forEach(obj, callback) {
    if (isObject(obj) && isFunction(callback)) {
      Object.keys(obj).forEach(function(key) {
        callback(obj[key], key);
      });
    }
  }
	
  if (typeof(exports) !== 'undefined') {
    $q = require('headq');
    http = require('http');
    https = require('https');
    url = require('url');
    fs = require('fs');
  } else if (typeof(window) !== 'undefined') {
    $q = window.$q;
    
    if (!$q) {
      throw new Error('Missing headQ Promises');
    }
  } else {
    throw new Error('Unknow Platform');
  }
  
  function parseHeaders(headers) {
    if (isString(headers)) {
      var res = {}
      var lines = headers.split('\n');
      
      lines.forEach(function(line) {
        var index = line.indexOf(':');
        
        if (index && index !== (line.length - 1) && index != -1) {
          var key = line.substr(0, index).trim().toLowerCase();
          var value = line.substr(index + 1).trim();
          
          if (key && value) {
            res[key] = value;
          }
        }
      });
      
      return res;
    }

    return headers;
  }
  
  function setHeaders(config) {
    if (!isObject(config.headers)) {
      config.headers = {
        'Accept': '*/*',
      };
    }
    
    if (isString(config.hostname)) {
      if (config.port && (config.port !== 443 || config.port !== 80)) {
        config.headers['Host'] = config.hostname + ':' + config.port;
      } else {
        config.headers['Host'] = config.hostname;
      }
    }
  }

  function $httpBrowser(config) {
    if (!isObject(config)) {
      return $q.reject(new Error('Invalid Argument'));
    }
    
    if (!isString(config.url)) {
      config.url = document.location;
    }
    
    if (!isString(config.method)) {
      return $q.reject(new Error('Invalid Method'));
    }
    
    config.method.toUpperCase();
    
    var timer = null;
    var req = $q.defer();
    var xhr = new window.XMLHttpRequest();
    
    xhr.open(config.method, config.url, true);
    
    function onAbort() {
      xhr.abort();
      req.reject(new Error('Timeout'));
    }
    
    function onRequest() {
      if (xhr.readyState == 4) {
        clearTimeout(timer);
        
        var data = null;
        
        switch (config.responseType) {
          case 'blob':
          case 'document':
          case 'arraybuffer':
          case 'json':
            data = xhr.response;
            break;
          default:
            data = xhr.responseText;
            break;
        }

        var res = {
          status: (xhr.status === 1223) ? 204 : (xhr.status == 0) ? 404 : xhr.status,
          headers: parseHeaders(xhr.getAllResponseHeaders()),
          data: data,
        };

        return (res.status >= 200 && res.status <= 300) ? req.resolve(res) : req.reject(res);
      }
    }
    
    function onError() {
      clearTimeout(timer);
      req.reject(new Error(xhr.statusText || 'Network Error'));
    }
    
    xhr.onreadystatechange = onRequest;
    xhr.onerror = onError;
    xhr.onabort = onAbort;
    
    if (config.withCredentials) {
      xhr.withCredentials = true;
    } else {
      xhr.withCredentials = false;
    }
    
    if (config.responseType) {
      try {
        xhr.responseType = config.responseType;
      } catch (error) {
        if (config.responseType !== 'json') {
          req.reject(error);
        }
      }
    }
    
    if (config.timeout > 0) {
      timer = setTimeout(onAbort, config.timeout);
    } else if (isPromise(config.timeout)) {
      config.timeout.then(onAbort);
    }
    
    setHeaders(config);
    
    if (config.data) {      
      if (!isString(config.data)) {
        try {
          config.data = JSON.stringify(config.data);
          
          if (!config.headers['Content-Type']) {
            config.headers["Content-Type"] = 'application/json';
          }
        } catch(error) {
          req.reject(error);
        }
      }
      
      if (!config.headers['Content-Type']) {
        config.headers["Content-Type"] = 'text/plain';
      }
      
      config.headers['Content-Length'] = config.data.length;
    }
    
    forEach(config.headers, function(value, key) {
      try {
        xhr.setRequestHeader(key, value);
      } catch (ignored) {}
    });
    
    xhr.send(config.data);
    
    return req.promise;
  }
  
  function $httpNode(config) {
    if (!isObject(config)) {
      return $q.reject(new Error('Invalid Argument'));
    }
    
    if (!isString(config.url)) {
      config.url = 'http://localhost/';
    }
    
    if (!isString(config.method)) {
      return $q.reject(new Error('Invalid Method'));
    }
    
    config.method.toUpperCase();
    
    var timer = null;
    var socket = null;
    var req = $q.defer();
    
    config.uri = url.parse(config.url);
    config.ssl = (url.protocol == 'https') ? true : false;
    config.port = config.port || config.uri.port || config.ssl ? 443 : 80;
    config.hostname = config.uri.hostname || 'localhost';
    config.local = (url.protocol == 'file');
    config.path = url.pathname + url.search ? url.search : '';

    function onAbort() {
      if (socket) {
        socket.abort();
      }
      
      req.reject(new Error('Timeout'));
    }
    
    function onRequest(status, headers, data) {
      clearTimeout(timer);
      
      if ((status >= 301 && status <= 303) || status == 307) {
        delete config.port;
        delete config.hostname;
        
        config.url = headers.location;
        
        if (status == 303) {
          config.method = 'GET';
        }
        
        $http(config).then(function(res) {
          req.resolve(res);
        }).catch(function(error) {
          req.reject(error);
        }); 
      } else {
        var res = {
          status: status,
          headers: headers,
          data: data,
        };
  
        return (res.status >= 200 && res.status <= 300) ? req.resolve(res) : req.reject(res);
      }
    }
    
    function onError(error) {
      clearTimeout(timer);
      req.reject(error);
    }
    
    if (config.local) { 
      if (config.method !== 'GET') {
        req.reject(new Error('Invalid method for local protocol'));
      }
      
      fs.readFile(url.pathname, "utf8", function(error, content) {
        if (error) {
          return onError(error);
        } else {
          return onRequest(200, {}, content);
        }
      });
    } else {
      if (config.timeout > 0) {
        timer = setTimeout(onAbort, config.timeout);
      } else if (isPromise(config.timeout)) {
        config.timeout.then(onAbort);
      }
      
      setHeaders(config);
      
      if (config.data) {       
        if (!isString(config.data)) {
          try {
            config.data = JSON.stringify(config.data);
            
            if (!config.headers['Content-Type']) {
              config.headers["Content-Type"] = 'application/json';
            }
          } catch(error) {
            req.reject(error);
          }
        }
        
        if (!config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'text/plain';
        }
        
        config.headers['Content-Length'] = config.data.length;
      }
      
      var xhr = config.ssl ? https.request : http.request;
      
      socket = xhr(config, function(res) {
        var offset = 0;
        var length = parseInt(res.headers['content-length']);
        
        if (length < 0) {
          length = 0;
        } 
        
        var buffer = new Buffer(length);
          
        res.on('data', function(chunk) {
          if (!length) {
            buffer = Buffer.concat([ buffer, chunk ]);
          } else {
            chunk.copy(buffer, offset);
            offset += chunk.length;
          }
        });
        
        res.on('end', function() {
          var data = null;
          
          if (offset < length) {
            req.reject(new Error('Invalid Data'));
          }
          
          switch (config.responseType) {
            case 'blob':
            case 'document':
            case 'arraybuffer':
              data = new Uint8Array(buffer).buffer;
              break;
            case 'json':
              if (config.responseType === 'json') {
                try {
                  data = JSON.parse(buffer.toString('utf8'));
                } catch (error) {
                  req.reject(error);
                }
              }
              
              break;
            default:
              data = buffer.toString('utf8');
              break;
          }          
          
          onRequest(res.statusCode, res.headers, data);
        });
      }).on('error', onError);
      
      if (config.data) {
        socket.write(config.data);
      }
      
      socket.end();
    }
    
    return req.promise;
  }
  
  if (typeof(exports) !== 'undefined') {
    $http = $httpNode;
  } else {
    $http = $httpBrowser;
  }

  $http.get = function(url, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'GET';
    
    return $http(config);
  };
  
  $http.delete = function(url, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'DELETE';
    
    return $http(config);
  };
  
  $http.head = function(url, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'HEAD';
    
    return $http(config);
  };
  
  $http.jsonp = function(url, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'JSONP';
    
    return $http(config);
  };
  
  $http.post = function(url, data, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'POST';
    config.data = data;
    
    return $http(config);
  };
  
  $http.put = function(url, data, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'PUT';
    config.data = data;
    
    return $http(config);
  };
  
  $http.patch = function(url, config) {
    if (!isObject(config)) {
      config = {};
    }
    
    config.url = url;
    config.method = 'PATCH';
    
    return $http(config);
  };
  
  if (typeof(exports) !== 'undefined') {
    module.exports = $http;
  } else {
    window.$http = $http;
  }
})();
