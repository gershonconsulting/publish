// Content script — runs on https://publish.gershon.ai/* (Publish extension 0.1.0)
//
// Lets the page know the Publish extension is installed, and which version:
//   page  → { type: "PUBLISH_PING", requestId }
//   here  → { type: "PUBLISH_PONG", version, requestId }
// plus an unprompted PUBLISH_HELLO { version } when the script loads.
//
// Namespaced PUBLISH_* on purpose: Social's extension speaks GERSHONAI_* and
// Social Tracking's its own, so no extension ever answers for another.
// The page can also ask for a publishing check now: PUBLISH_TICK → PUBLISH_TICK_DONE.

(function () {
  var version = chrome.runtime.getManifest().version;
  window.postMessage({ type: "PUBLISH_HELLO", version: version }, location.origin);

  window.addEventListener("message", function (event) {
    if (event.source !== window || event.origin !== location.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "PUBLISH_PING") {
      window.postMessage({ type: "PUBLISH_PONG", version: version, requestId: data.requestId }, location.origin);
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
