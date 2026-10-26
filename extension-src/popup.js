// Popup — Publish by Gershon.AI (extension 0.1.0).
var ORIGIN = "https://publish.gershon.ai";
var installed = chrome.runtime.getManifest().version;
document.getElementById("ver").textContent = "v" + installed;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}
function ago(ts) {
  if (!ts) return "never";
  var m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  var h = Math.round(m / 60);
  return h < 24 ? h + " h ago" : Math.round(h / 24) + " d ago";
}
function semverLt(a, b) {
  var pa = String(a).split("."), pb = String(b).split(".");
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x < y;
  }
  return false;
}

async function checkVersion() {
  try {
    var r = await fetch(ORIGIN + "/api/extension/version", { cache: "no-store" });
    var j = await r.json();
    if (j && j.success && semverLt(installed, j.data.latest)) {
      document.getElementById("update-banner").innerHTML =
        '<div class="update-banner"><strong>Out of date — v' + esc(j.data.latest) + ' is available.</strong><br>' +
        esc(j.data.updateInstructions || "") + "</div>";
    }
  } catch (e) {}
}

function renderStatus() {
  chrome.runtime.sendMessage({ type: "publish-status" }, function (res) {
    if (chrome.runtime.lastError || !res) return;
    var st = res.state || {};
    var html = "";
    html += '<div class="row"><span>LinkedIn</span>' + (res.linkedin ? '<span class="ok">Signed in' + (st.liName ? " · " + esc(st.liName) : "") + "</span>" : '<span class="bad">Signed out</span>') + "</div>";
    html += '<div class="row"><span>X</span>' + (res.x ? '<span class="ok">' + ((st.xAccounts && st.xAccounts.length) ? "@" + st.xAccounts.map(esc).join(", @") : "Signed in") + "</span>" : '<span class="bad">Signed out</span>') + "</div>";
    html += '<div class="row"><span>Last check-in</span><span class="muted">' + ago(st.beatAt) + "</span></div>";
    html += '<div class="row"><span>Last post</span><span class="muted">' + ago(st.lastPostAt) + "</span></div>";
    if (res.publishing) html += '<div class="status">A post is going out now…</div>';
    if (st.enabled === false) html += '<div class="status">Publishing is paused in publish.gershon.ai settings.</div>';
    document.getElementById("sessions").innerHTML = html;
  });
}

document.getElementById("tick").addEventListener("click", function () {
  var btn = document.getElementById("tick");
  btn.disabled = true;
  document.getElementById("status").innerHTML = '<div class="status">Checking for due posts…</div>';
  chrome.runtime.sendMessage({ type: "publish-tick" }, function () {
    btn.disabled = false;
    document.getElementById("status").innerHTML = '<div class="status">Done. Anything due has been published or handed back.</div>';
    renderStatus();
  });
});

renderStatus();
checkVersion();
