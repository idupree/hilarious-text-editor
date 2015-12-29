(function(){
"use strict";

hilarious.use_sandbox = (location.search === '?sandbox' || location.hash === '#sandbox');

var files = hilarious.sandbox_files = {
  "foo": "rgb is great!\n",
  "bar": "no\n      it is\n  not\n\t! :)\n",
  "baz/quux": "hello world\n\nlorem ipsum dolor sit amet\n"
};

// Using setTimeout(_, 0) just in case any other code depends on
// the callbacks being asynchronous (all the other saving modes
// do it that way).

var ops = {
  save: function(filename, contents, timeout, success, failure) {
    setTimeout(function() {
      files[filename] = contents;
      success();
    }, 0);
  },
  abort: function(saveRequest) {
    console.log("this sandbox saves/loads synchronously and thus aborting is not needed");
  },
  load: function(filename, success, failure) {
    setTimeout(function() {
      if(_.has(files, filename)) {
        success(files[filename]);
      } else {
        failure();
      }
    }, 0);
  },
  load_status: function(success, failure) {
    setTimeout(function() {
      success({
        context_name: "Demo editor",
        default_file_name: null,
        editable_files: hilarious.algo.to_set(files)
      });
    }, 0);
  }
};
if(hilarious.use_sandbox) {
  hilarious.loadsave_ops = ops;
  $(function() {
    hilarious.load_status(function() {
      hilarious.load_file(state.default_file_name);
    });
  });
}

}());
