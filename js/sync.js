"use strict";
// ---------- Google Drive sync (optional, off until the user connects) ----------
// Data stays local unless the user turns this on. The file lives in the hidden per-app folder of the user's
// own Drive (scope drive.appdata), so this app cannot see any other file in their Drive.
var GOOGLE_CLIENT_ID = "413172481620-aef82eehsqf3u8nvn6e0t0bd4c18ft9h.apps.googleusercontent.com";
var SYNC_SCOPE = "https://www.googleapis.com/auth/drive.appdata openid email profile";
var SYNC_FILE_NAME = "shopping-tracker-data.json";
var SYNC_KEY = "preorderVault_sync";
var TOMB_KEY = "preorderVault_tomb";
var TOMB_KEEP_MS = 180 * 24 * 3600 * 1000;

var tsMap = {};      // id -> updatedAt as last stamped
var stripSig = {};   // id -> JSON of the order without updatedAt (to detect real edits)
var tombs = {};      // id -> deletion time
var sync = { rev: 0, syncedRev: 0, enabled: false, fileId: "", email: "", last: 0, token: "", exp: 0, busy: false, again: false, state: "off", timer: null, client: null, promise: null };

function stripOf(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== "updatedAt") c[k] = o[k]; }); return hashStr(JSON.stringify(c)); }
function loadTombs() {
  try { tombs = JSON.parse(localStorage.getItem(TOMB_KEY) || "{}") || {}; } catch (e) { tombs = {}; }
}
function saveTombs() { try { localStorage.setItem(TOMB_KEY, JSON.stringify(tombs)); } catch (e) { /* ignore */ } }
function syncInitMaps() {
  tsMap = {}; stripSig = {};
  state.orders.forEach(function (o) { tsMap[o.id] = o.updatedAt || 0; stripSig[o.id] = stripOf(o); });
}
// Stamps updatedAt on changed orders and records deletions. Returns true if anything changed.
function stampOrders() {
  var now = Date.now(), changed = false, present = {};
  state.orders.forEach(function (o) {
    present[o.id] = true;
    var sig = stripOf(o);
    if (o.id in stripSig && stripSig[o.id] === sig) {
      if (tsMap[o.id]) o.updatedAt = tsMap[o.id]; else delete o.updatedAt;
    } else {
      o.updatedAt = now; tsMap[o.id] = now; stripSig[o.id] = sig; changed = true;
      if (tombs[o.id]) { delete tombs[o.id]; saveTombs(); }
    }
  });
  var gone = Object.keys(stripSig).filter(function (id) { return !present[id]; });
  if (gone.length) {
    gone.forEach(function (id) { tombs[id] = now; delete stripSig[id]; delete tsMap[id]; });
    saveTombs(); changed = true;
  }
  return changed;
}

function loadSyncPref() {
  try {
    var p = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}") || {};
    sync.enabled = !!p.enabled; sync.fileId = p.fileId || ""; sync.email = p.email || ""; sync.last = p.last || 0;
  } catch (e) { /* ignore */ }
  sync.state = sync.enabled ? "idle" : "off";
}
function saveSyncPref() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ enabled: sync.enabled, fileId: sync.fileId, email: sync.email, last: sync.last })); } catch (e) { /* ignore */ }
}
function syncSupported() { return /^https:$/.test(location.protocol) || location.hostname === "localhost" || location.hostname === "127.0.0.1"; }

function setSettingsBusy(on) {
  Array.prototype.forEach.call(document.querySelectorAll(".js-settings-btn"), function (g) { g.classList.toggle("sync-busy", on); });
}
function setSyncState(st) { sync.state = st; renderSyncUI(); }
function renderSyncUI() {
  var note = document.getElementById("syncNote");
  if (!note) return;
  var block = document.getElementById("syncSection"), head = document.getElementById("acctHead"), hint = document.getElementById("syncHint");
  var txt = document.getElementById("syncConnectText");
  var cls = "acct-sub", text = "", label;
  if (!sync.enabled) {
    block.className = "acct-block signed-out"; head.hidden = true;
    hint.hidden = false; hint.textContent = t("syncOffNote");
    note.textContent = ""; label = t("syncConnect");
  } else {
    block.className = "acct-block signed-in"; head.hidden = false; hint.hidden = true;
    var em = sync.email || "";
    document.getElementById("acctEmail").textContent = em || t("syncAcctFallback");
    document.getElementById("acctAvatar").textContent = (em || "G").charAt(0);
    if (sync.state === "syncing") { text = t("syncDoing"); label = t("syncNow"); cls += " ok"; }
    else if (sync.state === "needsauth") { text = t("syncNeedNote"); label = t("syncSignIn"); cls += " warn"; }
    else if (sync.state === "error") { text = sync.bigMb ? t("syncBigNote", { mb: sync.bigMb }) : t("syncErrNote"); label = t("syncNow"); cls += " warn"; }
    else {
      var d = sync.last ? new Date(sync.last) : null;
      text = t("syncLastNote", { time: d ? d.toLocaleTimeString(I18N[state.lang].locale, { hour: "2-digit", minute: "2-digit" }) : "—" });
      label = t("syncNow"); cls += " ok";
    }
    note.className = cls; note.textContent = text;
  }
  if (!sync.enabled) note.className = "acct-sub";
  txt.textContent = label;
  document.getElementById("btnSyncOff").hidden = !sync.enabled;
  document.getElementById("btnSyncSwitch").hidden = !sync.enabled;
  var attn = sync.enabled && (sync.state === "needsauth" || sync.state === "error");
  Array.prototype.forEach.call(document.querySelectorAll(".js-settings-btn"), function (g) { g.classList.toggle("sync-attn", attn); });
  if (typeof renderNavAccount === "function") renderNavAccount();
}

function loadGis() {
  return new Promise(function (resolve, reject) {
    if (window.google && google.accounts && google.accounts.oauth2) { resolve(); return; }
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(Object.assign(new Error("gis"), { gis: true })); };
    document.head.appendChild(s);
  });
}
function authError(msg) { return Object.assign(new Error(msg || "auth"), { auth: true }); }
function getToken(interactive, opts) {
  opts = opts || {};
  if (!opts.fresh && sync.token && Date.now() < sync.exp - 60000) return Promise.resolve(sync.token);
  return loadGis().then(function () {
    return new Promise(function (resolve, reject) {
      if (!sync.client) {
        sync.client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID, scope: SYNC_SCOPE,
          callback: function (resp) { if (sync.onTok) sync.onTok(resp); },
          error_callback: function (err) { if (sync.onErr) sync.onErr(err); }
        });
      }
      sync.onTok = function (resp) {
        if (!resp || resp.error || !resp.access_token) reject(authError(resp && resp.error));
        else { sync.token = resp.access_token; sync.exp = Date.now() + (resp.expires_in || 3600) * 1000; resolve(sync.token); }
      };
      sync.onErr = function (err) { reject(authError(err && err.type)); };
      sync.client.requestAccessToken({ prompt: opts.prompt !== undefined ? opts.prompt : (interactive ? "" : "none") });
    });
  });
}

function gfetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: "Bearer " + sync.token }, opts.headers || {});
  return fetch(url, opts).then(function (r) {
    if (r.ok) return r;
    // Read Google's reason so the user (and we) can tell "API not enabled" from "sign in again".
    return r.text().then(function (txt) {
      var reason = "";
      try { var j = JSON.parse(txt), e0 = j.error || {}; reason = (e0.errors && e0.errors[0] && e0.errors[0].reason) || e0.status || ""; } catch (x) { /* not JSON */ }
      var err = new Error("HTTP " + r.status + (reason ? " " + reason : ""));
      err.status = r.status; err.reason = reason;
      if (r.status === 401) { sync.token = ""; err.auth = true; }
      throw err;
    });
  });
}
function fetchEmail() {
  return gfetch("https://www.googleapis.com/oauth2/v3/userinfo").then(function (r) { return r.json(); })
    .then(function (j) { return (j && j.email) || ""; }).catch(function () { return ""; });   // display only: never block sync
}
function findRemoteFile() {
  var url = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&orderBy=createdTime&pageSize=10" +
    "&fields=" + encodeURIComponent("files(id,createdTime)") + "&q=" + encodeURIComponent("name='" + SYNC_FILE_NAME + "' and trashed=false");
  return gfetch(url).then(function (r) { return r.json(); }).then(function (j) {
    return (j.files && j.files.length) ? j.files[0].id : "";
  });
}
function remoteLimitMb() {
  var small = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  return small ? 50 : 300;
}
function downloadRemote(interactive) {
  function dl() {
    // Check the size first: pulling a very large file into a phone browser crashes the page.
    return gfetch("https://www.googleapis.com/drive/v3/files/" + sync.fileId + "?fields=size").then(function (r) { return r.json(); }).then(function (meta) {
      var mb = Math.round((parseInt(meta && meta.size, 10) || 0) / 1048576);
      if (mb > remoteLimitMb() && !(interactive && confirm(t("confirmBigRemote", { mb: mb })))) throw Object.assign(new Error("big"), { big: true, mb: mb });
      return gfetch("https://www.googleapis.com/drive/v3/files/" + sync.fileId + "?alt=media");
    }).then(function (r) { return r.json(); });
  }
  var ready = sync.fileId ? Promise.resolve() : findRemoteFile().then(function (id) { sync.fileId = id; });
  return ready.then(function () {
    if (!sync.fileId) return null;
    return dl().catch(function (e) {
      if (e.status === 404) { sync.fileId = ""; return findRemoteFile().then(function (id) { sync.fileId = id; return id ? dl() : null; }); }
      throw e;
    });
  });
}
function uploadRemote(bodyStr) {
  var existing = !!sync.fileId;
  var url = "https://www.googleapis.com/upload/drive/v3/files" + (existing ? "/" + sync.fileId : "") + "?uploadType=resumable&fields=id";
  var meta = existing ? {} : { name: SYNC_FILE_NAME, parents: ["appDataFolder"] };
  return gfetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/json" },
    body: JSON.stringify(meta)
  }).then(function (r) {
    var loc = r.headers.get("Location");
    if (!loc) throw new Error("no upload url");
    return gfetch(loc, { method: "PUT", headers: { "Content-Type": "application/json" }, body: bodyStr });
  }).then(function (r) { return r.json(); }).then(function (f) { if (f && f.id) sync.fileId = f.id; });
}

function fingerprint(orders, tb) {
  return orders.map(function (o) { return o.id + "@" + (o.updatedAt || 0); }).sort().join("|") + "#" +
    Object.keys(tb).sort().map(function (k) { return k + "@" + tb[k]; }).join("|");
}
function mergeData(remote) {
  var rOrders = (remote && Array.isArray(remote.orders)) ? remote.orders : [];
  var rTombs = (remote && remote.tombs && typeof remote.tombs === "object") ? remote.tombs : {};
  var tb = {}, now = Date.now();
  [tombs, rTombs].forEach(function (src) {
    Object.keys(src).forEach(function (id) { if (now - src[id] < TOMB_KEEP_MS) tb[id] = Math.max(tb[id] || 0, src[id]); });
  });
  var byId = {};
  state.orders.forEach(function (o) { byId[o.id] = o; });
  rOrders.forEach(function (r) {
    if (!r || !r.id) return;
    var cur = byId[r.id];
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) byId[r.id] = r;
  });
  var merged = [];
  Object.keys(byId).forEach(function (id) {
    var o = byId[id];
    if (tb[id] && tb[id] >= (o.updatedAt || 0)) return;   // deleted after last edit
    if (tb[id]) delete tb[id];                             // edited after the delete: it lives
    merged.push(o);
  });
  return { orders: merged, tombs: tb, remoteOrders: rOrders, remoteTombs: rTombs };
}
function mergeAndApply(remote) {
  var m = mergeData(remote);
  var localFp = fingerprint(state.orders, tombs);
  var mergedFp = fingerprint(m.orders, m.tombs);
  if (mergedFp !== localFp) {
    var keep = {}; m.orders.forEach(function (o) { keep[o.id] = true; });
    state.orders = m.orders;
    tsMap = {}; stripSig = {};
    state.orders.forEach(function (o) { tsMap[o.id] = o.updatedAt || 0; stripSig[o.id] = stripOf(o); });
    tombs = m.tombs; saveTombs();
    saveData();
    renderAll();
  }
  var remoteFp = fingerprint(m.remoteOrders, m.remoteTombs);
  return { needUpload: !remote || mergedFp !== remoteFp, count: m.orders.length };
}
// Different Google account: this device now shows that account's data only (nothing is merged across accounts).
function applyReplace(remote) {
  var rOrders = (remote && Array.isArray(remote.orders)) ? remote.orders : [];
  state.orders = rOrders.slice();
  tsMap = {}; stripSig = {};
  state.orders.forEach(function (o) { tsMap[o.id] = o.updatedAt || 0; stripSig[o.id] = stripOf(o); });
  tombs = (remote && remote.tombs && typeof remote.tombs === "object") ? Object.assign({}, remote.tombs) : {};
  saveTombs();
  saveData();
  renderAll();
  return { needUpload: !remote, count: state.orders.length };
}
function buildPayload() {
  return JSON.stringify({ v: 1, savedAt: Date.now(), orders: state.orders, tombs: tombs });
}

function scheduleSync(ms) {
  sync.rev++;   // something changed locally and hasn't reached Drive yet
  if (!sync.enabled || sync.state === "needsauth") return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(function () { runSync(false, false); }, ms);
}
function runSync(interactive, announce, opts) {
  if (!sync.enabled) return Promise.resolve();
  if (!syncSupported()) { renderSyncUI(); return Promise.resolve(); }
  if (sync.busy) { sync.again = true; return sync.promise; }
  sync.busy = true;
  setSyncState("syncing");
  setSettingsBusy(true);
  sync.bigMb = 0;
  var count = 0, prevId = sync.fileId, prevEmail = sync.email, newEmail = "", revAtStart = sync.rev;
  sync.promise = getToken(interactive, opts).then(function () {
    return (opts && opts.fresh) || !sync.email || interactive ? fetchEmail() : sync.email;
  }).then(function (email) {
    newEmail = email || sync.email || "";
    if (opts && opts.fresh) sync.fileId = "";   // possibly a different account: look the file up again
    return downloadRemote(interactive);
  }).then(function (remote) {
    var differentAccount = (prevEmail && newEmail) ? prevEmail !== newEmail : (!!prevId && sync.fileId !== prevId);
    var replace = (opts && opts.replace) || differentAccount;
    if (differentAccount && !(opts && opts.replace) && !confirm(t("confirmSyncDiff"))) {
      throw Object.assign(new Error("cancel"), { cancel: true });
    }
    var r = replace ? applyReplace(remote) : mergeAndApply(remote);
    count = r.count;
    return r.needUpload ? uploadRemote(buildPayload()) : null;
  }).then(function () {
    sync.last = Date.now(); if (newEmail) sync.email = newEmail; if (sync.rev === revAtStart) sync.syncedRev = sync.rev; saveSyncPref(); setSyncState("idle");
    if (announce) showToast(t("toastSyncOk", { n: count }));
  }).catch(function (err) {
    console.error("sync", err);
    if (err && err.cancel) {   // declined to replace this device's data with another account's: stay signed out of that account
      sync.fileId = prevId; sync.email = prevEmail; sync.token = ""; sync.exp = 0; saveSyncPref();
      setSyncState("needsauth"); showToast(t("toastSyncCancel")); return;
    }
    if (interactive && !sync.last) { sync.enabled = false; saveSyncPref(); }   // first connect never finished: stay off
    if (opts && opts.fresh && err && err.auth && sync.last) {   // switch cancelled: stay on the current account
      setSyncState("idle"); if (announce) showToast(t("toastSyncNeed") + ((err.message && err.message !== "auth") ? " (" + err.message + ")" : "")); return;
    }
    if (err && err.big) { sync.bigMb = err.mb; if (sync.enabled) setSyncState("error"); else setSyncState("off"); if (announce) showToast(t("syncBigNote", { mb: err.mb })); return; }
    var why = (err && err.auth && err.message && err.message !== "auth") ? " (" + err.message + ")" : "";   // Google's reason code, e.g. access_denied / popup_closed
    if (!sync.enabled) { setSyncState("off"); if (announce) showToast(err && err.gis ? t("toastSyncNoGis") : (err && err.auth ? t("toastSyncNeed") + why : t("toastSyncFail") + " (" + ((err && err.message) || "error") + ")")); }
    else if (err && err.gis) { setSyncState("error"); if (announce) showToast(t("toastSyncNoGis")); }
    else if (err && err.auth) { setSyncState("needsauth"); if (announce) showToast(t("toastSyncNeed") + why); }
    else { setSyncState("error"); if (announce) showToast(t("toastSyncFail") + " (" + ((err && err.message) || "error") + ")"); }
  }).then(function () {
    sync.busy = false;
    setSettingsBusy(false);
    if (sync.again) { sync.again = false; scheduleSync(1500); }
    setTimeout(autoOptimize, 800);
  });
  return sync.promise;
}
// Sign out: the account's data is safe in its Drive, so this device goes back to a clean, signed-out state.
function doSignOut() {
  clearTimeout(sync.timer);
  state.orders = []; tsMap = {}; stripSig = {}; tombs = {}; saveTombs();
  saveData(); renderAll();
  sync.enabled = false; sync.token = ""; sync.exp = 0; sync.fileId = ""; sync.email = ""; sync.last = 0; sync.state = "off";
  sync.rev = 0; sync.syncedRev = 0;
  saveSyncPref(); renderSyncUI();
  // Deliberately NOT revoking the grant: revoking makes Google ask for permission again at every sign-in.
  showToast(t("toastSyncOff"));
}
function syncDisconnect() {
  if (!confirm(t("confirmSyncOff"))) return;
  if (sync.rev !== sync.syncedRev && sync.state !== "needsauth") {   // flush unsynced edits before wiping this device
    showToast(t("syncDoing"));
    runSync(false, false).then(function () {
      if (sync.rev === sync.syncedRev || confirm(t("confirmSyncOffDirty"))) doSignOut();
    });
    return;
  }
  if (sync.rev !== sync.syncedRev && !confirm(t("confirmSyncOffDirty"))) return;
  doSignOut();
}
function initSync() {
  loadTombs(); loadSyncPref(); renderSyncUI();
  document.getElementById("btnSyncConnect").addEventListener("click", function () {
    if (!syncSupported()) { showToast(t("syncFileNote")); return; }
    if (!sync.enabled) { sync.enabled = true; saveSyncPref(); }
    // First connect: always show Google's account chooser so the right account is picked.
    runSync(true, true, sync.last ? undefined : { prompt: "select_account" });
  });
  document.getElementById("btnSyncOff").addEventListener("click", syncDisconnect);
  document.getElementById("btnSyncSwitch").addEventListener("click", function () {
    if (!sync.enabled) return;
    var dirty = sync.rev !== sync.syncedRev;
    if (!confirm(t(dirty ? "confirmSyncSwitchDirty" : "confirmSyncSwitch"))) return;
    runSync(true, true, { prompt: "select_account", fresh: true, replace: true });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && sync.enabled && sync.state !== "needsauth" && Date.now() - sync.last > 120000) runSync(false, false);
  });
  window.addEventListener("online", function () { if (sync.enabled && sync.state !== "needsauth") scheduleSync(1500); });
}
