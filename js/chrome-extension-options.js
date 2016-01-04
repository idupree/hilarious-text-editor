(function() {
"use strict";

var authspeech = function() {
  navigator.webkitGetUserMedia({audio: true, video: false}, function(stream) {
    document.getElementById('authspeech').outerHTML = '<p>Speech recognition is authorized!</p>';
    stream.getAudioTracks().forEach(function(track) {
      track.stop();
    });
  }, function(err) {
    document.getElementById('authspeech').innerHTML = 'Speech recognition is denied.';
  });
};
document.getElementById('authspeech').addEventListener('click', authspeech);

}());
