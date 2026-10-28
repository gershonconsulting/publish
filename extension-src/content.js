// Content script — runs on https://publish.gershon.ai/* (Publish extension 0.2.1)
//
// Lets the page know the Publish extension is installed, and which version:
//   page  → { type: "PUBLISH_PING", requestId }
//   here  → { type: "PUBLISH_PONG", version, requestId }
// plus an unprompted PUBLISH_HELLO { version } when the script loads.
//
// Namespaced PUBLISH_* on purpose: Social's extension speaks GERSHONAI_* and
// Social Tracking's its own, so no extension ever answers for another.
// The page can also ask for a publishing check now: PUBLISH_TICK → PUBLISH_TICK_DONE.
// 0.2.1: PONG / HELLO also carry this Chrome's publishing id ("pb_…", the one
// it checks in with), so Settings → Computers can say "this computer".

(function () {
  var version = chrome.runtime.getManifest().version;
  var browserId = null;
  function withId(done) {
    if (browserId) return done();
    try {
      chrome.storage.local.get("publishBrowserId", function (r) {
        browserId = (r && r.publishBrowserId) || null;
        done();
      });
    } catch (e) { done(); }
  }
  withId(function () {
    window.postMessage({ type: "PUBLISH_HELLO", version: version, browserId: browserId }, location.origin);
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window || event.origin !== location.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "PUBLISH_PING") {
      withId(function () {
        window.postMessage({ type: "PUBLISH_PONG", version: version, browserId: browserId, requestId: data.requestId }, location.origin);
      });
      return;
    }
    if (data.type === "PUBLISH_TICK") {
      chrome.runtime.sendMessage({ type: "publish-tick" }, function (response) {
        var err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        window.postMessage({ type: "PUBLISH_TICK_DONE", requestId: data.requestId, ok: !err && !!(response && response.ok), error: err }, location.origin);
      });
    }
  });
})();
