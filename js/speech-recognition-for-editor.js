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
XRegExp.addToken(
  /{unit}/,
  function() {return '(?:letters?|characters?|identifiers?|keywords?|tokens?|symbols?|words?|lines?|rows?|paragraphs?|graphemes?|codepoints?|sentences?|parenthesized expressions?|statements?|comments?|strings?)';}, // hmm maybe some of these are getting out of hand
  {leadChar: '{'}
);
// Require there is space separating words here,
// but don't require two spaces for "{ }{ }" or any spaces for "{ }"
// at beginning/end of match.
XRegExp.addToken(
  /{ }/,
  function() {return '(?=(?: |^|$)) *';},
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
// TODO what if the activeElement isn't supposed to be editable?
// Like, if nothing is focused, which may mean <body> is?
// Try to make it so you don't edit the DOM when nothing is selected
// It could use some more refinement:
// what if a checkbox is selected? not editable plz
// but on the other hand:
// what if a contentEditable area is selected?
// (what's the best way to detect that?)
// And should we send synthetic keydown/up events, too?
// That might be helpful for key-navigated sites, even if
// we're pointed at an un-editable part of the DOM, and
// miiiight make it work with fancy editor things like CodeMirror.
var editedElement = function() {
  //return artificiallyEditedElement || document.activeElement;
  var el = document.activeElement;
  if(el.nodeName.toLowerCase() === 'body') {
    el = null;
  }
  return el;
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
  var el = editedElement();
  if(el === null || el.nodeName.toLowerCase() === 'body') {
    return;
  }
  var selection = bililiteRange(el).bounds('selection');
  if(text == '\n') {
    selection.insertEOL().select();
  } else {
    selection.text(text, 'end').select();
  }
}
var added_commands = {};
var added_literal_commands = {};
// TODO case-fold rather than lowercase
annyang.debug();
annyang.registerCommand('(literal match)', function(str, debug) {
      var normalizedstr = str.trim().toLowerCase();
      var matchfunc = added_literal_commands[normalizedstr];
      if(matchfunc) {
        if(debug) { console.log('literal:', normalizedstr); }
        return function(){matchfunc(normalizedstr);};
      } else {
        return null;
      }
    });
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
annyang.registerCommand('unicode <unicode-character-name>', function(str, debug) {
    var match = /^unicode (.*)$/i.exec(str);
    if(!match) { return false; }
    var possible_name = match[1].toUpperCase();
    if(_.has(unicode_names_map, possible_name)) {
      var character = unicode_names_map[possible_name];
      if(debug) { console.log('found unichar', possible_name, character); }
      return function() { artificially_type(character); };
    } else {
       var any_found = search_for_unicode_characters(possible_name);
       if(any_found) {
         if(debug) { console.log('guesses listed for', possible_name); }
         return function() {};
       } else {
         return null;
       }
    }
  });


// brainstorm idea: examing regex source to see if I can turn regex into
// a small number of string matches:
// regex with just parens (even capturing ones) and | and ?, which
// is a lot of them, can be broken up into, say, half a dozen individual
// strings, which is way better from look-up-table point of view.


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
  if(_.isRegExp(regex_or_str)) {
    var regexp = regex_or_str;
    var matchObj = regexp.xregexp && /n/.test(regexp.xregexp.flags);
    if(matchObj) {
      annyang.registerCommand(name, function(str, debug) {
        var match = XRegExp.exec(str, regexp);
        if(match) {
          if(debug) { console.log('regex:', match); }
          return function() { fn(match); };
        } else {
          return null;
        }
      });
    } else {
      annyang.registerCommand(name, function(str, debug) {
        var result = regexp.exec(str);
        if(result) {
          var parameters = result.slice(1);
          if(debug) { console.log('regex:', parameters); }
          return function(){ fn.apply(null, parameters); };
        } else {
          return null;
        }
      });
    }
  } else {
    added_literal_commands[name] = fn;
  }
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
*/
  add_command(XRegExp("^(go|move){ }(?<dir>down|up){ }(?<count>{number})?{ }(lines?)?$", 'in'),
    function(match) {
      var count = parse_spoken_count(match.count);
      var el = editedElement();
      var currentLine = bililiteRange(el).bounds('selection').line();
      var targetLine = ((match.dir === 'down') ?
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
    XRegExp("^(?<type>indent|dedent|didn't|de? ?indent|unindent)s?{ }(block)?{ }(?<count>{number})?{ }(?<unit>spaces?|tabs? ?(stops?|steps?|tabs?))?$", 'in'),
      function(match) {
        var count = parse_spoken_count(match.count);
        var unit = match.unit;
        if(unit == null) {
          unit = 'tabstops';
        }
        if(/^space/.test(unit)) {
          unit = 'spaces';
        } else if(/^tab/.test(unit)) {
          unit = 'tabstops';
        }
        if(!/^indent/.test(match.type)) {
          count = -count;
        }
        var range = bililiteRange(editedElement()).bounds('selection');
        if(count > 0) {
          if(count > 1000) {
            console.log("refusing to indent too much");
          } else {
            var tab = ((unit === 'spaces') ? ' ' : tab_spaces);
            range.indent(tab.repeat(count)).select();
          }
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
  /*
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
  add_command(
    XRegExp(
      // delete through? or is that too dangerous
      // select through before ____? select after ___ to mean insert after ___?
      // maybe: hints to the user when they say something that's almost clear?

      '^(?<action>select|select (through|thru)|delete|delete (through|thru)|' +
        '(?<moveAction>(go|move) ?({through})?|((go|move) ?({through})?|insert) (?<moveActionSide>before|after|past))' +
        '){ }(' +

//        "(the)?{ }(?<forwardBackDirection>next|last|previous|prior|forwards?|back|backwards?|down|up){ }" +
        "(the)?{ }((?<forwards>next|forwards?|down)|(?<backwards>last|previous|prior|back|backwards?|up)){ }" +
          "(?<relativeMovementAmount>{number})?{ }(?<relativeMovementUnit>{unit})|" +
      ')$', 'in'),


      //'the (next|last|previous)(?: ({number}))? (characters?|words?|lines?)$', 'in'),
      //function(action, dir, count, type) {
      function(match) {
        // would it be useful to log these deductions?
        var action = match.action;
        var count = parse_spoken_count(match.count);
        var unit = match.relativeMovementUnit;
        var isSelect = /^select\b/.test(action);
        var isDelete = /^delete\b/.test(action);
        var isMove = /^go|move|insert/.test(action);
        var isThrough = !isMove && /\b(through|thru)$/.test(action);
        // search direction:
        var backwards = ((match.backwards || match.forwards) ? match.backwards :
                          match.moveActionSide === 'before');
        // is this the right default? does it depend on action,
        // e.g. "insert before the next two characters" uh doesn't actually
        // make a whole lot of usefulness but "insert before the next phrase foobar"
        // could, or "move to the next phrase foobar".
        var moveToSide = match.moveActionSide || 'past';

        var initialSelection = bililiteRange(editedElement()).bounds('selection');
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
          if(/^character/.test(unit)) {
            base_re = /[\S\s]/.source;
          } else if(/^word/.test(unit)) {
            console.log("TODO improve word-based selection");
            base_re = /(?:[\s,]*(?:\b[a-zA-Z']+\b|.)[\s,]*)/.source;
          } else if(/^line/.test(unit)) {
            base_re = /(?:^[^\n]*\n)/.source;
            re_flags = 'm';
          }
          re = new RegExp('(?:'+base_re+'){'+count+'}', re_flags);
        }
        var range = bililiteRange(editedElement()).bounds('selection'
          ).bounds(backwards ? 'startbounds' : 'endbounds');
        if(/^word/.test(unit)) {
          //var prevrange = range.clone();
          var prevchar = range.bounds()[0] + (backwards ? 1 : -1);
          range.bounds([prevchar, prevchar]).find(/(?![a-zA-Z'])/);
          if(!range.match) {
            range.bounds(backwards ? 'start' : 'end');
          }
        } else if(/^line/.test(unit)) {
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
        if(isThrough) {
          range.expandToInclude(initialSelection);
        }
        if(isMove) {
          if(moveToSide === 'before') {
            range.bounds('startbounds');
          } else if(moveToSide === 'after') {
            range.bounds('endbounds');
          } else if(moveToSide === 'past') {
            if(range.bounds()[1] < initialSelection.bounds()[1] ||
              (range.bounds()[1] === initialSelection.bounds()[1] &&
               range.bounds()[0] < initialSelection.bounds()[0])
            ) {
              range.bounds('startbounds');
            } else {
              range.bounds('endbounds');
            }
          }
        }
        if(isDelete) {
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
  annyang.setLanguage('en-US');
  annyang.addCallback('result', function(texts) {
    window.txts = texts;
    console.log('texts', texts);
  });
  annyang.addCallback('resultNoMatch', function(texts) {
    console.log('showing', texts);
  });
  annyang.start();


  // <words> optional wrapper "the phrase <words>"
  // the next three identifiers? letters(unicode class{what about combining characters?? then again what happens if "select the next character" selects an e without its acute??}), symbols(unicode classes,..), token (lang dependent :/),
  // biggest deal i can think of with token incompat is...
  // comments, well never mind...
  // tokens with dashes, vs subtraction. Maybe can guess from context?
  // bigword:
  //   font-family:
  //   class="a-b c-d e-f"
  //   word-break: break-word
  // smallword:
  //   (ax-b)
  //   a[i]-b[i]
  // "The sentence" -- hm detecting common abbreviations and/or "  "; also quotations that contain .s
// AHA this should be CSV/TSV so I can also edit it in a graphical way??
// commands separated by ; for this then that and ; for first recognition result and second recognition result?
// chars that recognition won't produce: I need two of them
// >>
// ||
// Should the user be able to say "then"?
// what if they say it as part of a "the phrase" and or "dictate"?;"the code";"no magic space dictate"
// TSV makes sense but/and like can my editor insert tab characters... hopefully soon??
var tests = [
  ['ab|cd', 'hotel', 'abh|cd'],
  ['ab^c$d', 'dictate q', 'abq|d'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the next two words', 'lorem ipsum ^dolor sit$ amet, quod'],
  ['lorem ipsum ^dolor$ sit amet, quod', 'select the next two words', 'lorem ipsum dolor ^sit amet$, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select through the next two words', 'lorem ^ipsum dolor sit$ amet, quod'],
  ['lorem ipsum ^dolor$ sit amet, quod', 'select through the next two words', 'lorem ipsum ^dolor sit amet$, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'delete the next two words', 'lorem ipsum| amet, quod'],
  ['lorem ipsum ^dolor$ sit amet, quod', 'delete through the next two words', 'lorem ipsum|, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'go forward two characters', 'lorem ipsum d|olor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'go back two characters', 'lore|m ipsum dolor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'extend the selection forward two characters', 'lorem ^ipsum d$olor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select through forward two characters', 'lorem ^ipsum d$olor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select through the next two characters', 'lorem ^ipsum d$olor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the next two characters', 'lorem ipsum^ d$olor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'go back two characters', 'lore|m ipsum dolor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'go left', 'lorem |ipsum dolor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'go right', 'lorem ipsum| dolor sit amet, quod'],
  // is this worth the less accurate speech recognition options, even if I parse well?:
  ['lorem ^ipsum$ dolor sit amet, quod', 'go right then go back two characters', 'lorem ips|um dolor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'delete the word', 'lorem| dolor sit amet, quod'],
  ['\n^lorem$ ipsum dolor sit amet, quod', 'delete the word', '\n|ipsum dolor sit amet, quod'],
  ['lorem ip^s$um dolor sit amet, quod', 'delete the word', 'lorem| dolor sit amet, quod'],
  ['lorem ipsum| dolor sit amet, quod', 'delete the word', 'lorem| dolor sit amet, quod'],
  ['lorem |ipsum dolor sit amet, quod', 'delete the word', 'lorem| dolor sit amet, quod'],
  ['lorem^ $ipsum dolor sit amet, quod', 'delete the word', 'lorem^ $ipsum dolor sit amet, quod'], // special: not recognized, see if there is a similar recognition that is, maybe?
  ['lorem^ $ipsum dolor sit amet, quod', 'delete the words', '| dolor sit amet, quod'],
  ['lo^rem ip$sum dolor sit amet, quod', 'delete the word', 'lo^rem ip$sum dolor sit amet, quod'],
  ['lo^rem ip$sum dolor sit amet, quod', 'delete the words', '|dolor sit amet, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet', 'lorem ipsum dolor ^sit amet$, quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet comma', 'lorem ipsum dolor ^sit amet,$ quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet comma space', 'lorem ipsum dolor ^sit amet, $quod'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet quod', 'lorem ipsum dolor ^sit amet, quod$'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet comma quod', 'lorem ipsum dolor ^sit amet, quod$'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet comma space quod', 'lorem ipsum dolor ^sit amet, quod$'],
  ['lorem ^ipsum$ dolor sit amet, quod', 'select the phrase sit amet space quod', 'lorem ipsum dolor ^sit amet, quod$'],
  ['lorem ^ipsum dolor sit amet$, quod', 'select through the phrase sit amet', 'lorem ^ipsum dolor sit amet$, quod'],
  ['lorem ^ipsum dolor sit amet$, quod', 'select through sit amet', 'lorem ^ipsum dolor sit amet$, quod'],
  ['lorem ^ipsum dolor sit amet$, quod', 'select lorem', '^lorem$ ipsum dolor sit amet, quod'],
  // TODO what about soft-wrapped vs hard-wrapped lines? I should support commands
  // that refer to visual lines and test them with e.g. 80character lines(?)
  // "go to soft beginning of line"? "go to beginning of the soft line"?
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to start of line', 'lorem ipsum\n|dolor sit\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to the start of line', 'lorem ipsum\n|dolor sit\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to start of the line', 'lorem ipsum\n|dolor sit\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to the start of the line', 'lorem ipsum\n|dolor sit\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to beginning of line', 'lorem ipsum\n|dolor sit\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to the beginning of the line', 'lorem ipsum\n|dolor sit\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to end of line', 'lorem ipsum\ndolor sit|\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'go to the end of the line', 'lorem ipsum\ndolor sit|\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'select the end of the line', 'lorem ipsum\ndolor sit|\namet, quod'],
  ['lorem ipsum\ndolor s|it\namet, quod', 'select through the end of the line', 'lorem ipsum\ndolor s^it$\namet, quod'],
  ['lorem ipsum|', 'dictate dolor sit', 'lorem ipsum dolor sit|'],
  ['lorem ipsum |', 'dictate dolor sit', 'lorem ipsum dolor sit|'],
  ['lorem ipsum  |', 'dictate dolor sit', 'lorem ipsum dolor sit|'],
  ['lorem ipsum\n|', 'dictate dolor sit', 'lorem ipsum\ndolor sit|'], // hmm should there be anything about capitalization
  ['lorem ipsum \n|', 'dictate dolor sit', 'lorem ipsum \ndolor sit|'],
  ['lorem ipsum \n |', 'dictate dolor sit', 'lorem ipsum \n dolor sit|'],
  ['lorem ipsum\n |', 'dictate dolor sit', 'lorem ipsum\n dolor sit|'],
  ['lorem ipsum\n  |', 'dictate dolor sit', 'lorem ipsum\n  dolor sit|'],
  ['lorem| sit', 'dictate ipsum dolor', 'lorem ipsum dolor| sit'],
  ['lorem |sit', 'dictate ipsum dolor', 'lorem ipsum dolor| sit'], // i'm sceptical that it should move the cursor away from 'sit' like that?
  ['lorem | sit', 'dictate ipsum dolor', 'lorem ipsum dolor| sit'],
  ['lorem   |   sit', 'dictate ipsum dolor', 'lorem ipsum dolor| sit'],
  // one vs two spaces at end of sentence?? two spaces is easier to measure programmatically
  // but editors hate it. also do you want any auto capitalization/decapitalization.
  ['amet| consectetur', 'period', 'amet.|  consectetur'],
  ['amet| consectetur', 'full stop', 'amet.|  consectetur'],
  // programming does different things. For now, simply put the dot there I guess?
  // Although usually the dot has no space on either side.
  // Exceptions include Haskell dot-as-function-composition,
  // python "import x from .y"...
  // .. is part of unix paths
  // ... is ellipsis and also has unicode version, hm, should there be mode or policy for that
  // .... sometimes means "ellipsis that includes ending with an end-of-sentence"
  ['amet| consectetur', 'dot', 'amet.| consectetur'],
  ['amet |consectetur', 'dot', 'amet .|consectetur'],
  ['amet |consectetur', 'dot dot', 'amet ..|consectetur'],
  ['amet |consectetur', 'dot dot dot', 'amet ...|consectetur'],
  ['amet |consectetur', 'dot dot dot dot', 'amet ....|consectetur'],
  // luckily U+002C COMMA is used in about the same way in code as prose,
  // no space to the left, space or newline to the right.
  // Hmm I wonder if to make some of the tests have a "recently inserted stuff" markers too, for "that"
  // (or, I can add tests with "then select that")
  ['amet| consectetur', 'comma', 'amet,| consectetur'],
  ['amet |consectetur', 'comma', 'amet,| consectetur'],
  // Colon is a bit harder than comma but not bad for most uses.
  // Hash definition glues the : to the left like English.
  // Type annotation either glues to the left or puts spaces on both/neither side.
  // Haskell list constructor ":" is also symmetric. As is, usually,
  // the if/then/else "?:" operator.
  // I wonder.  If I can define most symbol spacing rules by a few variables.
  // And then come up with ways to customize them by voice and
  // in defaults.  "spacey colons"/"wordlike colons". "no space colons"
  // "preserve-space colons".  "left glue colons".
  // I haven't even yet written tests for how symbols interact with *each other* much.
  // I wonder if any Unicode-data has defaults for symbol spacing I could
  // use and make manual exceptions to...
  ['amet| consectetur', 'colon', 'amet:| consectetur'],
  ['amet |consectetur', 'colon', 'amet:| consectetur'],
  // double colon has spaces in Haskell type annotation
  // but no spaces in C++ namespacing... hmm.
  ['amet| consectetur', 'double colon', 'amet ::| consectetur'],
  ['amet |consectetur', 'double colon', 'amet ::| consectetur'],
  ['amet |consectetur', 'colon colon', 'amet ::| consectetur'],
  ['amet |consectetur', 'colons', 'amet ::| consectetur'],

  // math/programming (again, what about unicode timesing, division, subtraction)
  // maybe special add "unicode times/multiply", "unicode minus", "unicode divide"
  // and/or a mode
  ['amet |consectetur', 'times', 'amet *| consectetur'],
  ['amet |consectetur', 'multiply', 'amet *| consectetur'],
  ['amet |consectetur', 'multiplied by', 'amet *| consectetur'],
  ['amet|consectetur', 'times', 'amet *| consectetur'], // hmm or no spaces? you can say * if you want no spaces..
  ['amet |consectetur', 'divide', 'amet /| consectetur'],
  ['amet |consectetur', 'divided by', 'amet /| consectetur'],
  // percent/mod/rem/modulus/remainder/format(python)/...?
  // 100% but 100 % 13
  // also "mod" is a common enough word e.g. Haskell `mod` modulus
  // and Rust mod (module)
  ['amet |consectetur', 'percent', 'amet %| consectetur'],
  ['400 |consectetur', 'percent', '400%| consectetur'],
  ['amet|consectetur', 'percent', 'amet%|consectetur'], // hmm or spaces or?
  ['400|consectetur', 'percent', '400%|consectetur'],
  ['amet |consectetur', 'minus', 'amet -| consectetur'],
  ['amet |consectetur', 'subtract', 'amet -| consectetur'],
  //['amet |consectetur', 'subtraction', 'amet -| consectetur'],
  // Pointer deref is unlike multiplication:
  ['amet |consectetur', 'star', 'amet *|consectetur'],
  ['amet| consectetur', 'star', 'amet*| consectetur'],
  ['amet| consectetur', 'asterisk', 'amet*| consectetur'],
  ['amet | consectetur', 'star', 'amet *| consectetur'],
  ['amet|consectetur', 'star', 'amet*|consectetur'],
  ['amet  |  consectetur', 'star', 'amet  *|  consectetur'],
  ['amet| consectetur', 'slash', 'amet/| consectetur'],
  ['amet |consectetur', 'slash', 'amet /|consectetur'],
  // backslash is mainly used in computing in a spacing-sensitive
  // manner so definitely don't change space around it when inserting
  ['amet| consectetur', 'backslash', 'amet\\| consectetur'],
  ['amet | consectetur', 'backslash', 'amet \\| consectetur'],
  ['amet |consectetur', 'backslash', 'amet \\|consectetur'],
  ['amet | consectetur', 'double backslash', 'amet \\\\| consectetur'],
  ['amet | consectetur', 'two backslash', 'amet \\\\| consectetur'],
  ['amet | consectetur', 'quad backslash', 'amet \\\\\\\\| consectetur'],
  ['amet | consectetur', 'quadruple backslash', 'amet \\\\\\\\| consectetur'],
  ['amet | consectetur', '4 backslash', 'amet \\\\\\\\| consectetur'],
  // homophone
  ['amet | consectetur', 'for backslash', 'amet \\\\\\\\| consectetur'],
  // yes sadly 8 backslashes is needed sometimes.
  // I'll include 16 too, for good measure.
  // Maybe any number should work?
  // (I wonder how much anything would break if I allow any number for anything.)
  ['amet | consectetur', '8 backslash', 'amet \\\\\\\\\\\\\\\\| consectetur'],
  ['amet | consectetur', '8 backslashes', 'amet \\\\\\\\\\\\\\\\| consectetur'],
  ['amet | consectetur', 'octuple backslash', 'amet \\\\\\\\\\\\\\\\| consectetur'],
  ['amet | consectetur', '16 backslash', 'amet \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\| consectetur'],
  ['amet | consectetur', '13 backslash', 'amet \\\\\\\\\\\\\\\\\\\\\\\\\\| consectetur'],

  // exclamation marks vary in code AND in sentences! hmm.
  ['amet |consectetur', 'exclamation mark', 'amet!|  consectetur'],
  ['amet| consectetur', 'exclamation mark', 'amet!|  consectetur'],
  ['amet| consectetur', 'exclamation point', 'amet!|  consectetur'],
  ['amet| consectetur', 'exclamation', 'amet!|  consectetur'],
  // is this any good of a way to have it in code?, "bang"?
  // things it means includes "mutates stuff", "not", "array indexing(haskell)", strictness(haskell)
  ['amet |consectetur', 'bang', 'amet !|consectetur'],
  ['amet| consectetur', 'bang', 'amet!| consectetur'],
  ['amet |consectetur', 'bang bang', 'amet !!|consectetur'],
  ['amet| consectetur', 'bang bang', 'amet!!| consectetur'],
  ['amet |consectetur', 'double bang', 'amet !!|consectetur'],

  // question mark
  // https://english.stackexchange.com/questions/58014/is-there-an-alternative-one-word-name-for-the-question-mark
  ['amet |consectetur', 'question mark', 'amet?| consectetur'],
  ['amet |consectetur', 'question point', 'amet?| consectetur'],
  ['amet |consectetur', 'question sign', 'amet?| consectetur'],
  ['amet |consectetur', 'question symbol', 'amet?| consectetur'],
  ['amet |consectetur', 'interrogation point', 'amet?| consectetur'],
  ['amet |consectetur', 'interrogation mark', 'amet?| consectetur'],
  // I guess "hook" will do for the programmer's "don't change the spaces" version??
  ['amet |consectetur', 'hook', 'amet ?|consectetur'],
  ['amet |consectetur', 'hook sign', 'amet ?|consectetur'],

  // other ? ! related symbols
  ['amet |consectetur', 'interrobang', 'amet‽| consectetur'],
  ['amet| consectetur', 'inverted exclamation mark', 'amet |¡consectetur'],
  ['amet| consectetur', 'inverted question mark', 'amet |¿consectetur'],
  ['amet| consectetur', 'inverted interrobang', 'amet |⸘consectetur'],


  // no idea about @ and spaces. I guess the main use is for
  // email addresses and twitter handles so no spaces.
  // But don't delete spaces in case they were wanted? I guess?
  ['amet |consectetur', 'at sign', 'amet @|consectetur'],
  ['amet| consectetur', 'at sign', 'amet@| consectetur'],

  // ^ has various weird uses so don't dictate any particular
  // spacing around it.  It needs escaping with = in our special syntax.
  ['amet |consectetur', 'caret', 'amet =^|consectetur'],
  // people, including voice recognition, don't know how to spell caret
  // so accept the most common homophone
  ['amet |consectetur', 'carrot', 'amet =^|consectetur'],
  // and another common name
  ['amet |consectetur', 'hat sign', 'amet =^|consectetur'],


  // # often has a space before it but not after it,
  // in hashtags, idiomatic C preprocessor use, "#1".
  // Though when it is the line-comment symbol in code,
  // it usually has a space after it too, dunno.
  //
  // "#" is sometimes called "pound" but GBP £ is also
  // a symbol for pounds so that could get confusing.
  // (U+00A3 POUND SIGN).
  //
  // "#" is not a music sharp sign; that character
  // is U+266F MUSIC SHARP SIGN ♯.  Pedantically,
  // the programming language C♯ is written with
  // a sharp sign, but they accept that it is easier
  // for people to write C# so this has increased the
  // confusion.  Nevertheless, ♯ and ♭ should stay
  // whole, as there are plenty of other ways to say
  // #.
  ['amet |consectetur', 'hashtag', 'amet #|consectetur'],
  ['amet |consectetur', 'hash symbol', 'amet #|consectetur'],
  ['amet |consectetur', 'hash sign', 'amet #|consectetur'],
  ['amet| consectetur', 'hash sign', 'amet#| consectetur'], // I guess use this spacing??
  ['amet |consectetur', 'hash', 'amet #|consectetur'],
  ['amet |consectetur', 'hashtag symbol', 'amet #|consectetur'],
  //['amet |consectetur', 'pound sign', 'amet #|consectetur'],
  //['amet |consectetur', 'pound symbol', 'amet #|consectetur'],
  //['amet |consectetur', 'pound', 'amet #|consectetur'],
  ['amet |consectetur', 'number sign', 'amet #|consectetur'],
  ['amet |consectetur', 'octothorpe', 'amet #|consectetur'],
  // crosshatch, waffle, lots of other wikipedia-listed obscure names?
  // nah for now.

  // are there any spacing conventions? how are these used in
  // plaintext anyway?
  ['amet |consectetur', 'flat sign', 'amet ♭|consectetur'],
  ['amet |consectetur', 'sharp sign', 'amet ♯|consectetur'],
  ['amet |consectetur', 'music sharp sign', 'amet ♯|consectetur'],
  ['amet |consectetur', 'musical sharp sign', 'amet ♯|consectetur'],


  // $ is often a prefix. Should I do anything about that?
  // ($ is escaped by the = here from meaning something about
  // the selection.)
  ['amet |consectetur', 'dollar sign', 'amet =$|consectetur'],
  ['amet| consectetur', 'dollar sign', 'amet=$| consectetur'],
  ['amet |consectetur', 'dollar symbol', 'amet =$|consectetur'],

  // other similar currencies
  ['amet |consectetur', 'euro sign', 'amet €|consectetur'],
  ['amet |consectetur', 'euro symbol', 'amet €|consectetur'],
  // despite the ambiguity with #, I don't see a good other
  // way to write this, and GBP are important in English.
  ['amet |consectetur', 'pound sign', 'amet £|consectetur'],
  ['amet |consectetur', 'yen sign', 'amet ¥|consectetur'],
  // if I did anything with spaces and currencies, cents
  // would get a different convention
  ['amet |consectetur', 'cent sign', 'amet ¢|consectetur'],
  ['amet |consectetur', 'cents sign', 'amet ¢|consectetur'],

  // These are used as operators and parentheses so give different
  // names for each spacing.
  // Less than or equals sign has a good unicode version
  // and a conventional ASCII version and they are different.
  // What if I had a weird convention where "sign" meant ASCII
  // and "symbol" meant unicode?
  // I am growing to think that an EVIL MODE -
  // unicode on / unicode off
  // might be best.  Easy to fix unless you are doing a lot of
  // both like writing down a literal hashtable between
  // unicode and ascii versions ;-)
  // Default to unicode and show an info-bar saying how to switch? I guess?
  // Note that the equal signs have to be escaped with more equal signs.
  ['amet |consectetur', 'less than sign', 'amet <| consectetur'],
  ['amet |consectetur', 'less than or equal to sign', 'amet <==| consectetur'],
  ['amet |consectetur', 'less than or equals sign', 'amet <==| consectetur'],
  ['amet |consectetur', 'greater than or equal to sign', 'amet >==| consectetur'],
  ['amet |consectetur', 'greater than or equal to sign', 'amet >==| consectetur'],
  ['amet |consectetur', 'greater than sign', 'amet >==| consectetur'],
  ['amet |consectetur', 'less than or equal to or greater than sign', 'amet <==>| consectetur'],
  ['amet |consectetur', 'less or equal or greater sign', 'amet <==>| consectetur'],
  ['amet |consectetur', 'spaceship operator', 'amet <==>| consectetur'],
  // What are the names of the => and -> arrows in code?
  ['amet |consectetur', 'fat arrow', 'amet ==>| consectetur'],
  ['amet |consectetur', 'right fat arrow', 'amet ==>| consectetur'],
  ['amet |consectetur', 'left fat arrow', 'amet <==| consectetur'],
  ['amet |consectetur', 'thin arrow', 'amet ->| consectetur'],
  ['amet |consectetur', 'arrow', 'amet ->| consectetur'],
  ['amet |consectetur', 'right thin arrow', 'amet ->| consectetur'],
  ['amet |consectetur', 'right arrow', 'amet ->| consectetur'],
  ['amet |consectetur', 'left arrow', 'amet <-| consectetur'],
  ['amet |consectetur', 'left thin arrow', 'amet <-| consectetur'],
  // shovel/shift operator; rarely, double grouping?
  ['amet |consectetur', 'left double angle', 'amet <<| consectetur'],
  ['amet |consectetur', 'double left angle', 'amet <<| consectetur'],
  ['amet |consectetur', 'double less than sign', 'amet <<| consectetur'],
  ['amet |consectetur', 'left double angle', 'amet <<| consectetur'],

  ['amet |consectetur', 'right double angle', 'amet >>| consectetur'],
  ['amet |consectetur', 'double right angle', 'amet >>| consectetur'],
  ['amet |consectetur', 'double greater than sign', 'amet >>| consectetur'],
  ['amet |consectetur', 'right double angle', 'amet >>| consectetur'],

  ['amet |consectetur', 'right triple angle', 'amet >>>| consectetur'],
  ['amet |consectetur', 'triple right angle', 'amet >>>| consectetur'],
  ['amet |consectetur', 'triple greater than sign', 'amet >>>| consectetur'],
  ['amet |consectetur', 'right triple angle', 'amet >>>| consectetur'],

  // maaaan if i can make it user friendly enough to define your own matching expressions,
  // and share your definitions.
  // then people can make things like "bind symbol" >>= for haskell...

  // < and > as grouping!
  ['amet |consectetur', 'left angle bracket', 'amet <|consectetur'],
  ['amet |consectetur', 'left angle sign', 'amet <|consectetur'],
  ['amet |consectetur', 'left angle', 'amet <|consectetur'], // I guess?
  ['amet |consectetur', 'double left angle bracket', 'amet <<|consectetur'],
  ['amet |consectetur', 'right angle bracket', 'amet>| consectetur'],
  ['amet |consectetur', 'double right angle bracket', 'amet>>| consectetur'],
  ['amet |consectetur', 'right double angle bracket', 'amet>>| consectetur'],
  // Is this right? What about how some human languages use
  // «quotes» while some use »quotes«?
  // The unicode full name for « is LEFT-POINTING DOUBLE ANGLE QUOTATION MARK.
  // In general how to all these adjectives?
  // "left/right" "single/double/triple" "unicode/ascii"
  // "no cap/cap" "no space/space/"(does one delete spaces, or leave unchanged or?)
  //
  // maybe parse into a js object with optional or default vals?
  // {
  //   dir: 'left'|'right'|'none'|null(default/undefined; sometimes valid)
  //        |'up' etc occasionally
  //   count: 1|2|3    // 'single'(default)|'double'|'triple'
  //   charset: 'unicode'|'ascii'|null
  //   cap: 'allcaps'|'titlecaps'|'downcase'|default|'camelcase'(er that has to do with spaces too)|
  //
  //
  // (btw the speech recognition understands me better saying "ASCII"
  // when I pronounce the A as "ah" as in "aha" than "aaa" as in "bat")
  ['amet |consectetur', 'left chevron', 'amet <<|consectetur'],
  ['amet |consectetur', 'left guillemet', 'amet <<|consectetur'],
  ['amet |consectetur', 'right chevron', 'amet>>| consectetur'],
  ['amet |consectetur', 'right guillemet', 'amet>>| consectetur'],
  ['amet |consectetur', 'right ascii guillemet', 'amet>>| consectetur'],
  ['amet |consectetur', 'right unicode guillemet', 'amet»| consectetur'],

  ['amet |consectetur', 'left paren', 'amet (|consectetur'],
  ['amet |consectetur', 'right paren', 'amet)| consectetur'],
  ['amet | consectetur', 'right paren', 'amet)| consectetur'],
  ['amet|consectetur', 'right paren', 'amet)|consectetur'],
  ['amet |consectetur', 'right bracket', 'amet]| consectetur'],
  ['amet |consectetur', 'right brace', 'amet}| consectetur'],

  // WHAT ABOUT SMART QUOTES IF YOU DON'T SAY LEFT OR RIGHT
  // or something
  ['amet |consectetur', 'quotation mark', 'amet "|consectetur'],
  ['amet |consectetur', 'left quotation mark', 'amet “|consectetur'],
  ['amet| consectetur', 'left quotation mark', 'amet “|consectetur'],
  ['amet| consectetur', 'left double quotation mark', 'amet “|consectetur'],
  ['amet| consectetur', 'left single quotation mark', 'amet ‘|consectetur'],
  ['amet| consectetur', 'single left quotation mark', 'amet ‘|consectetur'],
  ['amet |consectetur', 'right quotation mark', 'amet”| consectetur'],
  ['amet |consectetur', 'right single quotation mark', 'amet’| consectetur'],
  // HAHAHA python uses these
  // Do I want to even allow "double triple quotation mark" or
  // (implicitly single or double?) "triple quotation mark"?
  // Or just these? If I represent these as a count then I guess
  // they will be an array of counts??
  ['amet |consectetur', 'triple single quotation mark', 'amet \'\'\'|consectetur'],
  ['amet |consectetur', 'triple double quotation mark', 'amet \"\"\"|consectetur'],

  // These characters are weird and generally meaningless
  // in normal language so I'll treat them as programming
  // and I don't think they have special spacing conventions?
  ['amet |consectetur', 'tilde', 'amet ~|consectetur'],
  ['amet |consectetur', 'tilde tilde', 'amet ~~|consectetur'],
  ['amet |consectetur', 'double tilde', 'amet ~~|consectetur'],
  // I had some trouble getting the speech recognition;
  // "back quote" was the closest I got semi-reliably,
  // or "grave accent" (but shouldn't that one be reserved
  // for actually putting an accent on another character?)
  ['amet |consectetur', 'backtick', 'amet `|consectetur'],
  ['amet |consectetur', 'back tick', 'amet `|consectetur'],
  ['amet |consectetur', 'backquote', 'amet `|consectetur'],
  ['amet |consectetur', 'back quote', 'amet `|consectetur'],
  ['amet |consectetur', 'backtick', 'amet `|consectetur'],
  //['amet |consectetur', 'grave accent', 'amet `|consectetur'],


  // ampersand means "pointer to", "bitwise and", "and"...
  // ampersand no space? should i insert space?
  //['amet |consectetur', 'ampersand', 'amet &|consectetur'],
  ['amet |consectetur', 'ampersand', 'amet &| consectetur'],
  ['amet| consectetur', 'ampersand', 'amet &| consectetur'],
  ['amet |consectetur', 'double ampersand', 'amet &&| consectetur'],
  ['amet |consectetur', 'ampersand ampersand', 'amet &&| consectetur'],
  ['amet |consectetur', 'triple ampersand', 'amet &&&| consectetur'],
  ['amet |consectetur', 'ampersand ampersand', 'amet &&&| consectetur'],
  // quadruple? (never seen a need for it yet but may be out there)
  ['amet &| consectetur', 'ampersand', 'amet &&| consectetur'],
  ['amet & |consectetur', 'ampersand', 'amet &&| consectetur'],
  ['amet |& consectetur', 'ampersand', 'amet &|& consectetur'],

  // note escaping character is = here
  // pipe/vertical bar usually has spaces around it (besides next to symbols)
  ['amet |consectetur', 'pipe', 'amet =|| consectetur'],
  ['amet |consectetur', 'vertical bar', 'amet =|| consectetur'],
  ['amet |consectetur', 'pipe pipe', 'amet =|=|| consectetur'],
  ['amet |consectetur', 'double pipe', 'amet =|=|| consectetur'],
  ['amet |consectetur', 'vertical bar vertical bar', 'amet =|=|| consectetur'],
  ['amet |consectetur', 'double vertical bar', 'amet =|=|| consectetur'],
  // some word switches that don't make that much sense but sometimes
  // people switch words around by accident and I think it doesn't
  // hurt to match them here.
  ['amet |consectetur', 'vertical double bar', 'amet =|=|| consectetur'],
  ['amet |consectetur', 'vertical bar bar', 'amet =|=|| consectetur'],
  ['amet |consectetur', 'triple pipe', 'amet =|=|=|| consectetur'],
  ['amet |consectetur', 'pipe pipe pipe', 'amet =|=|=|| consectetur'],
  ['amet |consectetur', 'pipe double pipe', 'amet =|=|=|| consectetur'], //is this needed?
  ['amet |consectetur', 'equal sign', 'amet ==| consectetur'],
  ['amet |consectetur', 'double equal sign', 'amet ====| consectetur'],
  ['amet|consectetur', 'triple equal sign', 'amet ======| consectetur'],
  ['amet |consectetur', 'bang equals', 'amet !==| consectetur'],
  ['amet |consectetur', 'bang equals equals', 'amet !====| consectetur'],
  ['amet |consectetur', 'bang double equals', 'amet !====| consectetur'],
  ['amet |consectetur', 'exclamation equals sign', 'amet !==| consectetur'],
  ['amet |consectetur', 'exclamation mark equals', 'amet !==| consectetur'],
  // other programming languages' not-equalses:
  ['amet |consectetur', 'slash equals sign', 'amet /==| consectetur'],
  // gee "tilde equals sign" could also mean
  // U+2245 APPROXIMATELY EQUAL TO  ≅
  // U+2248 ALMOST EQUAL TO  ≈
  ['amet |consectetur', 'tilde equals sign', 'amet ~==| consectetur'],
  ['amet |consectetur', 'tilde equals', 'amet ~==| consectetur'],
  // many languages have x += 3, etc. hmm.
  ['amet |consectetur', 'plus equals sign', 'amet +==| consectetur'],
  ['amet |consectetur', 'plus equals', 'amet +==| consectetur'],
  ['amet |consectetur', 'minus equals', 'amet -==| consectetur'],
  ['amet |consectetur', 'times equals', 'amet *==| consectetur'],
  ['amet |consectetur', 'star equals', 'amet *==| consectetur'],
  ['amet |consectetur', 'ampersand equals', 'amet &==| consectetur'],
  ['amet |consectetur', 'double ampersand equals', 'amet &&==| consectetur'],
  ['amet |consectetur', 'dollars equals', 'amet =$==| consectetur'],
  ['amet |consectetur', 'percent equals', 'amet %==| consectetur'], // but what if you mean "100% equals the maximum percentage"
  ['amet |consectetur', 'slash equals', 'amet /==| consectetur'],
  ['amet |consectetur', 'divide equals', 'amet /==| consectetur'],
  // python integer divide
  ['amet |consectetur', 'double slash equals', 'amet //==| consectetur'],
  ['amet |consectetur', 'slash slash equals', 'amet //==| consectetur'],
  // I guess this one makes sense for parallelness too:
  ['amet |consectetur', 'double divide equals', 'amet //==| consectetur'],
  ['amet |consectetur', 'divide divide equals', 'amet //==| consectetur'],
  // don't define "hat equals" because it could be confused with ≙??
  // (U+2259 ESTIMATES, see
  // https://math.stackexchange.com/questions/790019/what-is-the-symbol-%E2%89%99-most-commonly-used-for-in-a-mathematical-or-math-related-co
  // )
  ['amet |consectetur', 'caret equals', 'amet =^==| consectetur'],
  ['amet |consectetur', 'carrot equals', 'amet =^==| consectetur'],


  ['|', 'zero x 23', '0x23|'],
  ['|', 'o x 23', '0x23|'],
  ['|', 'zero x 2f', '0x2f|']


// so-far-untested behavior: "click [text in link on page]", etc

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
  console.assert(match, "valid string-with-cursor-pos pattern:", str);
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
var numPasses = 0;
var numFails = 0;
var fails = { selectionMajor: 0, selectionMinor: 0, whitespace: 0, content: 0, unimplemented: 0 };
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
  document.body.removeChild(textarea);
  if(actualEndText === end.text &&
      actualEndSelection[0] === end.cursorStartAndEnd[0] &&
      actualEndSelection[1] === end.cursorStartAndEnd[1]) {
    numPasses += 1;
    console.log("Test passes!", test);
  } else {
    numFails += 1;
    var actualEnd = makeCursorPosStr(actualEndText, actualEndSelection);
    // types of failure:
    // - selection loc only on a test that changes text
    // - selection loc only on a test that doesn't change text
    // - whitespace content wrong but otherwise ok
    // - content very wrong
    var textWrong = (actualEndText !== end.text);
    var textVeryWrong = (actualEndText.replace(/\s/g, '') !== end.text.replace(/\s/g, ''));
    var onlySelectionWrong = (!textWrong);
    var testChangesText = (start.text !== end.text);
    var seemsUnimplemented = (start.text === actualEndText &&
      actualEndSelection[0] === start.cursorStartAndEnd[0] &&
      actualEndSelection[1] === start.cursorStartAndEnd[1]);
    var failType = (seemsUnimplemented ? 'unimplemented' : textVeryWrong ? 'content' : textWrong ? 'whitespace' : testChangesText ? 'selectionMinor' : 'selectionMajor');
    fails[failType] += 1;
    $('#textarea_container').append($('<div>').addClass('fail_'+failType).css({'white-space': 'pre-wrap'}
      ).append($('<div>').text(commands.join('; ')).css({'color': ({unimplemented: '#c0f', content: '#f00', whitespace: '#f80', selectionMajor: '#880', selectionMinor: '#00f'})[failType], 'font-weight': 'bold'})
      ).append($('<div>').text(test[0]).css({'color': '#000'})
      ).append($('<div>').text(test[2]).css({'color': '#000'})
      ).append($('<div>').text(actualEnd).css({'color': '#000'})
      ).append($('<div>').html('&nbsp;')));
    console.error("Test fails!", test,
      "actual result (as str showing cursor pos):", actualEnd);
  }
};
var runTests = function() {
  var oldActiveElement = document.activeElement;
  _.each(tests, function(test) {
    runTextareaTest(test);
  });
  $('#textarea_container').prepend($('<div>').append(
    $('<div>').text('tests: ' + (numPasses + numFails) + '; pass: ' + numPasses + '; fail: ' + numFails))
    .append($('<div>').text(
     '(unimplemented: ' + fails['unimplemented'] + ', content: ' + fails['content'] + ', whitespace: ' + fails['whitespace'] + ', selectionMajor: ' + fails['selectionMajor'] + ', selectionMinor: ' + fails['selectionMinor'] + ')'))
    .append($('<div>').html('&nbsp;'))
  );
  oldActiveElement.focus();
};
// always? what if that's slow, or confuses an accessibility technology
setTimeout(runTests, 100);

}());
