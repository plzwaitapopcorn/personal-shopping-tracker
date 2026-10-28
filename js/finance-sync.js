"use strict";
// ---------- Finance: Drive sync (its own small file, so money edits never re-upload order photos) ----------
var FIN_FILE_NAME = "daybook-finance.json";
var FIN_FILE_KEY = "preorderVault_finfile";
var finSync = { rev: 0, syncedRev: 0, timer: null, busy: false, fileId: "" };
try { finSync.fileId = localStorage.getItem(FIN_FILE_KEY) || ""; } catch (e) { /* ignore */ }
function finSaveFileId() { try { localStorage.setItem(FIN_FILE_KEY, finSync.fileId || ""); } catch (e) { /* ignore */ } }

function finFindRemote() {
  var url = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&orderBy=createdTime&pageSize=10" +
    "&fields=" + encodeURIComponent("files(id,createdTime)") + "&q=" + encodeURIComponent("name='" + FIN_FILE_NAME + "' and trashed=false");
  return gfetch(url).then(function (r) { return r.json(); }).then(function (j) {
    return (j.files && j.files.length) ? j.files[0].id : "";
  });
}
function finDownload() {
  function dl() { return gfetch("https://www.googleapis.com/drive/v3/files/" + finSync.fileId + "?alt=media").then(function (r) { return r.json(); }); }
  var ready = finSync.fileId ? Promise.resolve() : finFindRemote().then(function (id) { finSync.fileId = id; finSaveFileId(); });
  return ready.then(function () {
    if (!finSync.fileId) return null;
    return dl().catch(function (e) {
      if (e.status === 404) { finSync.fileId = ""; return finFindRemote().then(function (id) { finSync.fileId = id; finSaveFileId(); return id ? dl() : null; }); }
      throw e;
    });
  });
}
function finUpload(bodyStr) {
  var existing = !!finSync.fileId;
  var url = "https://www.googleapis.com/upload/drive/v3/files" + (existing ? "/" + finSync.fileId : "") + "?uploadType=resumable&fields=id";
  var meta = existing ? {} : { name: FIN_FILE_NAME, parents: ["appDataFolder"] };
  return gfetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/json" },
    body: JSON.stringify(meta)
  }).then(function (r) {
    var loc = r.headers.get("Location");
    if (!loc) throw new Error("no upload url");
    return gfetch(loc, { method: "PUT", headers: { "Content-Type": "application/json" }, body: bodyStr });
  }).then(function (r) { return r.json(); }).then(function (f) { if (f && f.id) { finSync.fileId = f.id; finSaveFileId(); } });
}

function finFingerprint(items, tb) {
  return items.map(function (o) { return o.id + "@" + (o.updatedAt || 0); }).sort().join("|") + "#" +
    Object.keys(tb).sort().map(function (k) { return k + "@" + tb[k]; }).join("|");
}
function finBuildPayload() { return JSON.stringify({ v: 1, savedAt: Date.now(), items: fin.items, tombs: finTombs }); }
function finRemoteParts(remote) {
  return {
    items: (remote && Array.isArray(remote.items)) ? remote.items.filter(finValid) : [],
    tombs: (remote && remote.tombs && typeof remote.tombs === "object") ? remote.tombs : {}
  };
}
function finMerge(remote) {
  var rp = finRemoteParts(remote);
  var tb = {}, now = Date.now();
  [finTombs, rp.tombs].forEach(function (src) {
    Object.keys(src).forEach(function (id) { if (now - src[id] < TOMB_KEEP_MS) tb[id] = Math.max(tb[id] || 0, src[id]); });
  });
  var byId = {};
  fin.items.forEach(function (o) { byId[o.id] = o; });
  rp.items.forEach(function (r) {
    var cur = byId[r.id];
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) byId[r.id] = r;
  });
  var merged = [];
  Object.keys(byId).forEach(function (id) {
    var o = byId[id];
    if (tb[id] && tb[id] >= (o.updatedAt || 0)) return;
    if (tb[id]) delete tb[id];
    merged.push(o);
  });
  return { items: merged, tombs: tb, remote: rp };
}
function finAdopt(items, tombs) {
  fin.items = items; finTombs = tombs; finSaveTombs();
  finTs = {}; finSig = {};
  fin.items.forEach(function (o) { finTs[o.id] = o.updatedAt || 0; finSig[o.id] = finStripSig(o); });
  finPersist(true);
  if (typeof finRenderAll === "function") finRenderAll();
}
function finMergeAndApply(remote) {
  var m = finMerge(remote);
  var localFp = finFingerprint(fin.items, finTombs), mergedFp = finFingerprint(m.items, m.tombs);
  if (mergedFp !== localFp) finAdopt(m.items, m.tombs);
  return { needUpload: !remote || mergedFp !== finFingerprint(m.remote.items, m.remote.tombs) };
}
// Different Google account: this device shows that account's finance data only.
function finApplyReplace(remote) {
  var rp = finRemoteParts(remote);
  fin.items = []; finTombs = {}; finSig = {}; finTs = {};
  try { localStorage.removeItem(FIN_SEEDED_KEY); } catch (e) { /* ignore */ }
  finAdopt(rp.items, Object.assign({}, rp.tombs));
  if (!rp.items.some(function (x) { return x.kind === "cat"; })) { finSeedDefaults(); }
  return { needUpload: !remote };
}

// One finance sync pass (token must already be valid).
function finSyncCore(replace) {
  var rv = finSync.rev;
  return finDownload().then(function (remote) {
    var r = replace ? finApplyReplace(remote) : finMergeAndApply(remote);
    return r.needUpload ? finUpload(finBuildPayload()) : null;
  }).then(function () { if (finSync.rev === rv) finSync.syncedRev = rv; });
}

function scheduleFinSync(ms) {
  if (!sync.enabled || sync.state === "needsauth") return;
  clearTimeout(finSync.timer);
  finSync.timer = setTimeout(runFinSync, ms);
}
// Finance-only sync after a money edit: never touches the orders file.
function runFinSync() {
  if (!sync.enabled || !syncSupported()) return Promise.resolve();
  if (sync.busy || finSync.busy) { scheduleFinSync(2000); return Promise.resolve(); }
  finSync.busy = true;
  return getToken(false).then(function () { return finSyncCore(false); }).then(function () {
    sync.last = Date.now(); saveSyncPref(); if (sync.state !== "needsauth") setSyncState("idle");
  }).catch(function (err) {
    console.error("finance sync", err);
    if (err && err.auth) setSyncState("needsauth"); else setSyncState("error");
  }).then(function () { finSync.busy = false; });
}
function syncDirty() { return sync.rev !== sync.syncedRev || finSync.rev !== finSync.syncedRev; }
