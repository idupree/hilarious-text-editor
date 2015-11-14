(function(){
"use strict";

if(!window.hilarious) { window.hilarious = {}; }

hilarious.algo = {}

// A "set" here is an object with every key/value pair having
// the 'value' be 'true'. Underscore.js's set operations on arrays
// have poor asymptotic speed.
hilarious.algo.to_set = function(arrayOrObject) {
  var result = {};
  if(_.isArray(arrayOrObject) || _.isArguments(arrayOrObject)) {
    _.each(arrayOrObject, function(member) {
      if(!_.isString(member) && !_.isNumber(member)) {
        throw("Bad type in conversion to set.");
      }
      result[member] = true;
    });
  } else if(_.isObject(arrayOrObject)) {
    _.each(arrayOrObject, function(val, key) {
      result[key] = true;
    });
  } else {
    throw("Don't know how to convert this to a set");
  }
  return result;
}
hilarious.algo.set_difference = function(minuend, subtrahend) {
  var result = {};
  _.each(minuend, function(member) {
    if(!subtrahend[member]) {
      result[member] = true;
    }
  });
  return result;
}
hilarious.algo.set_sorted = function(set) {
  return _.sortBy(_.keys(set));
}
hilarious.algo.set_size = function(set) {
  return _.size(set);
}

// inspirations from http://stackoverflow.com/q/1916218
// TODO I really only want to get the portion of common
// prefix that consists of complete grapheme clusters
// (see e.g. https://github.com/devongovett/grapheme-breaker )
// - is that worth implementing?
hilarious.algo.common_prefix = function(strings) {
  if(strings.length === 0) {
    return '';
  }
  var highest = _.reduce(strings, function(a, b) { return a > b ? a : b; });
  var lowest  = _.reduce(strings, function(a, b) { return a > b ? b : a; });
  var max_len = Math.min(highest.length, lowest.length);
  var i = 0;
  while(i < max_len && lowest.charAt(i) === highest.charAt(i)) {
    i += 1;
  }
  return lowest.substring(0, i);
}

// Used if you want an object to keep its identity
// but lose all its own keys.
// Mutates obj, and returns it for any chaining purposes.
hilarious.algo.clear_object = function(obj) {
  // Deleting array keys doesn't adjust length,
  // so clear array parts of objects first:
  if(_.isArray(obj)) {
    while(obj.length > 0) {
      obj.pop();
    }
  }
  _.each(_.keys(obj), function(k) {
    delete obj[k];
  });
  return obj;
};

}());
