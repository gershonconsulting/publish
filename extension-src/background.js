// Publish by Gershon.AI — background housekeeping (extension 0.1.0).
//
// The publishing itself lives in gx-publish.js. This file only sets the badge
// colour and the toolbar title on install / start-up. No collection, no daily
// sync: that is Social's extension.
(function () {
  function init() {
    try { chrome.action.setBadgeBackgroundColor({ color: "#D92D20" }); } catch (e) {}
    try { chrome.action.setTitle({ title: "Publish by Gershon.AI — Publish" }); } catch (e) {}
  }
  chrome.runtime.onInstalled.addListener(init);
  chrome.runtime.onStartup.addListener(init);
})();
