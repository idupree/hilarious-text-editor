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
from os.path import join, abspath, relpath
import socket, socketserver, http.server
import subprocess
import json
import argparse

scriptdir = os.path.dirname(os.path.abspath(__file__))
def get_filename_relative_to_this_script(name):
  return os.path.join(scriptdir, name)
html_filename = get_filename_relative_to_this_script('hilarious.html')

default_default_edited_filename = get_filename_relative_to_this_script('test_hilariously_edited.txt')

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

# heuristic
# http://stackoverflow.com/a/7392391
textchars = bytearray({7,8,9,10,12,13,27} | set(range(0x20, 0x100)) - {0x7f})
def editable_as_text(fname):
  # files that are too large are not practically editable here, sorry
  if os.path.getsize(fname) > 1000000:
    return False
  with open(fname, 'rb') as f:
    # The translate() deletes every character in its second argument
    # leaving only "binary-only" characters.
    # The read() reads that many bytes or all the bytes in the file,
    # whichever is less.
    return len(f.read(1024).translate(None, textchars)) == 0

# exclude all file paths with newlines and similar weird characters in them:
# they are trouble and no use
def exclude_dir(d):
  return re.search(r'/\.git($|/)|[\x00-\x1f\x7f]', d)

def exclude_file(f):
  return (
    os.path.islink(f) or
    not os.path.isfile(f) or
    exclude_dir(f) or
    re.search(r'(~|\.swp)$|[\x00-\x1f\x7f]', f) or
    not editable_as_text(f))

def relpath_editable_files_under(rootpath):
  for dirpath, dirnames, filenames in os.walk(rootpath):
    dirnames[:] = [d for d in dirnames if not exclude_dir(abspath(join(dirpath, d)))]
    for f in filenames:
      if not exclude_file(abspath(join(dirpath, f))):
        yield relpath(join(dirpath, f), rootpath)

def request_handler(server_origin, hilarious_edited_path = None, auth_token=None):
  # Tokens already have enough bits of entropy that you can't brute-force
  # guess them, so a single hash is as good as bcrypt (and faster, and in
  # the python standard libraries). Goals: to prevent a server compromise
  # from leaking the token (possibly), and to reduce the risk of bugs
  # related to the constant-time comparison function because it will only
  # be used to compare equal-length byte strings (the results of sha384
  # digest()).
  if auth_token != None:
    auth_token = hashlib.sha384(auth_token.encode('ascii')).digest()

  if os.path.isfile(hilarious_edited_path):
    default_file_name = hilarious_edited_path
    hilarious_edited_directory = None
  else:
    default_file_name = get_filename_relative_to_this_script('test_hilariously_edited.txt')
    hilarious_edited_directory = hilarious_edited_path

  # editable_files is recomputed when /status is called... okay, I guess?
  editable_files = set()
  def recompute_editable_files():
    nonlocal editable_files
    if hilarious_edited_directory != None:
      editable_files = set(relpath_editable_files_under(hilarious_edited_directory))
  recompute_editable_files()

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
      #elif re.search('/editable_files\?', self.path):
      #  self.editable_files()
      elif re.search('/status\?', self.path):
        self.status()
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

    # newline-separated
    #def editable_files(self):
    #  # (make sure we successfully traverse the directory before
    #  # saying we 200-succeeded at getting an answer)
    #  editable_files = list(relpath_editable_files_under(hilarious_edited_directory))
    #  self.send_response(200)
    #  self.send_header('Content-Type', 'text/plain; charset=utf-8')
    #  self.boilerplate_headers()
    #  self.end_headers()
    #  self.wfile.write('\n'.join(editable_files))

    def status(self):
      context_name = abspath(hilarious_edited_path)
      recompute_editable_files()
      result = json.dumps({
        "context_name": context_name,
        "editable_files": list(sorted(editable_files))
      }, sort_keys = True).encode('utf-8')
      self.send_response(200)
      self.send_header('Content-Type', 'application/json')
      self.boilerplate_headers()
      self.end_headers()
      self.wfile.write(result)

    #def open_file(self):
    #  pass
    def get_file_contents(self):
      filename = default_file_name
      if self.headers['X-File'] != None:
        if self.headers['X-File'] in editable_files:
          filename = join(hilarious_edited_directory, self.headers['X-File'])
        else:
          self.my_error(403)

      self.send_response(200)
      self.send_header('Content-Type', 'text/plain; charset=utf-8')
      self.boilerplate_headers()
      self.end_headers()

      # this locks up the server for long files, hm
      #open_file.seek(0)
      #self.wfile.write(open_file.read().encode('utf-8'))
      with open(filename, 'rt') as f:
        self.wfile.write(f.read().encode('utf-8'))

    def save(self):
      if self.headers['Content-Length'] == None:
        self.my_error(411)
        return
      length = int(self.headers['Content-Length'])

      filename = default_file_name
      if self.headers['X-File'] != None:
        if self.headers['X-File'] in editable_files:
          filename = join(hilarious_edited_directory, self.headers['X-File'])
        else:
          self.my_error(403)

      # we're going to be saving really often, so it's likely
      # that if the system crashes it'll be during a write,
      # so make sure writes are atomic
      temp_filename = join(os.path.dirname(abspath(filename)),
        'temp-hilarious-editor-'+create_token()+'.txt~')
      with open(temp_filename, 'wt') as f:
        f.write(self.rfile.read(length).decode('utf-8'))
      os.replace(temp_filename, filename)
      self.send_response(204)
      self.send_header('Content-Type', 'text/plain')
      self.boilerplate_headers()
      self.end_headers()


      

  return RequestHandler


def hilariously_edit(server_host, server_port, path, auth_type):
  server_ip = socket.gethostbyname(server_host)
  server_origin = 'http://' + server_host + ':' + str(server_port)

  sys.stdout.write('\nGo to:\n' + server_origin + '/\n\n')
  if auth_type in [None, 'none']:
    auth_token = None
  else:
    auth_token = create_token()
    auth_stdout = auth_type in ['stdout', 'copy-and-stdout']
    clip_succeeded = False
    if auth_type in ['copy-or-stdout', 'copy-and-stdout', 'copy']:
      clip_result = copy_to_clipboard(auth_token)
      clip_succeeded = (clip_result != False)
      if auth_type in ['copy-or-stdout']:
        auth_stdout = not clip_succeeded
      if clip_succeeded:
        if auth_stdout:
          sys.stderr.write('Token has been copied to clipboard:\n')
        else:
          sys.stderr.write('Token has been copied to clipboard\n')
      else:
        sys.stderr.write('Copy failed\n')
    if auth_stdout:
      if not clip_succeeded:
        sys.stdout.write('Copy this auth token:\n')
      sys.stdout.write(auth_token + '\n')
  sys.stdout.flush()

  server = ThreadingHTTPServer(
             (server_ip, server_port),
             request_handler(server_origin, path, auth_token))
  server.serve_forever()

def copy_to_clipboard(text):
  success = False
  for clip_cmd in [
      # OS X
      ['pbcopy'],
      # Windows
      ['clip'],
      # X11
      ['xclip', '-selection', 'clipboard'],
      ['xclip', '-selection', 'primary']
      ]:
    try:
      p = subprocess.Popen(clip_cmd, stdin=subprocess.PIPE)
      p.stdin.write(text.encode('utf-8'))
      p.stdin.close()
      # a guess; we don't actually wait for the clip_cmd to finish
      success = True
    except (subprocess.CalledProcessError, FileNotFoundError):
      pass
  return success

def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--auth', choices=['none', 'stdout', 'copy', 'copy-or-stdout', 'copy-and-stdout'], default='copy-and-stdout')
  parser.add_argument('--create-file', action='store_true')
  parser.add_argument('thing_to_edit', nargs='?', default=default_default_edited_filename)
  args = parser.parse_args()

  print('editing: '+args.thing_to_edit)
  print('auth: '+args.auth)

  if os.path.islink(args.thing_to_edit):
    exit("you can't edit a symlink, sorry")

  if (os.path.exists(args.thing_to_edit) and
          not os.path.isfile(args.thing_to_edit) and
          not os.path.isdir(args.thing_to_edit)):
    exit('sorry, you can\'t edit a special file')

  if not os.path.exists(args.thing_to_edit):
    if args.create_file:
      with open(args.thing_to_edit, 'at'): pass
      assert(os.path.exists(args.thing_to_edit))
    else:
      exit('you can only edit something that exists, please; or pass --create-file to edit a single file and create it if it doesn\'t exist yet')

  if args.create_file and os.path.isdir(args.thing_to_edit):
    exit('sorry, --create-file is incompatible with editing a directory')

  if os.path.isfile(args.thing_to_edit) and not editable_as_text(args.thing_to_edit):
    exit('sorry, this editor would be likely to corrupt newlines or nulls in binary files (or be too slow on too-large files)')

  hilariously_edit('localhost', 3419, args.thing_to_edit, args.auth)

if __name__ == '__main__':
  main()

