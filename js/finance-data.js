"use strict";
// ---------- Finance: data layer ----------
// Manual records (income / expense) and categories live in their own IndexedDB store ("fin") and sync
// to their own small Drive file, so editing money never re-uploads order photos.
// Payments for orders are NOT stored here: they are derived from the orders (see orderPayments) so
// nothing is typed twice and nothing can drift out of step.

var FIN_LS_KEY = "preorderVault_fin";           // fallback when IndexedDB is unavailable
var FIN_TOMB_KEY = "preorderVault_fintomb";
var FIN_SEEDED_KEY = "preorderVault_finseeded";
var fin = { items: [], loaded: false };
var finPersisted = {};     // id -> signature of the record as last written
var finTs = {};            // id -> updatedAt as last stamped
var finSig = {};           // id -> signature without updatedAt (detects real edits)
var finTombs = {};         // id -> deletion time
var finWriteChain = Promise.resolve();

var CAT_COLORS = ["#ff953d", "#ff4ace", "#a348ff", "#3db4ff", "#33d6c0", "#69ff32", "#ffe11d", "#ff6b6b", "#9aa0a6"];
// Default categories (names come from i18n via `dk`; renaming one stores `name`). updatedAt stays 0 so a
// second device seeding the same defaults never overrides edits made elsewhere.
var FIN_DEFAULT_CATS = [
  { id: "cat-food",      dk: "food",      type: "expense", color: "#ff953d" },
  { id: "cat-transport", dk: "transport", type: "expense", color: "#3db4ff" },
  { id: "cat-home",      dk: "home",      type: "expense", color: "#69ff32" },
  { id: "cat-orders",    dk: "orders",    type: "expense", color: "#ff4ace" },
  { id: "cat-fun",       dk: "fun",       type: "expense", color: "#a348ff" },
  { id: "cat-health",    dk: "health",    type: "expense", color: "#33d6c0" },
  { id: "cat-bills",     dk: "bills",     type: "expense", color: "#ffe11d" },
  { id: "cat-otherx",    dk: "otherx",    type: "expense", color: "#9aa0a6" },
  { id: "cat-salary",    dk: "salary",    type: "income",  color: "#69ff32" },
  { id: "cat-side",      dk: "side",      type: "income",  color: "#33d6c0" },
  { id: "cat-refund",    dk: "refund",    type: "income",  color: "#3db4ff" },
  { id: "cat-otheri",    dk: "otheri",    type: "income",  color: "#9aa0a6" }
];

// ---- dates ----
function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dateOfStamp(ms) {
  var d = new Date(ms || Date.now());
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---- local persistence ----
function finStripSig(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== "updatedAt") c[k] = o[k]; }); return hashStr(JSON.stringify(c)); }
function finSaveTombs() { try { localStorage.setItem(FIN_TOMB_KEY, JSON.stringify(finTombs)); } catch (e) { /* ignore */ } }
function finInitMaps() {
  finTs = {}; finSig = {}; finPersisted = {};
  fin.items.forEach(function (o) { finTs[o.id] = o.updatedAt || 0; finSig[o.id] = finStripSig(o); finPersisted[o.id] = hashStr(JSON.stringify(o)); });
}
function readFinLS() {
  try { var a = JSON.parse(localStorage.getItem(FIN_LS_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function finValid(x) { return x && typeof x.id === "string" && (x.kind === "tx" || x.kind === "cat"); }

function finSeedDefaults() {
  var seeded = false;
  try { seeded = !!localStorage.getItem(FIN_SEEDED_KEY); } catch (e) { /* ignore */ }
  if (seeded || fin.items.some(function (x) { return x.kind === "cat"; })) return;
  FIN_DEFAULT_CATS.forEach(function (c, i) {
    fin.items.push({ id: c.id, kind: "cat", type: c.type, dk: c.dk, name: "", color: c.color, budget: 0, sort: i });
  });
  try { localStorage.setItem(FIN_SEEDED_KEY, "1"); } catch (e) { /* ignore */ }
  finInitMapsKeepPersisted();
  finPersist(true);
}
function finInitMapsKeepPersisted() {
  fin.items.forEach(function (o) { if (!(o.id in finSig)) { finTs[o.id] = o.updatedAt || 0; finSig[o.id] = finStripSig(o); } });
}

function loadFinance() {
  var source = (useLocalStorage || !dbHandle)
    ? Promise.resolve(readFinLS())
    : idbGetAll(dbHandle, FIN_STORE).catch(function (e) { console.error("finance read", e); return readFinLS(); });
  return source.then(function (rows) {
    fin.items = rows.filter(finValid);
    try { finTombs = JSON.parse(localStorage.getItem(FIN_TOMB_KEY) || "{}") || {}; } catch (e) { finTombs = {}; }
    finInitMaps();
    finSeedDefaults();
    fin.loaded = true;
  });
}

// Writes whatever changed since the last write (all of it when `force`).
function finPersist(force) {
  if (!fin.loaded && !force) return;
  if (useLocalStorage || !dbHandle) {
    try { localStorage.setItem(FIN_LS_KEY, JSON.stringify(fin.items)); } catch (e) { console.error(e); }
    return;
  }
  var sigs = {}, changed = [];
  fin.items.forEach(function (o) {
    var sig = hashStr(JSON.stringify(o));
    sigs[o.id] = sig;
    if (finPersisted[o.id] !== sig) changed.push(o);
  });
  var removed = Object.keys(finPersisted).filter(function (id) { return !(id in sigs); });
  if (!changed.length && !removed.length) return;
  var changedSigs = changed.map(function (o) { return [o.id, sigs[o.id]]; });
  pendingWrites++;
  finWriteChain = finWriteChain.then(function () {
    return idbWrite(dbHandle, changed, removed, FIN_STORE);
  }).then(function () {
    changedSigs.forEach(function (pair) { finPersisted[pair[0]] = pair[1]; });
    removed.forEach(function (id) { delete finPersisted[id]; });
  }).catch(function (e) {
    console.error("Failed to save finance data", e);
    alert(t("alertSaveFail"));
  }).then(function () { pendingWrites--; });
}

// Stamps updatedAt on changed records and records deletions. Returns true if anything changed.
function finStamp() {
  var now = Date.now(), changed = false, present = {};
  fin.items.forEach(function (o) {
    present[o.id] = true;
    var sig = finStripSig(o);
    if (o.id in finSig && finSig[o.id] === sig) {
      if (finTs[o.id]) o.updatedAt = finTs[o.id]; else delete o.updatedAt;
    } else {
      o.updatedAt = now; finTs[o.id] = now; finSig[o.id] = sig; changed = true;
      if (finTombs[o.id]) { delete finTombs[o.id]; finSaveTombs(); }
    }
  });
  var gone = Object.keys(finSig).filter(function (id) { return !present[id]; });
  if (gone.length) {
    gone.forEach(function (id) { finTombs[id] = now; delete finSig[id]; delete finTs[id]; });
    finSaveTombs(); changed = true;
  }
  return changed;
}

function finSave() {
  if (!fin.loaded) return false;
  var changed = finStamp();
  finPersist();
  if (changed) { finSync.rev++; scheduleFinSync(4000); }
  return true;
}

function finClearAll() {
  var ids = Object.keys(finPersisted);
  fin.items = []; finTombs = {}; finSaveTombs();
  finTs = {}; finSig = {}; finPersisted = {};
  if (!useLocalStorage && dbHandle && ids.length) {
    pendingWrites++;
    finWriteChain = finWriteChain.then(function () { return idbWrite(dbHandle, [], ids, FIN_STORE); })
      .catch(function (e) { console.error(e); }).then(function () { pendingWrites--; });
  }
  try { localStorage.removeItem(FIN_SEEDED_KEY); localStorage.removeItem(FIN_LS_KEY); } catch (e) { /* ignore */ }
  finSeedDefaults();
}

// ---- accessors ----
function finCats(type) {
  return fin.items.filter(function (x) { return x.kind === "cat" && (!type || x.type === type); })
    .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
}
function finTxs() { return fin.items.filter(function (x) { return x.kind === "tx"; }); }
function finCatById(id) {
  for (var i = 0; i < fin.items.length; i++) if (fin.items[i].kind === "cat" && fin.items[i].id === id) return fin.items[i];
  return null;
}
function finCatName(c) { return c ? (c.name || (c.dk ? t("cat_" + c.dk) : "")) : t("cat_none"); }
function finCatColor(c) { return c ? (c.color || "#9aa0a6") : "#9aa0a6"; }

// ---- payments derived from orders ----
var PAID_STATUSES = { full: 1, shipping: 1, intransit: 1, received: 1 };
function orderPayments(o) {
  var rows = [];
  if (!o || o.status === "wishlist") return rows;
  var full = Number(o.fullPrice) || 0, dep = Number(o.depositPaid) || 0;
  var pd = o.purchaseDate || dateOfStamp(o.createdAt);
  var name = o.productName || t("noName");
  function add(type, amount, date, kind) {
    if (!(amount > 0)) return;
    rows.push({ src: "order", id: o.id + ":" + kind, orderId: o.id, type: type, amount: amount, date: date,
      cat: type === "income" ? "cat-refund" : "cat-orders", note: name, kind: kind });
  }
  if (o.status === "cancelled") {
    var paid = o.paidFullDate ? full : dep;
    add("expense", paid, pd, "paid");
    if (o.refund && Number(o.refund.amount) > 0) add("income", Number(o.refund.amount), o.refund.date || pd, "refund");
  } else if (o.status === "deposit") {
    add("expense", dep, pd, "deposit");
  } else if (dep > 0 && dep < full) {
    add("expense", dep, pd, "deposit");
    add("expense", full - dep, o.paidFullDate || pd, "balance");
  } else {
    add("expense", full, o.paidFullDate || pd, "full");
  }
  return rows;
}
// Amount an order's seller has actually been paid (used by the refund prompt).
function orderPaidTotal(o) {
  return orderPayments(o).reduce(function (s, r) { return s + (r.type === "expense" ? r.amount : 0); }, 0);
}

function finAllRows() {
  var rows = [];
  finTxs().forEach(function (x) {
    rows.push({ src: "tx", id: x.id, type: x.type, amount: Number(x.amount) || 0, date: x.date || "", cat: x.cat, note: x.note || "" });
  });
  state.orders.forEach(function (o) { orderPayments(o).forEach(function (r) { rows.push(r); }); });
  return rows;
}
function finRowsOfMonth(key) {
  return finAllRows().filter(function (r) { return r.date && r.date.slice(0, 7) === key; });
}
function finTotals(rows) {
  var inc = 0, exp = 0;
  rows.forEach(function (r) { if (r.type === "income") inc += r.amount; else exp += r.amount; });
  return { income: inc, expense: exp, balance: inc - exp };
}
function finSortRows(rows) {
  return rows.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.src === "tx" ? 0 : 1) - (b.src === "tx" ? 0 : 1);
  });
}
function monthKeyOf(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function shiftMonthKey(key, delta) {
  var p = key.split("-"), d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + delta, 1);
  return monthKeyOf(d);
}
function monthLabelOf(key, short) {
  var p = key.split("-"), d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1);
  return d.toLocaleDateString(I18N[state.lang].locale, short ? { month: "short" } : { month: "long", year: "numeric" });
}

// ---- order status changes: record when the balance was paid ----
// Mutates `o` (already given its new status). Returns { amount, prevDate } when a balance payment was just
// recorded (so the caller can offer undo / change-date), otherwise null.
function financeOnStatusChange(o, oldStatus) {
  var prev = o.paidFullDate || "";
  if (o.status === "deposit" || o.status === "wishlist") { delete o.paidFullDate; return null; }
  if (PAID_STATUSES[o.status] && oldStatus === "deposit" && !o.paidFullDate) {
    var bal = (Number(o.fullPrice) || 0) - (Number(o.depositPaid) || 0);
    o.paidFullDate = todayStr();
    if (bal > 0) return { amount: bal, prevDate: prev };
  }
  return null;
}
