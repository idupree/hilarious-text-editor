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

scriptdir = os.path.dirname(os.path.abspath(__file__))
def get_filename_relative_to_this_script(name):
  return os.path.join(scriptdir, name)
html_filename = get_filename_relative_to_this_script('hilarious.html')
test_edited_filename = get_filename_relative_to_this_script('test_hilariously_edited.txt')
# temp_filename should be in the same filesystem as the files being edited...
temp_filename = get_filename_relative_to_this_script('temp-hilarious-editor-temp.txt~')

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
      self.send_header('P3P', 'CP="This is not a P3P policy"')
  
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
      # load page_html each time so that development is faster:
      # fewer things require restarting the server
      with open(get_filename_relative_to_this_script('hilarious.html'), 'rt') as f:
        page_html = f.read()
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
      with open(temp_filename, 'wt') as f:
        f.write(self.rfile.read(length).decode('utf-8'))
      os.replace(temp_filename, hilarious_file_name)
      self.send_response(204)
      self.boilerplate_headers()
      self.end_headers()


      

  return RequestHandler


def hilariously_edit_one_file(filename):
  server = http.server.HTTPServer(('localhost', 3419), request_handler(filename))
  server.serve_forever()

def main():
  # create if not exists:
  with open(test_edited_filename, 'at') as f: pass
  hilariously_edit_one_file(test_edited_filename)

if __name__ == '__main__':
  main()

