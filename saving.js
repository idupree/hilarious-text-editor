(function(){
"use strict";

// Chrome says "beforeunload is not available in packaged apps."
// Our use of beforeunload isn't critical.
hilarious.can_use_beforeunload = (location.protocol !== 'chrome-extension:');

// implemented in communicate-with-*.js
hilarious.loadsave_ops = {
  // timeout may be undefined, and might not be honored
  save: function(filename, contents, timeout, success, failure) {},
  abort: function(saveRequest) {},
  load: function(filename, success, failure) {},
  load_status: function(success, failure) {}
};

var state = hilarious.state;

var save_status = document.getElementById('save-status');

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
    if(hilarious.can_use_beforeunload) {
      window.addEventListener('beforeunload', unsaved_beforeunload);
    }
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
  if(hilarious.can_use_beforeunload) {
    window.removeEventListener('beforeunload', unsaved_beforeunload);
  }
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
      hilarious.loadsave_ops.abort(state.saving.save_req);
    } else {
      return;
    }
  }
  state.saving.last_sync_attempt = Date.now();
  starting_saving();
  state.saving.save_req = hilarious.loadsave_ops.save(
    state.current_file,
    hilarious.editor.value,
    req_timeout, // ok if not supported
    function() {
      state.saving.latest_time_that_the_server_has_all_our_data = state.saving.last_sync_success = state.saving.last_sync_attempt;
      state.saving.save_req = null;
      if(state.saving.last_sync_success < state.saving.last_edit) {
        debounced_save();
      } else {
        all_done_saving();
      }
    },
    function() {
      // TODO what to do if save failed?
    }
    );
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

hilarious.status_loaded = function(data) {
  if(_.has(data, 'context_name')) {
    state.context_name = data.context_name;
  }
  if(_.has(data, 'default_file_name')) {
    state.default_file_name = data.default_file_name;
  }
  if(_.has(data, 'editable_files')) {
    hilarious.display_context_name();
    var all_old_files = state.editable_files;
    var all_new_files = hilarious.algo.to_set(data.editable_files);
    if(!_.isEqual(all_old_files, all_new_files)) {
      state.editable_files = all_new_files;
      hilarious.display_editable_files();
    }
  }
};

var load_status = hilarious.load_status = function(success, failure) {
  return hilarious.loadsave_ops.load_status(
    function(data) {
      hilarious.status_loaded(data);
      if(success) {success();}
    },
    failure
  );
};

$('#editable_files').on('click', 'a', function(e) {
  e.preventDefault();
  e.stopPropagation();
  var f = $(this).attr('data-filename');
  console.log(f);
  load_file(f);
});

$('#choices').on('click', 'a[href][data-val]', function(e) {
  e.preventDefault();
  e.stopPropagation();
  var f = $(this).attr('data-val');
  console.log(f);
  load_file(f);
});


var load_file = hilarious.load_file = function(f) {
  if(f !== state.current_file) {
    if(state.saving.trying_to_save) {
      try_save();
      // try again in 300ms, otherwise let the user click again...
      setTimeout(function() {
        if(!state.saving.trying_to_save) {
          load_file(f);
        }
      }, 300);
    } else {
      hilarious.loadsave_ops.load(
        f,
        function(data) {
          // textareas need to be created (and all programmatic
          // changes to them completed) before DOMReady
          // to keep Dragon from getting confused.
          // So loading a file will necessitate a page reload,
          // in the case of Dragon.
          // Wait here for load_status because it too may
          // need the page to be reloaded, and better to
          // only reload it once if we can.
          var always = function() {
            hilarious.loaded_file(f, data);
          };
          load_status(always, always);
        }
      );
    }
  }
};

hilarious.abort_saving_for_impending_special_lossless_reload = function() {
  if(state.saving.save_req != null) {
    hilarious.loadsave_ops.abort(state.saving.save_req);
    state.saving.save_req = null;
  }
  if(state.saving.save_interval != null) {
    clearInterval(state.saving.save_interval);
    state.saving.save_interval = null;
  }
  if(hilarious.can_use_beforeunload) {
    window.removeEventListener('beforeunload', unsaved_beforeunload);
  }
};

// wait till DOM Load to make sure the saving-ops-implementing scripts
// have been loaded.
$(function() {
  if(state.saving.trying_to_save) {
    try_save();
  }
});

}());
