"use strict";
// ---------- Storage ----------
// Orders live in IndexedDB (one record per order, so large photos don't hit the ~5MB
// localStorage cap). If IndexedDB is unavailable, falls back to localStorage.
var DB_NAME = "preorderVault";
var ORDER_STORE = "orders";
var useLocalStorage = false;
var dbHandle = null;
// Short fingerprint of a (possibly huge) string, so change tracking does not keep full copies of every image in memory.
function hashStr(str) {
  var h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (var i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + "." + str.length.toString(36);
}
var persistedSig = {};       // id -> serialized order as last written
var writeChain = Promise.resolve();
var pendingWrites = 0;

function openDb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(new Error("IndexedDB not supported")); return; }
    var req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(ORDER_STORE)) {
        req.result.createObjectStore(ORDER_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
    req.onblocked = function () { reject(new Error("IndexedDB blocked")); };
  });
}

function idbGetAll(db) {
  return new Promise(function (resolve, reject) {
    var req = db.transaction(ORDER_STORE, "readonly").objectStore(ORDER_STORE).getAll();
    req.onsuccess = function () { resolve(req.result || []); };
    req.onerror = function () { reject(req.error); };
  });
}

function idbWrite(db, putList, deleteIds) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(ORDER_STORE, "readwrite");
    var store = tx.objectStore(ORDER_STORE);
    putList.forEach(function (o) { store.put(o); });
    deleteIds.forEach(function (id) { store.delete(id); });
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error || new Error("Transaction aborted")); };
  });
}

function readLegacyOrders() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("Failed to read legacy data", e);
    return [];
  }
}

// Returns a promise; resolves once state.orders is populated.
function loadData() {
  return openDb().then(function (db) {
    dbHandle = db;
    return idbGetAll(db).then(function (rows) {
      if (!rows.length) {
        // First run on IndexedDB: bring over anything saved by the older localStorage version.
        var legacy = readLegacyOrders();
        if (legacy.length) {
          return idbWrite(db, legacy, []).then(function () {
            return idbGetAll(db);
          }).then(function (check) {
            if (check.length === legacy.length) {
              try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
            }
            return check;
          });
        }
      }
      return rows;
    });
  }).then(function (rows) {
    state.orders = rows;
    rows.forEach(function (o) { persistedSig[o.id] = hashStr(JSON.stringify(o)); });
    if (navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist(); } catch (e) { /* ignore */ }
    }
  }).catch(function (e) {
    console.error("IndexedDB unavailable, using localStorage", e);
    useLocalStorage = true;
    state.orders = readLegacyOrders();
  });
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
    return true;
  } catch (e) {
    console.error("Failed to save data", e);
    alert(t("alertSaveFail"));
    return false;
  }
}

// Keeps the old synchronous contract (returns true = accepted); the actual write is queued.
function saveData() {
  if (!state.loaded) return false;
  if (stampOrders()) scheduleSync(4000);
  if (useLocalStorage) return saveToLocalStorage();

  var sigs = {};
  var changed = [];
  state.orders.forEach(function (o) {
    var sig = hashStr(JSON.stringify(o));
    sigs[o.id] = sig;
    if (persistedSig[o.id] !== sig) changed.push(o);
  });
  var removed = Object.keys(persistedSig).filter(function (id) { return !(id in sigs); });
  if (!changed.length && !removed.length) return true;

  var changedSigs = changed.map(function (o) { return [o.id, sigs[o.id]]; });
  pendingWrites++;
  writeChain = writeChain.then(function () {
    return idbWrite(dbHandle, changed, removed);
  }).then(function () {
    changedSigs.forEach(function (pair) { persistedSig[pair[0]] = pair[1]; });
    removed.forEach(function (id) { delete persistedSig[id]; });
  }).catch(function (e) {
    console.error("Failed to save data", e);
    alert(t("alertSaveFail"));
  }).then(function () { pendingWrites--; });
  return true;
}

window.addEventListener("beforeunload", function (e) {
  if (pendingWrites > 0) { e.preventDefault(); e.returnValue = ""; }
});

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}
