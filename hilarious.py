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
      self.wfile.write('''<!DOCTYPE html>
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
  <div id="bar">Hie</div>
  <div id="linenos"></div>
  <textarea id="editor" autofocus cols="80"></textarea>
<script src="https://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.8.3/underscore-min.js"></script>
<script>
(function(){
"use strict";

var editor = document.getElementById('editor');

// todo save if somdhc
function save() {
  var req = new XMLHttpRequest();
  function ack() {
    // todo handle communicating with user
  }
  req.onreadystatechange = ack;
  req.open('POST', '/save', true)
  req.setRequestHeader('X-Please-Believe-I-Am-Not-Cross-Domain', 'yes');
  req.setRequestHeader('Content-Type', 'text/plain; charset=utf-8');
  req.send(editor.value);
}

function editorchange() {
  if(editor.scrollHeight > editor.clientHeight) {
    editor.style.height = editor.scrollHeight+'px';
  }
}

for(var i = 1; i < 1000; ++i) {
  var str = document.createTextNode(''+i);
  var a = document.createElement('a');
  a.setAttribute('href', '#'+str);
  a.appendChild(str);
  linenos.appendChild(a);
}

editor.addEventListener('input', editorchange);

function load() {
  var req = new XMLHttpRequest();
  function got_contents() {
    if(req.readyState === 4) { // complete
      if(req.status === 200) {
        editor.value = req.responseText;
        editorchange();
      }
    }
  }
  req.onreadystatechange = got_contents;
  req.open('POST', '/get_file_contents', true)
  req.setRequestHeader('X-Please-Believe-I-Am-Not-Cross-Domain', 'yes');
  req.send(null);
}

load();

}());
</script>
</body>
</html>
'''.encode('utf-8'))

    def do_POST(self):
      self.close_connection = True
      if self.headers['X-Please-Believe-I-Am-Not-Cross-Domain'] != 'yes' or self.headers['Origin'] != 'http://localhost:3419':
        self.send_error(400)
      elif self.path == '/get_file_contents':
        self.get_file_contents()
      elif self.path == '/save':
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
      # we're going to be saving really often, so it's likely
      # that if the system crashes it'll be during a write,
      # so make sure writes are atomic
      temp_name = '/n/test/hilar/temp~'
      with open(temp_name, 'wt') as f:
        f.write(self.rfile.read().decode('utf-8'))
      os.replace(temp_name, hilarious_file_name)


      

  return RequestHandler


def hilariously_edit_one_file(filename):
  server = http.server.HTTPServer(('localhost', 3419), request_handler(filename))
  server.serve_forever()

def main():
  hilariously_edit_one_file('/n/test/hilar/hilariously_edited.txt')

if __name__ == '__main__':
  main()

