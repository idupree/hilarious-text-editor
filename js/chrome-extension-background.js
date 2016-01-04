// this is awful--
// https://stackoverflow.com/questions/13076272/how-do-i-give-webkitgetusermedia-permission-in-a-chrome-extension-popup-window
// https://groups.google.com/a/chromium.org/forum/#!topic/apps-dev/GXxJRX26xaA
chrome.browserAction.onClicked.addListener(function(tab) {
  // No tabs or host permissions needed!
  console.log('Turning ' + tab.url + ' red!');
  chrome.tabs.executeScript({
    code: 'document.body.style.backgroundColor="red"'
  });
  chrome.browserAction.setBadgeText({
    text: "ACTI",
    tabId: tab.id
  });
});
