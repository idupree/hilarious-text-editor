
Overview
===
hilarious-text-editor lets you edit text files in a web browser.
It autosaves every few seconds.  You need to install Python 3.4
or higher before you can run it.

./hilarious.py --help

./hilarious.py path-to-file-or-directory-to-edit-things-in

Don't choose a directory with too many hundreds of text files in it.
(See Limitations below.)

Follow the directions it shows on stdout for what link to open in your
web browser.  Probably http://localhost:3419/ and probably you'll then
have a secret authentication token in your clipboard you can paste in
to start editing. (See Security below for why there's a secret.)

I wrote this because Dragon NaturallySpeaking is pretty effective at
controlling HTML &lt;textarea&gt;s in IE 11.  My friends wanted a text editor
for coding with Dragon that has fewer misfeatures for that purpose
than DragonPad or Microsoft Word. If you have another use for this editor,
I'd love to hear about it! Or even if you are using it for this purpose!

The editor could integrate something like http://ace.c9.io/ as an editor,
but it probably won't because Dragon gets a little confused by the
fancy things those editors do (in ace editor, for example, most of the text
in the document is not in the &lt;textarea&gt; element at any given time, but
is instead in other elements. Presumably so they can syntax hilight it
and/or be more asymptotically efficient at editing.  With the CodeMirror
editor — used for example by twine2 — I am even less sure what exactly
it's doing in the DOM.

Limitations
===

It doesn't work well when there are too many files in the directory.

It doesn't even let you edit sufficiently large text files, because it
would be too slow in the browser and/or autosaving.

Security
===

Since you're (probably) a coder, you'll be editing scripts that you'll
then (probably) be running in your user account, so you don't want
other people to sneak in and edit your files over HTTP.  If they could,
they could then (probably) run their code as your user account.

Preventing this is implemented in parts:

- Transport security: connecting to localhost or over HTTPS.
  (HTTPS not implemented yet; you can't use it remotely at
  all yet unless you hack the source code to do that insecurely.)

- CSRF protection: all server requests involving private data
  are XHR2 Ajax POST requests with custom HTTP header fields
  that the server checks, in addition to checking Origin or Referer.
  This means they can't be posted to cross-domain.

- What if someone else connects to the server:
  - When serving on localhost, only localhost users can connect at all
  - Unless you disable the random token, sending a correct token
    is required for all requests that involve private data.
    The random token is only sent to the clipboard and/or stdout,
    so other Unix/Windows users on the same system won't easily
    be able to get a copy of it.

- The server not having bugs like memory corruption: it's Python
  with none of my code using the FFI, so that helps.

Anyone who can connect to the server can probably DOS it, but
that's less of an issue.  Let me know if you want me to do something
about this.  (A best solution would likely include putting it behind
a reverse proxy such as nginx... so not suitable for all uses.)

