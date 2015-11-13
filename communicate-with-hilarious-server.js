(function(){
"use strict";

var state = hilarious.state;

var save_status = document.getElementById('save-status');

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

function call_intermittently_while_trying_to_save() {
//function call_intermittently_when_active() {
//function call_intermittently() {
  var time_unsaved = Date.now() - state.saving.latest_time_that_the_server_has_all_our_data;
  if(time_unsaved > 91000) {
    $(save_status).text('Last saved '+Math.round(time_unsaved/1000/60)+' minutes ago');
  }
  debounced_save();
}
function describe_since(time) {
  var duration = Date.now() - time;
  var date = new Date(time);
  var short_since = "since "+date.getHours()+":"+date.getMinutes()+":"+date.getSeconds();
  if(duration < 6000) {
    return "from the last few seconds";
  } else if(duration < 1.6*60*1000) {
    return short_since + " (" + Math.round(duration/1000) + " seconds ago)";
  } else if(duration < 1.6*3600*1000) {
    return short_since + " (" + Math.round(duration/1000/60) + " minutes ago)";
  } else if(duration < 1.6*86400*1000) {
    return "since " + date + " (" + Math.round(duration/1000/3600) + " hours ago)";
  } else {
    return "since " + date + " (" + Math.round(duration/1000/86400) + " days ago)";
  }
}

// this should be active the millisecond after someone starts typing.
// not 2.5 seconds later when the save attempt starts.
// why bother removing and adding it all the time.
function unsaved_beforeunload(e) {
  // In the time the user is looking at the message, maybe we can
  // squeeze in a save.  An example circumstance where this is useful:
  // if they click "don't close the tab" and then try closing the tab again,
  // hopefully the second time they close the tab it will already be saved
  // so we don't have to warn them again.
  try_save();
  // some changes haven't saved yet!
  //var time_unsaved = Date.now() - state.saving.latest_time_that_the_server_has_all_our_data;
  //var message = "changes from the last " + describe_millisecond_duration(time_unsaved) + " haven't saved yet!"
  var message = "changes " + describe_since(state.saving.latest_time_that_the_server_has_all_our_data) + " haven't saved yet!";
  e.returnValue = message; // some browsers
  return message; // other browsers
}

function we_will_need_to_save() {
  if(!state.saving.trying_to_save) {
    state.saving.trying_to_save = true;
    window.addEventListener('beforeunload', unsaved_beforeunload);
  }
}
function starting_saving() {
  if(!state.saving.save_interval) {
    state.saving.save_interval = setInterval(call_intermittently_while_trying_to_save, 60000);
  }
  we_will_need_to_save();
}
function all_done_saving() {
  state.saving.trying_to_save = false;
  if(state.saving.save_interval !== null) {
    clearInterval(state.saving.save_interval);
  }
  window.removeEventListener('beforeunload', unsaved_beforeunload);
  state.saving.save_req = null;
  $(save_status).empty();
}
// call debounced_save() instead of this
// to make sure we don't try to start saving while the user's
// typing
function try_save() {
  // is 30 seconds enough for saving??
  var req_timeout = 30000;
  if(state.saving.save_req !== null) {
    if(state.saving.last_sync_attempt + req_timeout < Date.now()) {
      state.saving.save_req.abort();
    } else {
      return;
    }
  }
  state.saving.last_sync_attempt = Date.now();
  starting_saving();
  state.saving.save_req = $.ajax({
    url: '/save?'+cachebuster(),
    method: 'POST',
    data: hilarious.editor.value,
    timeout: req_timeout,
    headers: _.assign({},
      {'Content-Type': 'text/plain; charset=utf-8'},
      {'X-File': state.current_file},
      auth_headers()),
    success: function(data) {
      state.saving.latest_time_that_the_server_has_all_our_data = state.saving.last_sync_success = state.saving.last_sync_attempt;
      state.saving.save_req = null;
      if(state.saving.last_sync_success < state.saving.last_edit) {
        debounced_save();
      } else {
        all_done_saving();
      }
    }
  });
}
var debounced_save = _.debounce(try_save, 2500);

function editor_input() {
  var now = Date.now();
  if(state.saving.last_edit <= state.saving.latest_time_that_the_server_has_all_our_data) {
    if(state.saving.latest_time_that_the_server_has_all_our_data < now) {
      state.saving.latest_time_that_the_server_has_all_our_data = now - 1;
    }
  }
  state.saving.last_edit = now;
  we_will_need_to_save();
  debounced_save();
}

$('#textarea_container').on('input', 'textarea', editor_input);

function load_status(is_initial_load) {
  return $.ajax({
    url: '/status?'+cachebuster(),
    method: 'POST',
    headers: auth_headers(),
    success: function(data) {
      console.log(data);
      state.context_name = data.context_name;
      state.default_file_name = data.default_file_name;
      hilarious.display_context_name();
      var all_old_files = state.editable_files;
      var all_new_files = hilarious.algo.to_set(data.editable_files);
      if(!_.isEqual(all_old_files, all_new_files)) {
        state.editable_files = all_new_files;
        hilarious.display_editable_files();
        if(is_initial_load) {
          // this will lead to reload_soon_for_dragon_naturallyspeaking
          load(state.default_file_name);
        } else {
          // Links need to be created before DOMReady for Dragon
          // to be able to click them.
          // ... but loading status no longer creates new links,
          // so this is obsolete:
          // reload_soon_for_dragon_naturallyspeaking();
        }
      }
    }
  });
}

$('#editable_files').on('click', 'a', function(e) {
  e.preventDefault();
  e.stopPropagation();
  var f = $(this).attr('data-filename');
  console.log(f);
  load(f);
});

$('#choices').on('click', 'a[href][data-val]', function(e) {
  e.preventDefault();
  e.stopPropagation();
  var f = $(this).attr('data-val');
  console.log(f);
  load(f);
});


function load(f) {
  if(f !== state.current_file) {
    if(state.saving.trying_to_save) {
      try_save();
      // try again in 300ms, otherwise let the user click again...
      setTimeout(function() {
        if(!state.saving.trying_to_save) {
          load(f);
        }
      }, 300);
    } else {
      $.ajax({
         url: '/get_file_contents?'+cachebuster(),
         method: 'POST',
         headers: _.assign(
           {'X-File': f},
           auth_headers()),
         success: function(data) {
           // textareas need to be created (and all programmatic
           // changes to them completed) before DOMReady
           // to keep Dragon from getting confused.
           // So loading a file will necessitate a page reload,
           // in the case of Dragon.
           // Wait here for load_status because it too may
           // need the page to be reloaded, and better to
           // only reload it once if we can.
           load_status().always(function() {
             hilarious.loaded_file(f, data);
           });
         }
      });
    }
  }
}

function get_token() {
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
        // We now have to load status before loading textarea contents
        // because the status tells us what file to request.
        // (Note if editing this to do them in parallel, see comments below
        // about how this is difficult.)
        load_status(true);
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

hilarious.abort_saving_for_impending_special_lossless_reload = function() {
  if(state.saving.save_req != null) {
    state.saving.save_req.abort();
    state.saving.save_req = null;
  }
  if(state.saving.save_interval != null) {
    clearInterval(state.saving.save_interval);
    state.saving.save_interval = null;
  }
  window.removeEventListener('beforeunload', unsaved_beforeunload);
};

if(state.auth_token == null) {
  console.log("trying to find out what the auth token is");
  get_token();
} else {
  console.log("assuming we already have the right auth token");
}
if(state.saving.trying_to_save) {
  try_save();
}

}());
