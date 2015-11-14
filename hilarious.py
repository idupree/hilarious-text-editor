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
import mimetypes

scriptdir = os.path.dirname(os.path.abspath(__file__))
def get_filename_relative_to_this_script(name):
  return os.path.join(scriptdir, name)
html_filename = get_filename_relative_to_this_script('hilarious.html')

default_default_edited_filename = get_filename_relative_to_this_script('test_hilariously_edited.txt')

def guess_mimetype(filename):
  if(filename[-4:] == '.css'):
    return 'text/css; charset=utf-8'
  elif(filename[-3:] == '.js'):
    return 'text/javascript; charset=utf-8'
  else:
    return mimetypes.guess_type(filename, strict=False)


static_resources = [
  'hilarious.html', 'hilarious.css', 'hilarious.js',
  'hilarious-dull-algorithms.js',
  'saving.js',
  'communicate-with-hilarious-server.js',
  'communicate-with-chrome-filesystem.js',
  'underscore-min.js', 'jquery.min.js',
  'annyang.modified.js',
  'bililiteRange.js', 'bililiteRange.util.js',
  'xregexp-all.js',
  'polyfills.js',
  'speech_recognition_for_editor.js',
  'unicode_names_map.json'
  ]

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
  return re.search(r'[\\/]\.git($|[\\/])|[\x00-\x1f\x7f]', d)

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

def abspath_editable_files_under(rootpath):
  return map(lambda f: abspath(join(rootpath, f)),
             relpath_editable_files_under(rootpath))

def abspath_editable_files_under_or_including(rootpath):
  rootpath = abspath(rootpath)
  if os.path.isfile(rootpath):
    if not exclude_file(rootpath):
      return [rootpath]
    else:
      return []
  else:
    return abspath_editable_files_under(rootpath)

def request_handler(server_origin,
    hilarious_edited_paths = (),
    exclude_paths = lambda: False,
    auth_token=None,
    on_save=None):
  # Tokens already have enough bits of entropy that you can't brute-force
  # guess them, so a single hash is as good as bcrypt (and faster, and in
  # the python standard libraries). Goals: to prevent a server compromise
  # from leaking the token (possibly), and to reduce the risk of bugs
  # related to the constant-time comparison function because it will only
  # be used to compare equal-length byte strings (the results of sha384
  # digest()).
  if auth_token != None:
    auth_token = hashlib.sha384(auth_token.encode('ascii')).digest()

  # editable_files is recomputed when /status is called... okay, I guess?
  editable_files = set()
  def recompute_editable_files():
    nonlocal editable_files
    editable_files = set(f
      for path in hilarious_edited_paths
      for f in abspath_editable_files_under_or_including(path)
      if not exclude_paths(f)
      )
  recompute_editable_files()

  default_file_name = min(editable_files)

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
      elif self.path[1:] in static_resources:
        self.static_resource(self.path[1:])
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
      self.static_resource('hilarious.html')

    # load resources from the filesystem each time
    # so that development is faster:
    # fewer things require restarting the server
    def static_resource(self, filename):
      if not filename in static_resources:
        self.my_error(403)
        return
      mimetype = guess_mimetype(filename)
      self.send_response(200)
      self.send_header('Content-Type', mimetype)
      self.boilerplate_headers()
      self.end_headers()
      with open(get_filename_relative_to_this_script(filename), 'rb') as f:
        self.wfile.write(f.read())

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

    def status(self):
      context_name = '; '.join(map(abspath, hilarious_edited_paths))
      recompute_editable_files()
      result = json.dumps({
        "context_name": context_name,
        "default_file_name": default_file_name,
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
      if self.headers['X-File'] in editable_files:
        filename = self.headers['X-File']
      else:
        self.my_error(403)
        return

      self.send_response(200)
      self.send_header('Content-Type', 'text/plain; charset=utf-8')
      self.boilerplate_headers()
      self.end_headers()

      # this locks up the server for long files, hm
      #open_file.seek(0)
      #self.wfile.write(open_file.read().encode('utf-8'))
      with open(filename, 'rt', encoding='utf-8') as f:
        self.wfile.write(f.read().encode('utf-8'))

    def save(self):
      if self.headers['Content-Length'] == None:
        self.my_error(411)
        return
      length = int(self.headers['Content-Length'])

      if self.headers['X-File'] in editable_files:
        filename = self.headers['X-File']
      else:
        self.my_error(403)
        return

      # we're going to be saving really often, so it's likely
      # that if the system crashes it'll be during a write,
      # so make sure writes are atomic
      temp_filename = join(os.path.dirname(abspath(filename)),
        'temp-hilarious-editor-'+create_token()+'.txt~')
      with open(temp_filename, 'wt', encoding='utf-8') as f:
        f.write(self.rfile.read(length).decode('utf-8'))
      os.replace(temp_filename, filename)
      if on_save != None:
        on_save(filename)
      self.send_response(204)
      self.send_header('Content-Type', 'text/plain')
      self.boilerplate_headers()
      self.end_headers()


      

  return RequestHandler


def hilariously_edit(server_host, server_port, paths, exclude_paths, auth_type, on_save):
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
             request_handler(server_origin, paths, exclude_paths, auth_token, on_save))
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


def check_thing_to_edit_listed_on_command_line(thing_to_edit, create_if_nonexistent=False):

  if os.path.islink(thing_to_edit):
    exit("you can't edit a symlink, sorry:\n" + thing_to_edit)

  if (os.path.exists(thing_to_edit) and
          not os.path.isfile(thing_to_edit) and
          not os.path.isdir(thing_to_edit)):
    exit('sorry, you can\'t edit a special file:\n' + thing_to_edit)

  if not os.path.exists(thing_to_edit):
    if create_if_nonexistent:
      with open(thing_to_edit, 'at', encoding='utf-8'): pass
      assert(os.path.exists(thing_to_edit))
    else:
      exit('you can only edit something that exists, please;\nor pass --create-file to edit a single file and create it if it doesn\'t exist yet:\n' + thing_to_edit)

  #if create_if_nonexistent and os.path.isdir(thing_to_edit):
  #  exit('sorry, --create-file is incompatible with editing a directory')

  if os.path.isfile(thing_to_edit) and not editable_as_text(thing_to_edit):
    exit('sorry, this editor would be likely to corrupt newlines or nulls in binary files (or be too slow on too-large files):\n' + thing_to_edit)


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--auth', choices=['none', 'stdout', 'copy', 'copy-or-stdout', 'copy-and-stdout'], default='copy-and-stdout')
  parser.add_argument('--create-file', action='store_true', help="when the command line lists a particular file to edit, --create-file says to create it if it doesn't exist yet. Without --create-file, passing a nonexistent file is an error.")
  parser.add_argument('--on-save', action='append', help='run whenever a file is (automatically) saved; shell syntax')
  parser.add_argument('--exclude-re', action='append', help="even if listed as a thing to edit, don't edit files whose absolute paths match this regular expression (python dialect of regexp)")
  parser.add_argument('things_to_edit', nargs='*')
  args = parser.parse_args()

  if len(args.things_to_edit) == 0:
    args.things_to_edit = [default_default_edited_filename]
    args.create_file = True

  #print('editing:\n' + '\n'.join(args.things_to_edit) + '\n')
  print('auth: '+args.auth)

  for filename in args.things_to_edit:
    check_thing_to_edit_listed_on_command_line(filename, args.create_file)

  on_save = None
  if args.on_save != None:
    # make immutable copy for closure
    on_save_tuple = tuple(args.on_save)
    def on_save(filename):
      for command in on_save_tuple:
        sys.stderr.write('Running: ' + command + '\n')
        exitcode = subprocess.call(command, shell=True)
        sys.stderr.write('\nExit status ' + str(exitcode) + ' from: ' + command + '\n')

  # make immutable copy for closure
  exclude_regexps = tuple(args.exclude_re) if args.exclude_re else ()
  def exclude_paths(path):
    return any(map(
      lambda pattern: re.search(pattern, path) != None,
      exclude_regexps))

  hilariously_edit('localhost', 3419, args.things_to_edit, exclude_paths, args.auth, on_save)

if __name__ == '__main__':
  main()

