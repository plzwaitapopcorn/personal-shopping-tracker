"use strict";
// ---------- App shell: navigation registry, hash router, quick-add ----------
// To add a feature area later: push an entry into NAV_ITEMS (+ a page <section id="page-xxx"> in index.html),
// optionally a QUICK_ADDS entry, and register its widgets in home.js. Nothing else needs to change.

var NAV_ITEMS = [
  { page: "home",     icon: "home", labelKey: "navHome",   tabKey: "navHome",      group: "" },
  { page: "orders",   icon: "bag",  labelKey: "navOrders", tabKey: "navOrdersTab", group: "navGroupOrders", tileKey: "navGroupOrders",
    count: function () { return state.orders.length; },
    tileSub: function () { return t("tileOrdersSub", { n: state.orders.length }); } }
];

var QUICK_ADDS = [
  { id: "order", icon: "bag", labelKey: "addOrderBtn", run: function () { openOrderModal(); } }
];

var PAGE_IDS = ["home", "orders", "settings"];
var currentPageId = "";

function pageFromHash() {
  var m = /^#\/([a-z]+)/.exec(location.hash || "");
  return (m && PAGE_IDS.indexOf(m[1]) !== -1) ? m[1] : "home";
}

function navigate(page) {
  if (PAGE_IDS.indexOf(page) === -1) page = "home";
  if (pageFromHash() === page && location.hash) { showPage(page); return; }
  location.hash = "#/" + page;     // hashchange -> showPage
}

function showPage(page) {
  if (PAGE_IDS.indexOf(page) === -1) page = "home";
  var changed = page !== currentPageId;
  currentPageId = page;
  Array.prototype.forEach.call(document.querySelectorAll(".page"), function (el) {
    el.hidden = el.getAttribute("data-page") !== page;
  });
  renderNav();
  if (changed) {
    window.scrollTo(0, 0);
    if (page !== "home" && typeof homeEditOff === "function") homeEditOff();
  }
  if (page === "home" && typeof renderHome === "function") renderHome();
  if (page === "orders" && typeof renderAll === "function" && state.loaded) renderGrid();
}

function svgIcon(name) {
  return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

function renderNav() {
  var nav = document.getElementById("navMain");
  var tabs = document.getElementById("tabbar");
  if (!nav || !tabs) return;
  var html = "", lastGroup = null;
  NAV_ITEMS.forEach(function (it) {
    if (it.group !== lastGroup) {
      lastGroup = it.group;
      if (it.group) html += '<div class="nav-group">' + escapeHtml(t(it.group)) + "</div>";
    }
    var n = it.count ? it.count() : null;
    html += '<a class="nav-item' + (currentPageId === it.page ? " on" : "") + '" href="#/' + it.page + '"' +
      (currentPageId === it.page ? ' aria-current="page"' : "") + ">" + svgIcon(it.icon) +
      "<span>" + escapeHtml(t(it.labelKey)) + "</span>" +
      (n != null ? '<span class="n">' + n + "</span>" : "") + "</a>";
  });
  nav.innerHTML = html;
  var st = document.querySelector("#sidebar .js-settings-btn");
  if (st) st.classList.toggle("on", currentPageId === "settings");

  // Bottom tab bar (phones): one tab per nav item, the quick-add "+" in the middle.
  var items = NAV_ITEMS.map(function (it) {
    return '<a class="tab' + (currentPageId === it.page ? " on" : "") + '" href="#/' + it.page + '">' + svgIcon(it.icon) +
      "<span>" + escapeHtml(t(it.tabKey)) + "</span></a>";
  });
  var plus = '<button type="button" class="tab-plus" id="tabPlus" aria-label="' + escapeHtml(t("quickAddTitle")) + '">' + svgIcon("plus") + "</button>";
  items.splice(Math.ceil(items.length / 2), 0, plus);
  tabs.innerHTML = items.join("");
}

// Account chip at the bottom of the sidebar (mirrors the Settings page account block).
function renderNavAccount() {
  var box = document.getElementById("sideAcct");
  if (!box) return;
  box.hidden = !sync.enabled;
  if (!sync.enabled) return;
  var em = sync.email || t("syncAcctFallback");
  document.getElementById("sideEmail").textContent = em;
  document.getElementById("sideAvatar").textContent = (sync.email || "G").charAt(0);
  var note = document.getElementById("syncNote");
  document.getElementById("sideSync").textContent = note ? note.textContent : "";
}

// ---- Quick add (the "+" in the tab bar and the Home buttons) ----
function runQuickAdd() {
  if (QUICK_ADDS.length === 1) { QUICK_ADDS[0].run(); return; }
  var list = document.getElementById("quickSheetList");
  list.innerHTML = QUICK_ADDS.map(function (q, i) {
    return '<button type="button" class="quick-item" data-qa="' + i + '">' + svgIcon(q.icon) + "<span>" + escapeHtml(t(q.labelKey)) + "</span></button>";
  }).join("");
  document.getElementById("quickSheetOverlay").classList.add("open");
}
function closeQuickSheet() { document.getElementById("quickSheetOverlay").classList.remove("open"); }

function initRouter() {
  // The app always opens on Home, whatever hash the URL carries.
  if (location.hash) {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  window.addEventListener("hashchange", function () { showPage(pageFromHash()); });
  document.getElementById("tabbar").addEventListener("click", function (e) {
    if (e.target.closest("#tabPlus")) runQuickAdd();
  });
  document.getElementById("quickSheetOverlay").addEventListener("click", function (e) {
    if (e.target === this) { closeQuickSheet(); return; }
    var b = e.target.closest("[data-qa]");
    if (b) { closeQuickSheet(); QUICK_ADDS[parseInt(b.getAttribute("data-qa"), 10)].run(); }
  });
  document.getElementById("btnThemeQuick").addEventListener("click", function () {
    setMode(state.theme === "light" ? "dark" : "light");
  });
  document.getElementById("sideAcct").addEventListener("click", function () { /* plain link to #/settings */ });
  showPage("home");
}
