// this is awful--
// https://stackoverflow.com/questions/13076272/how-do-i-give-webkitgetusermedia-permission-in-a-chrome-extension-popup-window
// https://groups.google.com/a/chromium.org/forum/#!topic/apps-dev/GXxJRX26xaA

// TODO cut down on size of content scripts (since they're duplicated
// across many tabs) and/or unload them when inactive (`delete window.$`
// for example?).
// Also don't run the tests every time...
var contentScriptFilesToLoad = [
  'vendor/underscore-min.js',
  'vendor/jquery.min.js',
  //'modified_vendor/annyang.modified.js',
  'vendor/bililiteRange.js',
  'modified_vendor/bililiteRange.util.js',
  'vendor/xregexp-all.js',
  //'generated/unicode_names_map.json',
  'js/speech-recognition-for-editor.js'
];

// Currently, all the CSS for this is by style=, which
// does certainly override any page styles, but does
// not allow :after content so this may change.
function injectContentScripts(tab, cb) {
  cb = cb || function(){};
  var loadScripts = function(i) {
    if(i < contentScriptFilesToLoad.length) {
      chrome.tabs.executeScript(tab.id, {
        file: contentScriptFilesToLoad[i]
      }, function() {
        loadScripts(i + 1);
      });
    } else {
      cb();
    }
  };
  loadScripts(0);
}

function speechHappened(results) {
  var message = {
    request: "speech",
    results: results
  };
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, message);
  });
}

function authNeeded() {
  //chrome.browserAction.setBadgeText({
  //  text: "fix?"
  //});
  //chrome.tabs.create
}

var annyangIsSetup = false;

function setupAnnyangSpeechRecognition() {
  // (needs permissions btw)
  // (is there any need not to run this twice?
  // well, the callback shouldn't be duplicated :))
  annyang.debug();
  // TODO configurable lang. Translated commands will be more work but at least allow en-GB?  Useful for after "dictate"
  annyang.setLanguage('en-US');
  if(!annyangIsSetup) {
    annyang.addCallback('result', speechHappened);
    annyang.addCallback('callbacks.errorPermissionBlocked', authNeeded);
    annyang.addCallback('callbacks.errorPermissionDenied', authNeeded);
  }
  annyang.start();
  annyangIsSetup = true;
}

chrome.browserAction.onClicked.addListener(function(tab) {
  // No tabs or host permissions needed!
  console.log('Turning ' + tab.url + ' red!');
  chrome.tabs.executeScript(tab.id, {
    code: 'document.body.style.backgroundColor="red"'
  });
  injectContentScripts(tab);
  chrome.browserAction.setBadgeText({
    text: "ACTI",
    tabId: tab.id
  });
  setupAnnyangSpeechRecognition();
});
