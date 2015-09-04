#!/usr/bin/env python3

# TODO security:
# localhost, password, etc
# Make sure to be CSRF-proof
# hmm I *suppose* I could kinda verify using a file://
# although those are limited access and probably none
# at all from a http: page, and no ajax from a file: page
# probably, so, never mind that. Oh but I could have a
# "file upload" box that makes you "upload" a file the
# server created, cool.

# TODO figure out whether I can preserve the newline type of a file
# ... only if it's consistent probably because i doubt a browser would preserve it
# newline=None rewrites the file as the OS default.

#shoudl theere be a "quit"?

#todo howto have something happen every so often
# handle one request at a time? with timeout? or other.

# no private info over GET.

# what if file changes on fs, does one overwrite another
# todo - looks like python buffers the read contents in memory
# relevant if i change the file on disk with something else

import os, sys, time, re
import http.server

page_html = '''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hi</title>
  <style>
/* CSS reset */
html,body,div,dl,dt,dd,ul,ol,li,h1,h2,h3,h4,h5,h6,pre,code,form,fieldset,legend,input,button,textarea,select,p,blockquote,th,td{margin:0;padding:0}
h1,h2,h3,h4,h5,h6{font-size:100%;font-weight:inherit;}
img{color:transparent;font-size:0;border:0;vertical-align:middle;}

html,body {
  height: 100%;
  width: 100%;
  color: #006;
  background-color: #fec;
  font-family: monospace;
  font-size: 10px;
}

#bar {
  float: left;
  min-height: 100%;
  background-color: #cfe;
}
#linenos {
  float: left;
  min-height: 100%;
  background-color: #fce;
  text-align: right;
  padding: 0 1px;
}
#linenos > a {
  display: block;
  text-decoration: none;
  color: #00f;
}
#linenos > a:visited {
  color: #00f;
}
#editor {
  font-family: inherit;
  font-size: inherit;
  float: left;
  resize: none;
  border-width: 0px;
}
  </style>
</head>
<body>
  <div id="bar"><div id="save-status"></div></div>
  <div id="linenos"></div>
  <textarea id="editor" autofocus cols="80"></textarea>
<script src="https://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.8.3/underscore-min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/1.11.1/jquery.min.js"></script>
<script>
(function(){
"use strict";

var editor = document.getElementById('editor');
var save_status = document.getElementById('save-status');

function cachebuster() {
  return '' + Date.now() + Math.random();
}

// todo save if somdhc
var trying_to_save = false;
var save_interval = null;
var save_req = null;
var last_sync_attempt;
var last_edit = 0;
var last_sync_success;
var latest_time_that_the_server_has_all_our_data; // in theory updated continously when the server has our data, but actually only retroactively updated once the user types something to be the moment before they typed
function call_intermittently_while_trying_to_save() {
//function call_intermittently_when_active() {
//function call_intermittently() {
  var time_unsaved = Date.now() - latest_time_that_the_server_has_all_our_data;
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
  var time_unsaved = Date.now() - latest_time_that_the_server_has_all_our_data;
  // some changes haven't saved yet!
  //var message = "changes from the last " + describe_millisecond_duration(time_unsaved) + " haven't saved yet!"
  var message = "changes " + describe_since(latest_time_that_the_server_has_all_our_data) + " haven't saved yet!"
  e.returnValue = message; // some browsers
  return message; // other browsers
}

function we_will_need_to_save() {
  if(!trying_to_save) {
    trying_to_save = true;
    window.addEventListener('beforeunload', unsaved_beforeunload);
  }
}
function starting_saving() {
  if(!save_interval) {
    save_interval = setInterval(call_intermittently_while_trying_to_save, 60000);
  }
  we_will_need_to_save();
}
function all_done_saving() {
  trying_to_save = false;
  if(save_interval !== null) {
    clearInterval(save_interval);
  }
  window.removeEventListener('beforeunload', unsaved_beforeunload);
  save_req = null;
  $(save_status).empty();
}
// always call debounced_save() instead of this
// to make sure we don't try to start saving while the user's
// typing
function try_save() {
  // is 30 seconds enough for saving??
  var req_timeout = 30000;
  var req = new XMLHttpRequest();
  if(save_req !== null) {
    if(last_sync_attempt + req_timeout < Date.now()) {
      save_req.abort();
    } else {
      return;
    }
  }
  save_req = req;
  last_sync_attempt = Date.now();
  starting_saving();
  function ack() {
    if(req.readyState === 4) { // complete
      if(req.status === 200 || req.status === 204) {
        latest_time_that_the_server_has_all_our_data = last_sync_success = last_sync_attempt;
        save_req = null;
        if(last_sync_success < last_edit) {
          debounced_save();
        } else {
          all_done_saving();
        }
      }
    }
  }
  req.onreadystatechange = ack;
  req.timeout = req_timeout;
  req.open('POST', '/save?'+cachebuster(), true)
  req.setRequestHeader('X-Please-Believe-I-Am-Not-Cross-Domain', 'yes');
  req.setRequestHeader('Content-Type', 'text/plain; charset=utf-8');
  req.send(editor.value);
}
var debounced_save = _.debounce(try_save, 2500);

//function editorchange_less_urgent() {
//  last_edit = Date.now();
//  try_save();
//}
//var debounced_editorchange_less_urgent = _.debounce(editorchange_less_urgent, 2500);

function adjust_editor_height() {
  if(editor.scrollHeight > editor.clientHeight) {
    editor.style.height = editor.scrollHeight+'px';
  }
}
function editor_input() {
  adjust_editor_height();
  var now = Date.now();
  if(last_edit <= latest_time_that_the_server_has_all_our_data) {
    if(latest_time_that_the_server_has_all_our_data < now) {
      latest_time_that_the_server_has_all_our_data = now - 1;
    }
  }
  last_edit = now;
  we_will_need_to_save();
  debounced_save();
  //debounced_editorchange_less_urgent();
}

for(var i = 1; i < 1000; ++i) {
  var str = document.createTextNode(''+i);
  var a = document.createElement('a');
  a.setAttribute('href', '#'+str);
  a.appendChild(str);
  linenos.appendChild(a);
}

editor.addEventListener('input', editor_input);

function load() {
  var req = new XMLHttpRequest();
  function got_contents() {
    if(req.readyState === 4) { // complete
      if(req.status === 200) {
        editor.value = req.responseText;
        latest_time_that_the_server_has_all_our_data = last_sync_success = Date.now();
        adjust_editor_height();
      }
    }
  }
  req.onreadystatechange = got_contents;
  req.open('POST', '/get_file_contents?'+cachebuster(), true)
  req.setRequestHeader('X-Please-Believe-I-Am-Not-Cross-Domain', 'yes');
  req.send(null);
}

load();

}());
</script>
</body>
</html>
'''

def request_handler(hilarious_file_name):
  #open_file = open(filename, 'r+t', encoding='utf-8', errors='surrogateescape', newline=None)
  #todo: keep the file open ONLY so that other window processes know not to mess with it
  class RequestHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
      self.close_connection = True
      if self.path == '/robots.txt':
        self.robots()
      elif self.path == '/favicon.ico':
        self.send_error(404)
      elif self.path == '/':
        self.editor()
      else:
        self.send_error(404)

    def boilerplate_headers(self):
      #self.send_header('X-Frame-Options', 'SAMEORIGIN')
      self.send_header('X-Frame-Options', 'DENY')
      self.send_header('X-Robots-Tag', 'noarchive, noindex, nosnippet')
      self.send_header('Cache-Control', 'no-cache')

  
    def robots(self):
      self.send_response(200)
      self.send_header('Content-Type', 'text/plain')
      self.boilerplate_headers()
      self.end_headers()
      self.wfile.write(b'User-agent: *\nDisallow: /\n')
  
    def editor(self):
      self.send_response(200)
      self.send_header('Content-Type', 'text/html; charset=utf-8')
      self.boilerplate_headers()
      self.end_headers()
      self.wfile.write(page_html.encode('utf-8'))

    def is_valid_post(self):
      return (
        self.headers['X-Please-Believe-I-Am-Not-Cross-Domain'] == 'yes' and
        (
          self.headers['Origin'] == 'http://localhost:3419' or
          (self.headers['Origin'] == None and
           re.search('^http://localhost:3419/', self.headers['Referer']))))

    def do_POST(self):
      self.close_connection = True
      if not self.is_valid_post():
        self.send_error(400)
      elif re.search('/get_file_contents\?', self.path):
        self.get_file_contents()
      elif re.search('^/save\?', self.path):
        self.save()
      else:
        self.send_error(404)

    #def open_file(self):
    #  pass
    def get_file_contents(self):
      self.send_response(200)
      self.send_header('Content-Type', 'text/plain; charset=utf-8')
      self.boilerplate_headers()
      self.end_headers()
      # this locks up the server for long files, hm
      #open_file.seek(0)
      #self.wfile.write(open_file.read().encode('utf-8'))
      with open(hilarious_file_name, 'rt') as f:
        self.wfile.write(f.read().encode('utf-8'))

    def save(self):
      if self.headers['Content-Length'] == None:
        self.send_error(411)
        return
      length = int(self.headers['Content-Length'])
      # we're going to be saving really often, so it's likely
      # that if the system crashes it'll be during a write,
      # so make sure writes are atomic
      temp_name = '/n/test/hilar/temp~'
      with open(temp_name, 'wt') as f:
        f.write(self.rfile.read(length).decode('utf-8'))
      os.replace(temp_name, hilarious_file_name)
      self.send_response(204)
      self.boilerplate_headers()
      self.end_headers()


      

  return RequestHandler


def hilariously_edit_one_file(filename):
  server = http.server.HTTPServer(('localhost', 3419), request_handler(filename))
  server.serve_forever()

def main():
  hilariously_edit_one_file('/n/test/hilar/hilariously_edited.txt')

if __name__ == '__main__':
  main()

