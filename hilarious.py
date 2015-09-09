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

import os, sys, time, re, hashlib, random, math
import socket, socketserver, http.server
import argparse

scriptdir = os.path.dirname(os.path.abspath(__file__))
def get_filename_relative_to_this_script(name):
  return os.path.join(scriptdir, name)
html_filename = get_filename_relative_to_this_script('hilarious.html')
test_edited_filename = get_filename_relative_to_this_script('test_hilariously_edited.txt')
# temp_filename should be in the same filesystem as the files being edited...
temp_filename = get_filename_relative_to_this_script('temp-hilarious-editor-temp.txt~')

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
  pass

# http://codahale.com/a-lesson-in-timing-attacks/
# also see https://stackoverflow.com/questions/11829602/pbkdf2-and-hash-comparison
def constant_time_equal(a, b):
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a, b):
        result |= x ^ y
    return result == 0

def create_token():
  # lowercase alphabetic so it's easier to type on smartphones if necessary
  chars = 'abcdefghijklmnopqrstuvwxyz'
  # enough entropy we can't brute force it, more or less
  # http://security.stackexchange.com/q/6141
  bits_of_entropy = 128
  count = math.ceil(bits_of_entropy / math.log(len(chars), 2))
  rng = random.SystemRandom()
  return ''.join(rng.choice(chars) for _ in range(count))

def request_handler(server_origin, hilarious_file_name, auth_token=None):
  # Tokens already have enough bits of entropy that you can't brute-force
  # guess them, so a single hash is as good as bcrypt (and faster, and in
  # the python standard libraries). Goals: to prevent a server compromise
  # from leaking the token (possibly), and to reduce the risk of bugs
  # related to the constant-time comparison function because it will only
  # be used to compare equal-length byte strings (the results of sha384
  # digest()).
  if auth_token != None:
    auth_token = hashlib.sha384(auth_token.encode('ascii')).digest()
  #open_file = open(filename, 'r+t', encoding='utf-8', errors='surrogateescape', newline=None)
  #todo: keep the file open ONLY so that other windows processes know not to mess with it
  class RequestHandler(http.server.BaseHTTPRequestHandler):
    def my_error(self, code):
      self.send_response(code)
      self.boilerplate_headers()
      self.send_header('Content-Type', 'text/plain')
      self.end_headers()
      self.wfile.write(str(code).encode('utf-8'))

    def do_GET(self):
      self.close_connection = True
      if self.path == '/robots.txt':
        self.robots()
      elif self.path == '/favicon.ico':
        self.my_error(404)
      elif self.path == '/':
        self.editor()
      else:
        self.my_error(404)

    def boilerplate_headers(self):
      #self.send_header('X-Frame-Options', 'SAMEORIGIN')
      self.send_header('X-Frame-Options', 'DENY')
      self.send_header('X-Robots-Tag', 'noarchive, noindex, nosnippet')
      self.send_header('Cache-Control', 'no-cache')
      self.send_header('P3P', 'CP="This is not a P3P policy"')
      self.send_header('X-UA-Compatible', 'IE=edge')
  
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
        (self.headers['X-Please-Believe-I-Am-Not-Cross-Domain'] == 'yes') and
        (auth_token == None or (self.headers['X-Token'] != None and constant_time_equal(hashlib.sha384(self.headers['X-Token'].encode('ascii')).digest(), auth_token))) and
        (
          self.headers['Origin'] == server_origin or
          (self.headers['Origin'] == None and
           re.search('^'+re.escape(server_origin)+'/', self.headers['Referer']))))

    def do_POST(self):
      self.close_connection = True
      if not self.is_valid_post():
        self.my_error(400)
      elif re.search('/test_post_works\?', self.path):
        self.test_post_works()
      elif re.search('/get_file_contents\?', self.path):
        self.get_file_contents()
      elif re.search('^/save\?', self.path):
        self.save()
      else:
        self.my_error(404)

    def test_post_works(self):
      self.send_response(204)
      self.send_header('Content-Type', 'text/plain')
      self.boilerplate_headers()
      self.end_headers()

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
        self.my_error(411)
        return
      length = int(self.headers['Content-Length'])
      # we're going to be saving really often, so it's likely
      # that if the system crashes it'll be during a write,
      # so make sure writes are atomic
      with open(temp_filename, 'wt') as f:
        f.write(self.rfile.read(length).decode('utf-8'))
      os.replace(temp_filename, hilarious_file_name)
      self.send_response(204)
      self.send_header('Content-Type', 'text/plain')
      self.boilerplate_headers()
      self.end_headers()


      

  return RequestHandler


def hilariously_edit_one_file(server_host, server_port, filename, auth_type):
  server_ip = socket.gethostbyname(server_host)
  server_origin = 'http://' + server_host + ':' + str(server_port)

  sys.stdout.write(server_origin + '/\n')
  if auth_type in [None, 'none']:
    auth_token = None
  else:
    auth_token = create_token()
    auth_stdout = auth_type in ['stdout', 'copy-and-stdout']
    if auth_type in ['copy-or-stdout', 'copy-and-stdout', 'copy']:
      clip_result = copy_to_clipboard(auth_token)
      if clip_result == False:
        sys.stderr.write('Copy failed\n')
      if auth_type in ['copy-or-stdout']:
        auth_stdout = (clip_result == False)
    if auth_stdout:
      sys.stdout.write(auth_token + '\n')
  sys.stdout.flush()

  server = ThreadingHTTPServer(
             (server_host, server_port),
             request_handler(server_origin, filename, auth_token))
  server.serve_forever()

# debian separates out tkinter into the package python3-tk,
# and it's only used for some command line options anyway,
# so don't assume we can import it.
#
# (This implementation behaved a little weirdly on my Linux X11 - oh well
# - there are also command line ways to copy if I cared, I think)
try:
  from tkinter import Tk, TclError
  # https://stackoverflow.com/questions/4308152/platform-independent-tool-to-copy-text-to-clipboard
  def copy_to_clipboard(text):
    text = str(text)
    # Tk() won't work on a headless server without DISPLAY for example:
    try:
      r = Tk()
      r.withdraw() # don't automatically make a window
      #old_val = r.clipboard_get()
      r.clipboard_clear()
      r.clipboard_append(text)
      r.destroy()
      #def restore_old_val():
      #  r.clipboard_clear()
      #  r.clipboard_append(old_val)
      #return restore_old_val
      return True
    except TclError:
      return False
except ImportError:
  def copy_to_clipboard(text):
    return False

def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--auth', choices=['none', 'stdout', 'copy', 'copy-or-stdout', 'copy-and-stdout'], default='stdout')
  args = parser.parse_args()

  print('auth: '+args.auth)

  # create if not exists:
  with open(test_edited_filename, 'at') as f: pass
  hilariously_edit_one_file('localhost', 3419, test_edited_filename, args.auth)

if __name__ == '__main__':
  main()

