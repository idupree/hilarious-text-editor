(function(){
"use strict";

hilarious.use_sandbox = (location.search === '?sandbox' || location.hash === '#sandbox');

var files = hilarious.sandbox_files = {
  "foo": "rgb is great!\n",
  "bar": "no\n      it is\n  not\n\t! :)\n",
  "baz/quux": "hello world\n\nlorem ipsum dolor sit amet\n"
};

var ops = {
  save: function(filename, contents, timeout, success, failure) {
    files[filename] = contents;
    success();
  },
  abort: function(saveRequest) {
    console.log("this sandbox saves/loads synchronously and thus aborting is not needed");
  },
  load: function(filename, success, failure) {
    if(_.has(files, filename)) {
      success(files[filename]);
    } else {
      failure();
    }
  },
  load_status: function(success, failure) {
    success({
      context_name: "Demo editor",
      default_file_name: null,
      editable_files: hilarious.algo.to_set(files)
    });
  }
};
if(hilarious.use_sandbox) {
  hilarious.loadsave_ops = ops;
}

}());
