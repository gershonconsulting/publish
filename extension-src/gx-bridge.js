// Workspace binding — automatic. (Publish extension 0.1.0; from Social's gx-bridge.js)
//
// Runs on publish.gershon.ai pages. Asks Publish, with the page's own sign-in,
// which workspace the signed-in person belongs to, and stores that workspace's
// token. From then on this browser publishes THAT workspace's due posts and no
// other. An install that has never seen a signed-in Publish tab is bound to
// nothing and publishes nothing — there is no fallback.
//
// A page at /connect/gp_… is a client's publishing link: opening it stores
// that key, and this browser then publishes ONLY that company's approved posts.
//
// Messages to the page are namespaced PUBLISH_* so this never answers (or
// confuses) Social's GERSHONAI_* or Social Tracking's bridge.

(function () {
  var connect = location.pathname.match(/^\/connect\/(gp_[a-f0-9]{48})\/?$/);
  if (connect) {
    var key = connect[1];
    fetch("/api/connect/" + key, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.success) return;
        chrome.storage.local.set({
          publishToken: key,
          publishWorkspaceId: "publish:" + key.slice(3, 11),
          publishWorkspaceName: j.data.client || "",
          publishWorkspaceEmail: "",
          publishWorkspaceMode: "client",
          publishBoundAt: new Date().toISOString(),
        }, function () {
          try { window.postMessage({ type: "PUBLISH_BOUND", workspaceName: j.data.client, client: true, changed: true }, location.origin); } catch (e) {}
        });
      })
      .catch(function () {});
    return; // never replace a client key with a dashboard binding on this page
  }

  function bind() {
    fetch("/api/extension/bind", { credentials: "include", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.success || !j.data || !j.data.token) return;
        var d = j.data;
        chrome.storage.local.get(["publishToken", "publishWorkspaceId"], function (cur) {
          var changed = cur.publishToken !== d.token || cur.publishWorkspaceId !== d.workspaceId;
          chrome.storage.local.set({
            publishToken: d.token,
            publishWorkspaceId: d.workspaceId,
            publishWorkspaceName: d.workspaceName || "",
            publishWorkspaceEmail: d.email || "",
            publishWorkspaceMode: "workspace",
            publishBoundAt: new Date().toISOString(),
          }, function () {
            try { window.postMessage({ type: "PUBLISH_BOUND", workspaceName: d.workspaceName, changed: changed }, location.origin); } catch (e) {}
          });
        });
      })
      .catch(function () {});
  }
  bind();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") bind();
  });
})();
