(function(){
"use strict";

hilarious.use_web_speech_recognition_api = (window.annyang != null);
if(!hilarious.use_web_speech_recognition_api) {
  return;
}

bililiteRange.fn.expandToInclude = function(otherRange) {
  return this.bounds([
    Math.min(this.bounds()[0], otherRange.bounds()[0]),
    Math.max(this.bounds()[1], otherRange.bounds()[1])
    ]);
};

// Forestall any latent astral-plane Unicode bugs:
XRegExp.install({astral: true});

// For commands that are often heard as ambiguous enough
// that it helps to capture homophones, we check some of those.
XRegExp.addToken(
  /{number}/,
  function() {return '(?:(?:-|−|negative|minus|dash|hyphen)? ?[0-9]+|a|one|two|to|too|three|for|four|infinit[yei]|every|all)';},
  {leadChar: '{'}
);
XRegExp.addToken(
  /{through}/,
  function() {return '(?:-|to|two|too|2|through|thru)';},
  {leadChar: '{'}
);

// Use with the custom XRegExp token "{number}".
function parse_spoken_count(count) {
  if(count == null) {
    return 1;
  }
  count = count.trim();
  var negated = /^(-(?=.)|−|negative|minus|hyphen|dash) ?(.*)$/.exec(count);
  if(negated) { count = negated[2]; }
  var sign = (negated ? -1 : 1);
  if(count === '' || count === 'a' || count === 'an' || count === 'one') {
    return sign * 1;
  } else if(count === 'two' || count === 'to' || count === 'too' || count === '-') {
    return sign * 2;
  } else if(count === 'three') {
    return sign * 3;
  } else if(count === 'four' || count == 'for') {
    return sign * 4;
  //} else if(match = /^(-|negative|minus|hyphen|dash)? ?(?:completely|every|infinit[eyi]|all)$/i.exec(count)) {
  } else if(/^(?:infinit[eyi]|every|all)$/i.test(count)) {
    return sign * Infinity;
  } else if(/^[0-9]+$/.test(count)) {
    return sign * +count;
  } else {
    return null;
  }
}

var unicode_names_map = null;
var unicode_names_string = '';
$.ajax({
  method: 'GET',
  cache: true,
  dataType: 'json',
  url: '/generated/unicode_names_map.json',
}).done(function(data) {
  unicode_names_map = data;
  // TODO is this too slow for the main thread?
  // also what order will it be in?
  _.each(unicode_names_map, function(character, name) {
    unicode_names_string += (name + '\n');
  });
});

//function elementToApplyEditingCommandsTo() {
//var artificiallyEditedElement = null; // for tests. er, wait, this'll change the active element possibly; hm
var editedElement = function() {
  //return artificiallyEditedElement || document.activeElement;
  return document.activeElement;
};

// For recognizing the user saying "U+03C1",
// the recognizer isn't very good at it.
// I could match "you plus" and then a pause and then
// each individual hex character separated by pauses.
// It's better at "0x..." (but not great) so hmm.
// I wonder if testing more than five possible matches
// would be useful at all here.
// If I have a command to take the preceding text
// and turn it into a Unicode character(s), then
// that could work with copy/pasted u+ info too.
// Also a command to turn unicode into hex or a sidebar
// so you can see what weird things are happening


// TODO make this configurable and/or autodetected:
var num_tab_spaces = 2;
var tab_spaces = ' '.repeat(num_tab_spaces);
function artificially_type(text) {
  var selection = bililiteRange(editedElement()).bounds('selection');
  if(text == '\n') {
    selection.insertEOL().select();
  } else {
    selection.text(text, 'end').select();
  }
}
var added_commands = {};
var added_literal_commands = {};
// this depends on a patched annyang that exposes registerCommand
// also maybe I should hack around its trimming: done
// also TODO case-fold rather than lowercase
annyang.debug();
annyang.registerCommand({
    exec: function(str) {
      var normalizedstr = str.trim().toLowerCase();
      var matchfunc = added_literal_commands[normalizedstr];
      return (matchfunc ? [null, normalizedstr, matchfunc] : null);
    }},
    function(normalizedstr, matchfunc) {
      matchfunc(normalizedstr);
    },
    '(literal match)'
    );
function showCodePoint(codepointNumber) {
  var s = codepointNumber.toString(16).toUpperCase();
  if(s.length < 4) {
    s = '0'.repeat(4 - s.length) + s;
  }
  return 'U+' + s;
}
function search_for_unicode_characters(searched) {
      console.log("Trying to find unicode matches for: " + searched);
      var words = searched.split(/[- \t]+/);
      var searcher = new RegExp('^' +
        _.map(words, function(word) { return '(?=.*'+word+')'; }).join('') +
        '.*$',
        'gm');
      //console.log(searcher.source);
      // TODO sorted by codepoint maybe??
      // also what about speech recognition multiple results hm.
      var max_to_find = 35;
      // There are some intentional duplicate name keys ("-" replaced with
      // spaces for example), so skip the duplicated ones. TODO show
      // the user the *canonical* name (with-dash if duplicates, for example).
      var found_chars = {};
      for(var num_found = 0; num_found < max_to_find;) {
        var match = searcher.exec(unicode_names_string);
        if(!match) { break; }
        var name = match[0];
        var character = unicode_names_map[name];
        if(found_chars[character]) { continue; }
        found_chars[character] = true;
        var codepoint = character.codePointAt(0);
        // When HTMLing this, use <bdi> around the character, IIRC
        console.log("Possible match: " + character + ' ' + showCodePoint(codepoint) + ' ' + name);
        num_found++;
      }
      if(num_found === max_to_find) {
        console.log("And more unshown matches...");
      }
      return num_found !== 0;
}
annyang.registerCommand({
  exec: function(str) {
    var match = /^unicode (.*)$/i.exec(str);
    if(!match) { return false; }
    var possible_name = match[1].toUpperCase();
    if(!_.has(unicode_names_map, possible_name)) {
       var any_found = search_for_unicode_characters(possible_name);
       return (any_found ? [null, possible_name, null] : null);
    }
    return [null, possible_name, unicode_names_map[possible_name]];
  }},
  function(name, character) {
    if(character != null) {
      artificially_type(character);
    }
  },
  'unicode <unicode-character-name>');
      
function add_command(regex_or_str, fn) {
  var name = regex_or_str;
  if(_.isRegExp(regex_or_str)) {
    // make the name logged to the user be, arguably, a bit more
    // human-readable, while still being a valid regexp
    name = (regex_or_str.source
      .replace(/\(\?\:/g, '(') // bug: if (?: appears in a character class
      .replace(/([a-zA-Z0-9])\?/g, '[$1]?'));
  }
  console.assert(!_.has(added_commands, name));
  added_commands[name] = true;
  //var cmds = {};
  if(_.isRegExp(regex_or_str)) {
    /*var adjustedRegex = new RegExp('^' +
      regex_or_str.source
        .replace(/{number}/g, '(?:(?:-|negative|minus|dash|hyphen)? ?[0-9]+|a|one|two|to|too|three|for|four|completely|every|infinit[yei]|all)')
        .replace(/{through}/g, '(?:-|to|two|too|2|through|thru)')
      + '$', 'i');*/
    //cmds[name] = {
    //  regexp: adjustedRegex,
    //  callback: fn
    //};
    annyang.registerCommand(regex_or_str, fn, name);
  } else {
    // TODO use/put in a look up table instead for speed
    // I suppose I could examine regex source to see if I can turn regex into plain...
    // also regex with just parens (even capturing ones) and | and ?, which
    // is a lot of them, can be broken up into say half a dozen individual
    // strings, which is way better from look-up-table point of view
    //cmds[name] = fn;
    added_literal_commands[name] = fn;
  }
  //annyang.addCommands(cmds);
}
/*
bililiteRange.bounds.EOF = function() {
};
bililiteRange.bounds.BOF = function(){
};*/
// we'll want:
// most-recent selection range, for retrospective commands like "no cap that" / "no space that"
//  var commands = {
  // TODO: probably a list of regexps that I add one by one
  // with ^$ implicitly added and i by default?
  // is better than this arrangement

  // Hmm what about language specific keywords. Getting "decltype" recognized
  // is hard, but at least ones that are words...
  add_command('hello world alert box', function() { alert('Hello world!'); });
    // TODO a different undo implementation?
  add_command('undo that', function() { document.execCommand('undo'); });
    // Some of these phonetic alphabet words are spelled the way
    // en-US speech recognition will produce them, like "alpha",
    // instead of the NATO-phonetic-alphabet-standard spelling of "alfa".
    // Annyang's matching is case-insensitive, so we thankfully don't
    // have to decide whether the speech recognition will capitalize them.
  add_command('alpha', function() { artificially_type('a'); });
  add_command('bravo', function() { artificially_type('b'); });
  add_command('charlie', function() { artificially_type('c'); });
  add_command('delta', function() { artificially_type('d'); });
  add_command('echo', function() { artificially_type('e'); });
  add_command('foxtrot', function() { artificially_type('f'); });
  add_command('golf', function() { artificially_type('g'); });
  add_command('hotel', function() { artificially_type('h'); });
  add_command('india', function() { artificially_type('i'); });
  add_command('juliette', function() { artificially_type('j'); });
  add_command('kilo', function() { artificially_type('k'); });
  add_command('lima', function() { artificially_type('l'); });
  add_command('mike', function() { artificially_type('m'); });
  add_command('november', function() { artificially_type('n'); });
  add_command('oscar', function() { artificially_type('o'); });
  add_command('papa', function() { artificially_type('p'); });
  add_command('quebec', function() { artificially_type('q'); });
  add_command('romeo', function() { artificially_type('r'); });
  add_command('sierra', function() { artificially_type('s'); });
  add_command('tango', function() { artificially_type('t'); });
  add_command('uniform', function() { artificially_type('u'); });
  add_command('victor', function() { artificially_type('v'); });
  add_command('whiskey', function() { artificially_type('w'); });
  add_command('x-ray', function() { artificially_type('x'); });
  add_command('yankee', function() { artificially_type('y'); });
  add_command('zulu', function() { artificially_type('z'); });
  add_command('underscore', function() { artificially_type('_'); });
  add_command('tilde', function() { artificially_type('~'); });
  add_command('backtick', function() { artificially_type('`'); });
  add_command('exclamation mark', function() { artificially_type('!'); });
  add_command('at sign', function() { artificially_type('@'); });
  add_command('hashtag', function() { artificially_type('#'); });
  add_command('dollar sign', function() { artificially_type('$'); });
  add_command('percent', function() { artificially_type('%'); });
    // speech recognition finds 'carrot' and 'carat' and stuff
    // before 'caret', so match 'carrot' instead of 'caret':
  add_command('carrot', function() { artificially_type('^'); });
  add_command('ampersand', function() { artificially_type('&'); });
  add_command('asterisk', function() { artificially_type('*'); });
    // TODO: 'brackets' to type [] and put the cursor in the middle?
  add_command(/^(left|right) paren(thesis|theses)?$/i, function(lr) {
      artificially_type(lr === 'left' ? '(' : ')');
    });
  add_command(/^(left|right) (square ?)bracket$/i, function(lr) {
      artificially_type(lr === 'left' ? '[' : ']');
    });
  add_command(/^(left|right) (brace|curly brace|curly brackets?|flower ?brackets?)$/i, function(lr) {
      artificially_type(lr === 'left' ? '{' : '}');
    });
  add_command(/^forward ?slash$/i, function() { artificially_type('/'); });
  add_command(/^back ?slash$/i, function() { artificially_type('\\'); });
  add_command(/^less than( sign)?|left angle (brace|bracket|paren(thesis|theses))$/i, function() { artificially_type('<'); });
  add_command(/^greater than( sign)?|right angle (brace|bracket|paren(thesis|theses))$/i, function() { artificially_type('>'); });
  add_command('greater than or equal to', function() { artificially_type('>='); });
  add_command('less than or equal to', function() { artificially_type('<='); });
  add_command(/^double equals?( sign)?|equals? equals?$/i, function() { artificially_type('=='); });
  add_command(/^(triple|treble) equals?( sign)?|equals? equals? equals?$/i, function() { artificially_type('==='); });
    // hmm if I make a "not equals" command then is it != or the less common
    // ~= and /= ?.....
  add_command(/^exclamation( mark)? equals?( sign)?$/i, function() { artificially_type('!='); });
  add_command(/^exclamation( mark)? (double|triple|treble|equals?( sign)?) equals?( sign)?$/i, function() { artificially_type('!=='); });
  add_command('colon', function() { artificially_type(':'); });
  add_command('semicolon', function() { artificially_type(';'); });
  add_command(/^single (quote|quote mark|quotation mark)|apostrophe$/i, function() { artificially_type('\''); });
  add_command(/double (quote|quote mark|quotation mark)/, function() { artificially_type('"'); });
  add_command(/^(left|right) single (quote|quote mark|quotation mark)$/i, function(lr) { artificially_type(lr == 'left' ? '‘' : '’'); });
  add_command(/^(left|right) double (quote|quote mark|quotation mark)$/i, function(lr) { artificially_type(lr == 'left' ? '“' : '”'); });
    // haha what if I downloaded a database of formal Unicode character names and
    // recognized things like LEFT-POINTING DOUBLE ANGLE QUOTATION MARK.
    // I would need to hack annyang to be able to do a table lookup, or like,
    // to take a function as an alternative to regex, to be at all reasonably efficient.
    // I get [" left pointing double angle quotation mark", " left pointing double angle quotation marks", " left pointing double angle quotation Mac", " left pointing double angle quotation Mack", " lift pointing double angle quotation mark"]
    // so after stripping spaces and lowercasing...
    // Include any unicode name strings in forms with the hyphens replaced with spaces and/or nothing?
    //
    // Maybe prefix them with "unicode" or "u+" for by-hex-number
    // at least if they are too short
  add_command(/^(left|right) (chevron|guillemet)$/i, function(lr) { artificially_type(lr == 'left' ? '«' : '»'); });
  add_command(/^double (left|right) angle( (brace|bracket|paren|quote|quotation( mark)?))?$/i, function(lr) { artificially_type(lr == 'left' ? '«' : '»'); });
    // hey Eli what is the prefix Dragon uses to say "don't treat the
    // following thing as a command"?  Also: What about replacing parts of a sequence?
    // I'll need the phonetic alphabet factored outta here
    // but also as commands so they're recognized better when possible ?
    // dictate, dictation, literal, transcribe, prose...
  add_command(/^dictate (.*)$/i, function(text) { artificially_type(text); });
  // TODO these should probably use 'hilarious.editor' instead of 'activeElement',
  // at least if the current element is not a textarea?
  add_command(/^(?:go|move) ?to (?:line |9:)?([0-9]+)$/i, function(line) {
    bililiteRange(editedElement()).line(line).bounds('startbounds').select();
  });

/*
  // <words> optional wrapper "the phrase <words>"
  // the next three identifiers?
  // select through the next <words>
  // select [through] [the next] <words>
  // move past the
  // go forward _ _
  // insert after __ (go(to)|move(to) after)   (after|before|past)--past is whatever direction the phrase says
  // insert before __
  // copy __
  // Ah! have the previous affected area have a background
  // (if there is no actual selection)
  // "that"
  // "this"
  // "the selection"
  // next/last/previous/current
  // delete the word (Dragon) === delete the current word, so.
  // delete the (current)? (word|line)[s]?
  // "dictate that"
  // "no command that"
  // "no cap that" / "decapitalize that" / "camelcase that" /
  // "that's not a command"
  // literal? verbatim?
  // matching parenthesis/es  enclosing
  // "select all" but "delete all"? "[select/delete] from beginning to end"

  // s/number/count? yeah
  // n--- explicit capture--- using it here--
  // precede any with "through" to mean merge current selection with that
  // or "after" or "before" to mean the begin/end of it,
  // or "past" to mean the far side from the current selection if that makes sense? it may not.
  //   the opposite: "proximally to". lol.
  // for "line N", is that the whole line, or begin/end/whatever, how do I disambiguate?
  // maybe "select/delete" vs "go/move to"?
  // "row" because the speech recognizer doesn't understand me saying "line" often
    // Find a way to present the position syntax to a user.
  var cursorRelatedCommand = "{action} {position}"
  var actions =
    side = "(before|after|(at )?the beginning of|(at )?the end of)"
    "(go|move) ?to( (?<moveToSide>{side}))?"
    "insert (?<moveToSide2>{side})"
    // 
    // Is "search for" a reasonable synonym for searchy uses of "select"?
    // "search next" "search previous"?
    // "cut" - dangerousish - hey I can implement a within-app clipboard stack.
    // For data sources, "clipboard item 12", so:
    // "paste clipboard item 12"
    // "copy clipboard item 12"
    // delete; cut; not sure about select or go to... I guess there's no reason not to go edit them?? lol
    // also how are they numbered when a system action changes the clipboard; does that move things?
    // is it a ring buffer, or an annoying oft-renumbering queue, or?
    // I suppose if a ring buffer, *numbering* sounds confusing but I could
    // make it lettered "clipboard item A/Alpha", etc.
    // Maybe also "clipboard item containing ____searchterm____"? (which could have even more hidden history
    // if I want, though I probably don't want)
    // maybe "clipboard A" because "clipboard item" is silly long
    // so:
    // ring buffer; "paste clipboard J"; current position of ring-buffer
    // which is the default one to be pasted is brightly hilighted? hm.
    // Or is brought to the top and the letters are moved around.
    // Hm both of those are also potential to confuse.
    // Oh this reminds me of Eli wanting quick commands that *don't* randomly go away,
    // like decltype (and maybe commands? like "search for decltype" if necessary?
    // That could also be a part of the "you can edit/do your previous command" system~~~
    // So:
    // some board items are "pinned" because you pinned them
    // there are some slots for recent commands, some for recent clipboards,
    // you can maybe scroll each of those back somewhat more if you want (maybe).
    // LRU? frecency?
    // they get one line with ellipsis; when you're editing one, it gets a few more lines if needed (3?)
    // they are saved persistently (er, what about passwords??? hm.)
    // and maybe can be saved for different "profiles"/dirs/files/file extensions???
    // you can name them whatever you want rather than a/b/c
    // you can have extras there isn't room for on the screen
    // "macro"/"alias"/"custom command"(though just a literal string not
    // regex... unless I *let* you name them regexes or even use eval'ed
    // js... though that is RISKY because people might share their
    // macros and they could hack people's computers)
    // "(pin|clipboard|command) (A|B|C..)"
    // "rename clipboard A"
    // "rename pin C"
    // "rename pin smorgasbord"
    // er.. maybe they should all always have a letter name too,
    // in case you name them something you can't say again.
    // possiblies "keyword declare type" "keyword declare val"
    // name format regex or plain (can it auto switch? hm. it's not like you can actually use
    // many of the regex symbols by speaking very easily, so: probably!)
    // Name as well as regex, or? What about js function matching (nevermind)?
    // What about creating your own regex shortcuts (eh).
    // <input type="text" name="cardname1" value="clipboard A">
    // <textarea id="cardcontents1">dictate
    // "You"+"Are"="Great"
    // is probably not much of an equation.</textarea>
    //
    // show/edit builtin commands as cards
    // hide them, maybe, if you want, but always be able to access with "hilarious builtin command _____"
    // For the cards, how to differentiate ones that are literal text to paste, vs commands?
    // Should "clipboard" ones be marked specially? Tweaked to start with "dictate" if they would
    // be a command? Should they all be plain old text by default and uh.... be a command if
    // they start with "command" (that doesn't really make sense)..?
    // Also watch out for pasting something into one of them: make sure that isn't a
    // hacking vector if the paste buffer has something weird in it.
    // Maybe CSS it up so that if the card contents start with "dictate " then that part of their contents
    // is a different background-color.  This might look odd for multi line cards in expanded form..
    // maybe then show it as "dictate\n"? (and make sure the "dictate" command accepts that alternate
    // space character after it). Or instead shrink the "dictate" to a similarly-colored triangle in
    // the top left corner of the area, that takes up no space (e.g. position:absolute, and possibly
    // even not-clickable), if it's okay that it can't be edited away?? probably not ok. but probably
    // is ok for multi line dictate to canonically use "dictate\n".
    //
    // Ability to export your set of cards to a well formatted Javascript file
    // that can be included in the editor, even upstream, if everyone desires.
    "(?<selectionRelatedAction>select|delete|copy|cut)( through(?<selectThroughSide>( {side})?))?"
    // camel case (position, e.g. "that")
    // cap camel case
    // snake case
    // cap snake case
    // all cap snake case
    // cap the character
    // no cap the character
    // cap the previous T
    // cap the previous HTTP
    // [presumably, searches should be insensitive to capitalization and
    // words being separated by (_|-| |) at least]
    // that | the previous (identifier | phrase | utterance)
  var positions =
    // first/second/third/....fifty-second/....?
    number = "((-|−|negative|minus|dash|hyphen)? ?[0-9]+|a|one|two|to|too|three|for|four|infinit[yei]|every|all)"
    through = "(-|to|two|too|2|through|thru)"
    dollars = "((\$|dollars?) ?(sign)?)"
    // vim "help *" calls identifiers "keywords"
    unit = "(letters?|characters?|identifiers?|keywords?|tokens?|symbols?|words?|lines?|rows?)"
    // TODO make the user of paren be able to disambiguate which nearest parenthesis was meant
    // by which word was used
    paren = "(parenthesis|parentheses|brackets?|braces?|quotes?|quotation( mark)?s?)"
    //"(?<relativeUpDownDirection>down|up)(?<relativeUpDown> {number})?(:? lines?)?"
    //"lines? (?:from )?({number}|begins?|starts?) {through} ({number}|end|(?:(?:\$|dollars?) ?(?:sign)?))"
    // zero-width referent only:
    // (hmm does it want us to try to match the current selection indentedness, or go to begin?end?)
    "(?<upDownDirection>down|up)(?<relativeUpDown> {number})?( (lines?|rows?))?"
    // may include selections with positive sizes:
    "(row |line |9:)?(?<lineNumber>{number})"
    // almost definitely a positive size:
    "(lines?|rows?) (from )?(?<fromLine>{number}|begins?|starts?) {through} (?<toLine>{number}|end|{dollars})"
    "(?<selection>(the )?selection|this)"
    "(?<recentarea>that)"
    // "the [current] character" doesn't make a lot of sense
    // but i guess it's alright
    // also "delete the three letters"... does that fail if
    // there are a different number of them selected? or what?
    // maybe you can only use numbers for forward/back.
    // how about "the words here"
    "the (current |present )?(?<unitHere>{unit})( here)?"
    "the (?<forwardBackDirection>next|last|previous|prior)(" +
      "(?<relativeMovementAmount> {number})? (?<relativeMovementUnit>{unit})|" +
      // this / the selected ___? / the selection?? / copy of line 13???
      // that's: a little too obscure a use to go to much effort for,
      // unless someone wants it.
      // All this should be omittable if the user just did a search,
      // in order to repeat the same settings, though I'm not sure
      // whether that should be a sub-case of this or a separately
      // listed syntax. (And, the state should be shown in a corner.)
      //
      // What about "whole word" vs. not, ignorecase, settings? (If ignoring those
      // settings, then the selection will then make even a 'characters' unit work..)
      //
      // with "select the next", I'm worried about that accidentally being done
      // by users whose last word got swallowed ("select the next word") so limiting
      // that a bit by (?= .), hm.
      "(?= .)( (one|1|copy))?( of ((this|the selection)|(this|the selected) (?<searchForTheSelectedUnit>{unit})))?|" + // unit defaults to identifier? vim "*"/"#".
      " ((literal|verbatim|dictate|search|find) )?(?<words>.*))"
    // vim "*"?
    // Note that matching paren ideally pays some attention to tokens.
    // Parens in quotes or comments, and/or backslashed (watch out
    // for backslashed quotes too), might be different.  For now
    // don't tokenise for parens.  For matching quote, how does
    // it know which? I could change to "the previous quote"/"the
    // previous unbackslashed quote"; also what about ''' like python
    // Matching comment - eh.
    "the matching {paren}" // vim "%"
    // the third enclosing paren? hmm. enclosing|outer?
    "the enclosing {paren}"
    // the indentation of [selector]? or is that too hard.
    // "go to after the indentation of line 47"
    "the indentation"
    // the other part of the line might be called "the content"
    // but that name isn't as clear and I also don't know why you want
    // to select it (copying, maybe -- in which case you don't want
    // the trailing whitespace either)
*/
  add_command(XRegExp("^(?:go|move) (down|up)( {number})?(:? lines?)?$", 'i'),
    function(dir, count) {
      count = parse_spoken_count(count);
      var el = editedElement();
      var currentLine = bililiteRange(el).bounds('selection').line();
      var targetLine = ((dir === 'down') ?
                          (currentLine + count) :
                          (currentLine - count));
                          console.log(targetLine);
      bililiteRange(el).line(targetLine).select();
    });
  //var location_desc =
  add_command(/^page ?down$/i, function() {
    hilarious.page_updown(true);
  });
  add_command(/^page ?up$/i, function() {
    hilarious.page_updown(false);
  });
  add_command(/^select lines? (?:from )?([0-9]+|begins?|starts?) (?:-|to|two|too|2|through|thru) ([0-9]+|end|(?:(?:\$|dollars?) ?(?:sign)?))/,
    function(beginline, endline) {
      if(/^(?:begin|start)/.test(beginline)) {
        beginline = 1;
      }
      var end;
      if(/^(?:end|\$|dollar)/.test(endline)) {
        end = bililiteRange(editedElement()).bounds('all').bounds('endbounds');
      } else {
        end = bililiteRange(editedElement()).line(endline).bounds('line');
      }
      bililiteRange(editedElement()
        ).line(beginline).bounds('line').expandToInclude(end).select();
    });
  //delete the last N ___s
//  add_command(/select (?:from (.*) (?:to|two|too|2) (.*))/,
//  add_command('spell *characters', function(chars) {
     // TODO
     // hmm, spelling with regular letter-sounds not NATO phonetic alphabet,
     // seems to be working fine without "spell" although sometimes inserting
     // spaces (not sure why)
//    });
    //camelCase/CamelCase/under_scores/Under_Scores/UNDER_SCORES?
  //  '(in|de)dent block( :n (spaces|tabstops))': {
  //    regexp: /^(indent|dedent|unindent) block(?: (-?[0-9]+) (spaces|tabstops))$/,
  // You have to say more than one word, but otherwise all the parts are optional.
  // TODO: when dedenting (and indenting?) by tabstops, if it's currently
  // an odd amount of indentation, should I align it?
  // "dedent (completely|infinite|infinity|all)"
  add_command(
    // /^(indent|dedent|didn't|de? ?indent|unindent)s?(?= )(?: block)?(?: ({number}))?(?: (spaces?|tabs? ?(?:stops?|steps?|tabs?)))?$/i
    XRegExp("^(indent|dedent|didn't|de? ?indent|unindent)s?(?= )(?: block)?(?: ({number}))?(?: (spaces?|tabs? ?(?:stops?|steps?|tabs?)))?$", 'i'),
      function(type, count, unit) {
        count = parse_spoken_count(count);
        if(unit == null) {
          unit = 'tabstops';
        }
        if(/^space/.test(unit)) {
          unit = 'spaces';
        } else if(/^tab/.test(unit)) {
          unit = 'tabstops';
        }
        if(/^indent/.test(type)) {
          type = 'indent';
        } else {
          count = -count;
          type = 'indent';
        }
        var range = bililiteRange(editedElement()).bounds('selection');
        if(count > 0) {
          var tab = ((unit === 'spaces') ? ' ' : tab_spaces);
          range.indent(tab.repeat(count)).select();
        } else if(count < 0) {
          var dentwidth = ((unit === 'spaces') ? 1 : num_tab_spaces);
          range.unindent(-count, dentwidth).select();
        }
      });
//    'backspace': {
//    },
  // <words> optional wrapper "the phrase <words>"
  // the next three identifiers?
  // select through the next <words>
  // select [through] [the next] <words>
  // move past the
  // go forward _ _
  // insert after __ (go(to)|move(to) after)   (after|before|past)--past is whatever direction the phrase says
  // insert before __
  // copy __
  // Ah! have the previous affected area have a background
  // (if there is no actual selection)
  // "that"
  // "this"
  // "the selection"
  // next/last/previous/current
  // delete the word (Dragon) === delete the current word, so.
  // delete the (current)? (word|line)[s]?
  // "dictate that"
  // "no command that"
  // "no cap that" / "decapitalize that" / "camelcase that" /
  // "that's not a command"
  add_command(
    XRegExp('^(select|select through|delete|) the (next|last|previous)(?: ({number}))? (characters?|words?|lines?)$', 'i'),
      function(action, dir, count, type) {
        count = parse_spoken_count(count);
        var backwards = (dir !== 'next');
        if(count < 0) {
          //count = -count;
          //backwards = !backwards;
          // actually, return because this negatives doesn't make enough
          // sense I think.  Should I show the user an error message?
          return;
        }
        var nowrap = true;
        var base_re;
        var re;
        var re_flags = '';
        // This rest_of_file_re doesn't work because the way bililiteRange
        // implements backwards regex searching, it doesn't know to stop the
        // greedy * at the current cursor position.  I don't know
        // any way to do that either for general regex, short of
        // slicing the file text and hoping the regex didn't use
        // any lookahead assertions that are affected.
        //var rest_of_file_re = (backwards ? /^[\S\s]*/ : /[\S\s]*$/);
        if(count !== Infinity) {
          if(/^character/.test(type)) {
            base_re = /[\S\s]/.source;
          } else if(/^word/.test(type)) {
            console.log("TODO improve word-based selection");
            base_re = /(?:[\s,]*(?:\b[a-zA-Z']+\b|.)[\s,]*)/.source;
          } else if(/^line/.test(type)) {
            base_re = /(?:^[^\n]*\n)/.source;
            re_flags = 'm';
          }
          re = new RegExp('(?:'+base_re+'){'+count+'}', re_flags);
        }
        var range = bililiteRange(editedElement()).bounds('selection'
          ).bounds(backwards ? 'startbounds' : 'endbounds');
        if(/^word/.test(type)) {
          //var prevrange = range.clone();
          var prevchar = range.bounds()[0] + (backwards ? 1 : -1);
          range.bounds([prevchar, prevchar]).find(/(?![a-zA-Z'])/);
          if(!range.match) {
            range.bounds(backwards ? 'start' : 'end');
          }
        } else if(/^line/.test(type)) {
          range.bounds(backwards ? 'BOL' : 'EOL');
        }
        if(count !== Infinity) {
          // TODO for fixing backwards:
          // It should be able to select from before-start to exactly-start.
          // It should select the first match that ends the latest, I guess,
          // to be greedy.
          range.find(re, nowrap, backwards);
        }
        if(!range.match || count === Infinity) {
          range.expandToInclude(range.clone().bounds(backwards ? 'start' : 'end'));
        }
        if(action === 'delete') {
          range.text('', 'end');
        }
        range.select();
      });
  add_command(/^space ?bar$/i, function(){ artificially_type(' '); });
    // unfortunately, annyang passes the string to str.trim() before we
    // match it, and that trims the newline character it contains...
    // so, as a hack, match the empty string to match that:
    //'newline': { regexp: /^$/, callback: function(){console.log("newline7");} }
  add_command(/^(?:newline|\n|)$/i, function(){ artificially_type('\n'); });
//    '': function(){console.log("newline6");}
//    'newline': { regexp: /^ *[\r\n↵x]+ *$/, callback: function(){console.log("newline5");} }
/*    '\n': function() {console.log("newline1");},
    '↵': function() {console.log("newline2");},
    ' \n': function() {console.log("newline3");},
    ' ↵': function() {console.log("newline4");}*/
//  };

// open, load,
  if(hilarious.use_chrome_filesystem) {
    add_command(/^edit (?:(?:a|an|another) )?directory$/i, function(){
      hilarious.askUserToOpenEditableDirectory(false);
    });
  }
  //annyang.addCommands(commands);
  annyang.setLanguage('en-US');
  annyang.addCallback('result', function(texts) {
    window.txts = texts;
    console.log('texts', texts);
  });
  annyang.addCallback('resultNoMatch', function(texts) {
    console.log('showing', texts);
  });
  annyang.start();


var tests = [
  ['ab|cd', 'hotel', 'abh|cd'],
  ['ab^c$d', 'dictate q', 'abq|d'],
];
var parseCursorPosStr = function(str) {
  // special chars =, |, ^, $
  // | means begin and end selection
  // ^ means begin selection
  // $ means end selection
  // =. means literal ., so =| means pipe, == means =, etc.
  //    (= not \ so that string escaping is less confusing than \\\\)
  var dullTokens = '(?:[^=|^$]|=[=|^$])*';
  var validre = new RegExp('^(' + dullTokens + ')(?:[\\^](' + dullTokens +
                                          ')[$]|[|])(' + dullTokens + ')$');
  var match = validre.exec(str);
  console.assert(match);
  var deescape = function(s) { return s.replace(/=(.)/g, '$1'); };
  var beforeCursor = deescape(match[1]);
  var withinCursor = deescape(match[2] || '');
  var afterCursor = deescape(match[3]);
  var cursorStart = beforeCursor.length;
  var cursorEnd = beforeCursor.length + withinCursor.length;
  var text = beforeCursor + withinCursor + afterCursor;
  return {
    text: text,
    beforeCursor: beforeCursor,
    withinCursor: withinCursor,
    afterCursor: afterCursor,
    cursorStartAndEnd: [cursorStart, cursorEnd],
  };
};
var makeCursorPosStr = function(text, cursorStartAndEnd) {
  var reescape = function(s) { return s.replace(/([=|^$])/g, '=$1'); };
  var beforeCursor = reescape(text.slice(0, cursorStartAndEnd[0]));
  var withinCursor = reescape(text.slice(cursorStartAndEnd[0], cursorStartAndEnd[1]));
  var afterCursor = reescape(text.slice(cursorStartAndEnd[1]));
  var cursorCharStart = (withinCursor ? '^' : '|');
  var cursorCharEnd = (withinCursor ? '$' : '');
  var str = beforeCursor + cursorCharStart + withinCursor + cursorCharEnd + afterCursor;
  return str;
};
var runTextareaTest = function(test) {
  var start = parseCursorPosStr(test[0]);
  var commands = test[1];
  if(!_.isArray(commands)) {
    commands = [commands];
  }
  var end = parseCursorPosStr(test[2]);
  var textarea = document.createElement('textarea');
  textarea.value = start.text;
  document.body.appendChild(textarea);
  textarea.focus();
  bililiteRange(textarea).bounds(start.cursorStartAndEnd).select();
  _.each(commands, function(command) {
    annyang.runCommand(command);
  });
  var actualEndText = textarea.value;
  var actualEndSelection = bililiteRange(textarea).bounds('selection').bounds();
  if(actualEndText === end.text &&
      actualEndSelection[0] === end.cursorStartAndEnd[0] &&
      actualEndSelection[1] === end.cursorStartAndEnd[1]) {
    console.log("Test passes!", test);
  } else {
    console.error("Test fails!", test,
      "actual result (as str showing cursor pos):",
      makeCursorPosStr(actualEndText, actualEndSelection));
  }
  document.body.removeChild(textarea);
};
// always? what if that's slow, or confuses an accessibility technology
setTimeout(function() {
  var oldActiveElement = document.activeElement;
  _.each(tests, function(test) {
    runTextareaTest(test);
  });
  oldActiveElement.focus();
}, 100);

}());
