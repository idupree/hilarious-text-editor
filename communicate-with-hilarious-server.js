(function(){
"use strict";

hilarious.use_hilarious_server = !(window.chrome && chrome.fileSystem);

var state = hilarious.state;

function cachebuster() {
  return '' + Date.now() + Math.random();
}

function auth_headers(tested_token) {
  var token = (tested_token != null ? tested_token : state.auth_token);
  return {
    'X-Please-Believe-I-Am-Not-Cross-Domain': 'yes',
    'X-Token': token
  };
}

function test_auth(tested_token, callback, failure_callback) {
  $.ajax({
    url: '/test_post_works?'+cachebuster(),
    method: 'POST',
    headers: auth_headers(tested_token),
    success: callback,
    failure: failure_callback
  });
}

var ops = {
  save: function(filename, contents, timeout, success, failure) {
    return $.ajax({
      url: '/save?'+cachebuster(),
      method: 'POST',
      data: contents,
      timeout: timeout,
      headers: _.assign({},
        {'Content-Type': 'text/plain; charset=utf-8'},
        {'X-File': filename},
        auth_headers()),
      success: success,
      error: failure
    });
  },
  abort: function(saveRequest) {
    saveRequest.abort();
  },
  load: function(filename, success, failure) {
    $.ajax({
      url: '/get_file_contents?'+cachebuster(),
      method: 'POST',
      headers: _.assign(
        {'X-File': filename},
        auth_headers()),
      success: success,
      error: failure
    });
  },
  load_status: function(success, failure) {
    $.ajax({
      url: '/status?'+cachebuster(),
      method: 'POST',
      headers: auth_headers(),
      success: success,
      error: failure
    });
  }
};

if(hilarious.use_hilarious_server) {
  hilarious.loadsave_ops = ops;
}


function get_token(doneCallback) {
  var token_field = document.getElementById('token');
  var done = false;
  function token_worked(token) {
    return function() {
        if(done){return;}
        done = true;
        token_field.removeEventListener('input', debounced_got_input);
        token_field.value = '';
        $('#ask-for-token').remove();
        state.auth_token = token;
        sessionStorage.setItem('hilarious_editor_token', state.auth_token);
        doneCallback();
        // We now have to load status before loading textarea contents
        // because the status tells us what file to request.
        // (Note if editing this to do them in parallel, see comments below
        // about how this is difficult.)
        // load_status is currently called by load and
        // we can't call both at once here reliably because load()
        // might finish first and then have us call
        // reload_soon_for_dragon_naturallyspeaking()
        // which would terminate any outstanding ajax requests.
        // I could instead change reload_soon_... to use
        // $(document).ajaxStop, with some finickiness.
        // https://stackoverflow.com/questions/3148225/jquery-active-function
        // load_status();
        // load();
    };
  }
  function test_token(token) {
    test_auth(token, token_worked(token));
  }
  function got_input() {
    if(done){return;}
    test_token(token_field.value);
  }
  var debounced_got_input = _.debounce(got_input, 50);
  // Test '' in case no token is required
  // (TODO, serve different html in that case instead?).
  test_token('');
  var saved_token = sessionStorage.getItem('hilarious_editor_token');
  if(saved_token) {
    test_token(saved_token);
  }
  token_field.addEventListener('input', debounced_got_input);
  $('#ask-for-token').show();
  $('#token').focus();
}

function initialize_once_we_have_token() {
  hilarious.load_status(function() {
    hilarious.load_file(state.default_file_name);
  })
}

if(hilarious.use_hilarious_server) {
  if(state.auth_token == null) {
    console.log("trying to find out what the auth token is");
    get_token(initialize_once_we_have_token);
  } else {
    console.log("assuming we already have the right auth token");
    initialize_once_we_have_token();
  }
} else {
  $('#ask-for-token').remove();
}

}());
