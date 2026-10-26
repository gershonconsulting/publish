// Workspace token — what tells publish.gershon.ai whose posts this browser publishes.
// (Publish extension 0.1.0; adapted from Social's gx-token.js)
//
// The token is set AUTOMATICALLY by gx-bridge.js from a publish.gershon.ai tab
// you are signed in to. Every call to publish.gershon.ai carries it. With no
// token, calls are refused right here, before they leave the browser — there
// is no fallback workspace.
//
// It wraps fetch. Requests to linkedin.com and x.com pass through unchanged;
// the token goes nowhere near them.
//
// Storage keys are namespaced "publish*" so nothing is shared with Social's
// or Social Tracking's extension, even by accident.
//
// Loaded first in both contexts: gx-boot.js for the service worker, a script
// tag ahead of popup.js in popup.html.

(function () {
  var API_ORIGIN = "https://publish.gershon.ai";
  var STORAGE_KEY = "publishToken";

  var cached = null;
  var pending = null;

  function readToken() {
    if (cached !== null) return Promise.resolve(cached);
    if (pending) return pending;
    pending = new Promise(function (resolve) {
      try {
        chrome.storage.local.get(STORAGE_KEY, function (r) {
          cached = (r && r[STORAGE_KEY]) || "";
          pending = null;
          resolve(cached);
        });
      } catch (e) {
        cached = "";
        pending = null;
        resolve("");
      }
    });
    return pending;
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes[STORAGE_KEY]) cached = changes[STORAGE_KEY].newValue || "";
    });
  } catch (e) {}

  var nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(API_ORIGIN) !== 0) return nativeFetch(input, init);

    var token = await readToken();
    if (!token) {
      // The version check is public and harmless; everything else needs a workspace.
      if (url.indexOf(API_ORIGIN + "/api/extension/version") === 0) return nativeFetch(input, init);
      return new Response(
        JSON.stringify({
          success: false,
          code: "token_required",
          error: "Not connected. Open publish.gershon.ai in this browser and sign in — the extension connects itself.",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    var opts = Object.assign({}, init || {});
    var headers = new Headers((init && init.headers) || (input && input.headers) || {});
    headers.set("x-gershon-token", token);
    opts.headers = headers;
    return nativeFetch(url, opts);
  };

  // ---- popup UI: which workspace this browser publishes for ----------------
  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", function () {
    var host = document.querySelector(".footer");
    if (!host) return;
    var wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:10px;padding:10px;border-radius:8px;font-size:12px;line-height:1.45;";
    var KEYS = ["publishToken", "publishWorkspaceName", "publishWorkspaceEmail"];

    function render(r) {
      var token = r && r.publishToken;
      wrap.innerHTML = "";
      var title = document.createElement("div");
      title.style.cssText = "font-weight:700;margin-bottom:2px;";
      var detail = document.createElement("div");
      if (token && token.indexOf("gp_") === 0) {
        wrap.style.background = "#eff6ff";
        wrap.style.border = "1px solid #bfdbfe";
        title.style.color = "#1e3a8a";
        title.textContent = "Publishing for: " + (r.publishWorkspaceName || "your company");
        detail.style.color = "#1d4ed8";
        detail.textContent = "Only this company's approved posts are published from this browser, at their scheduled time.";
      } else if (token) {
        wrap.style.background = "#ecfdf5";
        wrap.style.border = "1px solid #a7f3d0";
        title.style.color = "#065f46";
        title.textContent = "Publishing for: " + (r.publishWorkspaceName || "your workspace");
        detail.style.color = "#047857";
        detail.textContent = (r.publishWorkspaceEmail ? "Connected as " + r.publishWorkspaceEmail + ". " : "") +
          "Approved, scheduled posts go out from this browser. Nothing is collected.";
      } else {
        wrap.style.background = "#fef2f2";
        wrap.style.border = "1px solid #fecaca";
        title.style.color = "#991b1b";
        title.textContent = "Not connected — nothing will be published";
        detail.style.color = "#b91c1c";
        detail.textContent = "Open publish.gershon.ai in this browser and sign in. The extension connects itself.";
      }
      wrap.appendChild(title);
      wrap.appendChild(detail);
    }

    chrome.storage.local.get(KEYS, render);
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local") return;
        if (changes.publishToken || changes.publishWorkspaceName || changes.publishWorkspaceEmail) chrome.storage.local.get(KEYS, render);
      });
    } catch (e) {}
    host.parentNode.insertBefore(wrap, host);
  });
})();
