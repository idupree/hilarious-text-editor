(function(){
"use strict";

hilarious.use_chrome_filesystem = (window.chrome && chrome.fileSystem);

// Map from absolute path (getDisplayPath) to DirectoryEntry.
// TODO: decide what to do if one thing here is a subdir of another.
var openDirectories = {};


// Chrome Apps let you retain file/directory entries when you reload the
// app, if you request the right permissions. However you need to store
// special strings to let you restore the entries.  To store strings,
// Chrome Apps don't support localStorage in favor of IndexedDB,
// so this code uses IndexedDB.

// This indexedDB error handling is mostly console.log here because errors
// for a small amount of data, inside a Chrome app, seem pretty
// unlikely and code can be expanded if anyone ever hits those
// errors (which would mean the error handling code could be tested).
var retainedOpenFilesDb = null;
var migrations = [
  function(db, event) {
    db.createObjectStore("retainedId", {keyPath: "retainedId"});
  }
];
function closeOnUpgradeRequest(event) {
  console.log("closing RetainedOpenFiles db for upgrade");
  retainedOpenFilesDb.close();
  retainedOpenFilesDb = null;
}
function openRetainedOpenFilesDb() {
  var request = window.indexedDB.open("RetainedOpenFiles", migrations.length);
  request.onblocked = function(event) {
    console.log("RetainedOpenFiles upgrade blocked; you may have to close other windows/tabs of this app to make it work, if it doesn't work soon all by itself?");
  };
  request.onerror = function(event) {
    console.log("RetainedOpenFiles opening error", event);
  };
  request.onupgradeneeded = function(event) {
    var db = event.target.result;
    for(var i = event.oldVersion; i < event.newVersion; ++i) {
      migrations[i](db, event);
    }
    db.onversionchange = closeOnUpgradeRequest;
  };
  request.onsuccess = function(event) {
    var db = event.target.result;
    db.onversionchange = closeOnUpgradeRequest;
    retainedOpenFilesDb = db;
    restoreFromRetainedOpenFiles();
  };
}
function saveRetainedId(retainedId) {
  if(retainedOpenFilesDb) {
    var retainedIdStore = retainedOpenFilesDb.transaction("retainedId",
      'readwrite').objectStore("retainedId");
    retainedIdStore.put({"retainedId": retainedId});
  }
}
function deleteRetainedId(retainedId) {
  if(retainedOpenFilesDb) {
    var retainedIdStore = retainedOpenFilesDb.transaction("retainedId",
      'readwrite').objectStore("retainedId");
    retainedIdStore.delete(retainedId);
  }
}
function saveEntryToRetainedOpenFiles(entry) {
  saveRetainedId(chrome.fileSystem.retainEntry(entry));
}
function restoreFromRetainedOpenFiles() {
  if(retainedOpenFilesDb) {
    var retainedIdStore = retainedOpenFilesDb.transaction("retainedId").objectStore("retainedId");
    retainedIdStore.openCursor().onsuccess = function(event) {
      var cursor = event.target.result;
      if(cursor) {
        var retainedId = cursor.value.retainedId;
        chrome.fileSystem.isRestorable(retainedId, function(isRestorable) {
          if(isRestorable) {
            chrome.fileSystem.restoreEntry(retainedId, function(entry) {
              scanDirectoryTree(entry);
            });
          } else {
            console.log("no longer in chrome filesystem's usable retained ids; forgetting: "+retainedId);
            deleteRetainedId(retainedId);
          }
        });
        cursor.continue();
      }
    };
  }
}

// End IndexedDB code


function loadFileEntryUTF8(fileEntry, doneCallback, errorCallback) {
  if(!doneCallback) {doneCallback = _.noop;}
  if(!errorCallback) {errorCallback = _.noop;}
  fileEntry.file(function(file) {
    var reader = new FileReader();
    reader.addEventListener('error', errorCallback);
    reader.addEventListener('loadend', function() {
      doneCallback(reader.result);
    });
    reader.readAsText(file, 'utf-8');
  }, errorCallback);
}
function writeFileEntryUTF8(fileEntry, text, doneCallback, errorCallback) {
  fileEntry.createWriter(function(writer) {
    writer.addEventListener('error', function(){console.log('wer');errorCallback();});
    writer.addEventListener('writeend', function(){console.log('fd43');doneCallback();});
    console.log('ewre');
    console.log('tex "' + text + '"');
    // TODO: line endings native or transparent?
    // https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob
    writer.write(new Blob([text], {type: 'text/plain; charset=utf-8'}));
  }, errorCallback);
}
// options go to DirectoryEntry.prototype.getFile's options arg.
// TODO should I mkdir -p?
function lookupFileEntry(filename, options, doneCallback, errorCallback) {
  if(!_.find(openDirectories, function(dirEntry, dirPath) {
    dirPath += '/';
    if(filename.slice(0, dirPath.length) === dirPath) {
      var relativeFilename = './'+filename.slice(dirPath.length);
      dirEntry.getFile(relativeFilename, options,
        doneCallback, errorCallback);
      return true;
    }
  })) {
    errorCallback();
  }
}

// not in any particular (e.g. alphabetical) order:
function readAllDirectoryContentsStreaming(dirEntry, entryCallback, doneCallback, errorCallback) {
  var dirReader = dirEntry.createReader();
  var read = function() {
    dirReader.readEntries(function(entries) {
      if(entries.length > 0) {
        for(var i = 0; i < entries.length; i++) {
          entryCallback(entries[i]);
        }
        read();
      } else if(doneCallback) {
        doneCallback();
      }
    }, errorCallback);
  };
  read();
}
// alphabetical order:
function readAllDirectoryContents(dirEntry, entriesCallback, errorCallback) {
  var contents = [];
  readAllDirectoryContentsStreaming(dirEntry, function(entry) {
    contents.push(entry);
  }, function() {
    var sortedContents = _.sortBy(contents, function(entry) { return entry.name; });
    entriesCallback(sortedContents);
  }, errorCallback);
}

function subrequests(items, itemCallback, doneCallback, errorCallback) {
  if(!doneCallback) {doneCallback = _.noop;}
  if(!errorCallback) {errorCallback = _.noop;}
  var itemsPending = items.length;
  var finishedCallback = doneCallback;
  //var id = Math.random();
  //console.log('a', itemsPending, id, items);
  var subDoneCallback = function() {
    //console.log('b', itemsPending, id);
    if(--itemsPending === 0) {
      finishedCallback();
    }
  };
  var subErrorCallback = function() {
    //console.log('c', itemsPending, id);
    finishedCallback = errorCallback;
    subDoneCallback();
  };
  if(itemsPending === 0) {
    //console.log('d', itemsPending, id);
    finishedCallback();
  }
  _.each(items, function(item) {
    //console.log('e', itemsPending, id);
    itemCallback(item, subDoneCallback, subErrorCallback);
  });
}

// Top down traversal.
// path is used just as a prefix to help you know where the files/dirs are;
// it's fine if you set it to '' or '.' to get relative paths.
// entryCallback is called for both files and directories
// (check entry.isFile/.isDirectory to tell which).
// If you want to recurse down the file tree (asynchronously),
// call the third parameter of your callback when you are done,
// otherwise call the fourth or fifth param of your callback when you're done
// (fourth for non-error condition, fifth to signal an error).
// (For non-directories, it doesn't matter whether you call the third or
// fourth callback because they never have children, but call exactly one
// of the available callbacks.)
function walkFileTree(entry, path, entryCallback, doneCallback, errorCallback) {
  entryCallback(entry, path, function() {
    if(entry.isDirectory) {
      var pathEndingWithSlash = path.replace(/\/?(?!^)$/, '/');
      readAllDirectoryContents(entry, function(subentries) {
        subrequests(
          subentries,
          function(subentry, subDoneCallback, subErrorCallback) {
            walkFileTree(subentry, pathEndingWithSlash + subentry.name,
              entryCallback, subDoneCallback, subErrorCallback);
          },
          doneCallback,
          errorCallback
        );
      }, errorCallback);
    } else {
      doneCallback();
    }
  }, doneCallback, errorCallback);
}

// exclude all file paths with newlines and similar weird characters in them:
// they are trouble and no use
function excludePathFromEditing(path) {
  return /[\\\/]\.git($|[\\\/])|[\x00-\x1f\x7f]|(~|\.swp)$/.test(path);
}

// heuristic
// http://stackoverflow.com/a/7392391
// keys: byte values [0,256); values: 0(false) or 1(true)
// Says yes for most 8-bit text encodings including UTF-8.
var textLikeBytes = new Uint8Array(new ArrayBuffer(256));
(function(){
  for(var i = 0; i < 256; i++) {
    textLikeBytes[i] = (
      _.contains([7,8,9,10,12,13,27], i) ||
      (i >= 0x20 && i !== 0x7f));
  }
}());

// Heuristics: > 1MB is too big to edit, and the first kB containing
// any control characters suggests it's a binary file.
// TODO should I/O error = not editable?
function contentsEditableAsText(fileEntry, isEditable, notEditable) {
  //var ne = notEditable;
  //var id = Math.random();
  //console.log("check edita", id);
  //notEditable = function() { console.log("notedit", id); ne(); }
  fileEntry.file(function(file) {
    var sliceName = (file.slice ? 'slice' : 'webkitSlice');
    if(file.size > 1000000) {
      notEditable();
    } else {
      var reader = new FileReader();
      reader.addEventListener('error', notEditable);
      reader.addEventListener('loadend', function() {
        var bytes = new Uint8Array(reader.result);
        if(bytes.every(function(n) {
          return textLikeBytes[n];
        })) {
          //console.log('iseditable', id);
          isEditable();
        } else {
          notEditable();
        }
      });
      reader.readAsArrayBuffer(file[sliceName](0, 1024));
    }
  }, notEditable);
}


// TODO should this separately signal I/O failure
// rather than calling notEditable in that case?
function testEditable(entry, path, isEditable, notEditable) {
  if(!isEditable){isEditable = _.noop;}
  if(!notEditable){notEditable = _.noop;}
  if(excludePathFromEditing(path)) {
    notEditable();
  } else if(entry.isFile) {
    contentsEditableAsText(entry, isEditable, notEditable);
  } else {
    isEditable();
  }
}
function scanDirectoryTreeImpl(dirEntry, doneCallback, errorCallback) {
  var editableFilesHere = {};
  chrome.fileSystem.getDisplayPath(dirEntry, function(dirPath) {
    openDirectories[dirPath] = dirEntry;
    walkFileTree(dirEntry, dirPath, function(entry, path, recurse, dontRecurse) {
      console.log('x');
      testEditable(entry, path, function() {
          console.log('y');
          if(entry.isFile) {
            editableFilesHere[path] = true;
            console.log(path, entry);
          }
          recurse();
        },
        dontRecurse);
    }, function(){doneCallback(editableFilesHere);}, errorCallback);
  });
}

// maybe TODO rescan only some things, or only when the user isn't active?
function rescan(doneCallback, errorCallback) {
  var dirEntries = _.values(openDirectories);
  var editableFiles = {};
  subrequests(
    dirEntries,
    function(dirEntry, subDoneCallback, subErrorCallback) {
      scanDirectoryTreeImpl(dirEntry, function(editableFilesHere) {
        _.assign(editableFiles, editableFilesHere);
        subDoneCallback();
      }, subErrorCallback);
    },
    function(){doneCallback(editableFiles);},
    errorCallback
  );
}

function scanDirectoryTree(dirEntry) {
  console.log('opening dirEntry', dirEntry);
  scanDirectoryTreeImpl(dirEntry, function(editableFilesHere) {
    console.log('editable files here:', editableFilesHere);
    saveEntryToRetainedOpenFiles(dirEntry);
    hilarious.status_loaded({
      editable_files: _.assign(editableFilesHere, hilarious.state.editable_files)
    });
  }, function() {
    console.log("some file system error in the process of scanning dir");
  });
}

hilarious.askUserToOpenEditableDirectory = function() {
  chrome.fileSystem.chooseEntry({type: 'openDirectory'}, function(dirEntry) {
    scanDirectoryTree(dirEntry);
  });
};
var ops = {
  save: function(filename, contents, timeout, success, failure) {
    lookupFileEntry(filename, {create: true, exclusive: false},
      function(fileEntry) {
        writeFileEntryUTF8(fileEntry, contents, success, failure);
      },
      failure);
  },
  abort: function(saveRequest) {
    console.log("There's no way to abort a Chrome FileSystem request");
  },
  load: function(filename, success, failure) {
    lookupFileEntry(filename, {create: false},
      function(fileEntry) {
        loadFileEntryUTF8(fileEntry, success, failure);
      },
      failure);
  },
  load_status: function(success, failure) {
    // Does this make sense here? and does always "succeeding" make sense?
    rescan(function(editableFiles) {
      success({
        context_name: "Editor!",
        default_file_name: null,
        editable_files: editableFiles
      });
    });
  }
};
if(hilarious.use_chrome_filesystem) {
  hilarious.loadsave_ops = ops;
  openRetainedOpenFilesDb();
}


}());
