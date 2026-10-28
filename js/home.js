"use strict";
// ---------- Home: area tiles + a registry of widgets the user can show / hide / reorder ----------
// To add a widget for a new feature: push { id, titleKey, size, render(body) } into HOME_WIDGETS.
// New widgets appear at the end of the page automatically; the user can then move or hide them.
//   size: "s" = quarter row, "m" = half row, "l" = full row.

var HOME_KEY = "preorderVault_home";
var homePrefs = { order: [], hidden: [] };
var homeEdit = false;

(function loadHomePrefs() {
  try {
    var p = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
    if (p && Array.isArray(p.order)) homePrefs.order = p.order.filter(function (x) { return typeof x === "string"; });
    if (p && Array.isArray(p.hidden)) homePrefs.hidden = p.hidden.filter(function (x) { return typeof x === "string"; });
  } catch (e) { /* ignore */ }
})();
function saveHomePrefs() {
  try { localStorage.setItem(HOME_KEY, JSON.stringify(homePrefs)); } catch (e) { /* ignore */ }
}

// ---- data helpers shared by widgets ----
function activeOrders() {
  return state.orders.filter(function (o) { return o.status !== "cancelled" && o.status !== "wishlist"; });
}
function shortDate(dateStr) {
  if (!dateStr) return "";
  var d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(I18N[state.lang].locale, { day: "numeric", month: "short" });
}
function homeThumb(o) {
  return o.mainImage
    ? '<img src="' + (o.mainThumb || o.mainImage).replace(/"/g, "&quot;") + '" alt="" loading="lazy">'
    : placeholderSvg();
}
function homeRow(o, sub, right, rightSub, tag) {
  return '<button type="button" class="hrow" data-open="' + o.id + '">' +
    '<span class="hrow-thumb">' + homeThumb(o) + "</span>" +
    '<span class="hrow-main"><span class="hrow-t">' + nameHtml(o) + (tag || "") + "</span>" +
    '<span class="hrow-s">' + sub + "</span></span>" +
    '<span class="hrow-r">' + right + (rightSub ? "<small>" + rightSub + "</small>" : "") + "</span></button>";
}
function homeEmpty(key) { return '<div class="hempty">' + escapeHtml(t(key)) + "</div>"; }
function statTag(status) {
  var color = "var(--status-" + (status === "intransit" ? "intransit" : status) + ")";
  return '<span class="htag" style="color:' + color + '">' + escapeHtml(statusLabel(status)) + "</span>";
}

// ---- widgets ----
var HOME_WIDGETS = [
  { id: "stat-due", titleKey: "wStatDue", size: "s", icon: "clock", render: function (b) {
      var list = activeOrders().filter(function (o) { return remainingOf(o) > 0; });
      var sum = list.reduce(function (s, o) { return s + remainingOf(o); }, 0);
      var next = list.map(function (o) { return o.dueDate; }).filter(Boolean).sort()[0];
      b.innerHTML = '<div class="big' + (sum > 0 ? " dn" : "") + '">฿' + money(sum) + "</div>" +
        '<div class="sub">' + escapeHtml(t("statDueSub", { n: list.length }) + (next ? " · " + t("statDueNext", { date: shortDate(next) }) : "")) + "</div>";
    } },
  { id: "stat-wait", titleKey: "wStatWait", size: "s", icon: "truck", render: function (b) {
      var c = { full: 0, shipping: 0, intransit: 0 };
      state.orders.forEach(function (o) { if (c[o.status] != null) c[o.status]++; });
      b.innerHTML = '<div class="big">' + (c.full + c.shipping + c.intransit) + "</div>" +
        '<div class="sub">' + escapeHtml(t("statWaitSub", { a: c.intransit, b: c.shipping + c.full })) + "</div>";
    } },
  { id: "stat-received", titleKey: "wStatReceived", size: "s", icon: "check", render: function (b) {
      var list = activeOrders();
      var got = list.filter(function (o) { return o.status === "received"; }).length;
      var pct = list.length ? Math.round(got / list.length * 100) : 0;
      b.innerHTML = '<div class="big">' + got + ' <span class="of">' + escapeHtml(t("statOfTotal", { n: list.length })) + "</span></div>" +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
    } },
  { id: "stat-spent", titleKey: "wStatSpent", size: "s", icon: "bag", render: function (b) {
      var list = activeOrders();
      var sum = list.reduce(function (s, o) { return s + (Number(o.fullPrice) || 0); }, 0);
      b.innerHTML = '<div class="big">฿' + money(sum) + "</div>" +
        '<div class="sub">' + escapeHtml(t("statSpentSub", { n: list.length })) + "</div>";
    } },
  { id: "due-soon", titleKey: "wDueSoon", size: "m", more: { page: "orders", status: "deposit" }, render: function (b) {
      var list = activeOrders().filter(function (o) { return remainingOf(o) > 0; });
      list.sort(function (a, c) {
        var da = a.dueDate || "9999", dc = c.dueDate || "9999";
        if (da !== dc) return da < dc ? -1 : 1;
        return (a.purchaseDate || "") < (c.purchaseDate || "") ? -1 : 1;
      });
      if (!list.length) { b.innerHTML = homeEmpty("emptyDue"); return; }
      b.innerHTML = list.slice(0, 5).map(function (o) {
        var sub = escapeHtml(o.shopName || t("noShop")) + (Number(o.depositPaid) ? " · " + escapeHtml(t("depositPaidShort", { n: money(o.depositPaid) })) : "");
        return homeRow(o, sub, '<span class="dn">฿' + money(remainingOf(o)) + "</span>",
          o.dueDate ? escapeHtml(t("dueOn", { date: shortDate(o.dueDate) })) : "");
      }).join("");
    } },
  { id: "incoming", titleKey: "wIncoming", size: "m", more: { page: "orders", status: "all" }, render: function (b) {
      var rank = { intransit: 0, shipping: 1, full: 2 };
      var list = state.orders.filter(function (o) { return rank[o.status] != null; });
      list.sort(function (a, c) { return rank[a.status] - rank[c.status]; });
      if (!list.length) { b.innerHTML = homeEmpty("emptyIncoming"); return; }
      b.innerHTML = list.slice(0, 5).map(function (o) {
        var sub = escapeHtml(o.shopName || t("noShop")) + (o.trackingNumber ? " · " + escapeHtml(o.trackingNumber) : "");
        return homeRow(o, sub, "", "", statTag(o.status));
      }).join("");
    } },
  { id: "recent-orders", titleKey: "wRecent", size: "m", more: { page: "orders", status: "all" }, render: function (b) {
      var list = state.orders.filter(function (o) { return o.status !== "cancelled"; });
      list.sort(function (a, c) { return (c.createdAt || 0) - (a.createdAt || 0); });
      if (!list.length) { b.innerHTML = homeEmpty("emptyRecent"); return; }
      b.innerHTML = list.slice(0, 5).map(function (o) {
        return homeRow(o, escapeHtml(o.shopName || t("noShop")), priceHtml(o), formatDateLong(o.purchaseDate), "");
      }).join("");
    } }
];

function homeWidgetById(id) {
  for (var i = 0; i < HOME_WIDGETS.length; i++) if (HOME_WIDGETS[i].id === id) return HOME_WIDGETS[i];
  return null;
}
// order = every known widget id (hidden ones keep a slot); visible = order minus hidden
function homeSyncOrder() {
  var known = HOME_WIDGETS.map(function (w) { return w.id; });
  homePrefs.order = homePrefs.order.filter(function (id) { return known.indexOf(id) !== -1; });
  known.forEach(function (id) { if (homePrefs.order.indexOf(id) === -1) homePrefs.order.push(id); });
  homePrefs.hidden = homePrefs.hidden.filter(function (id) { return known.indexOf(id) !== -1; });
}
function homeVisibleIds() {
  homeSyncOrder();
  return homePrefs.order.filter(function (id) { return homePrefs.hidden.indexOf(id) === -1; });
}

function homeMove(id, dir) {
  var vis = homeVisibleIds();
  var i = vis.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= vis.length) return;
  var a = homePrefs.order.indexOf(vis[i]), b = homePrefs.order.indexOf(vis[j]);
  var tmp = homePrefs.order[a]; homePrefs.order[a] = homePrefs.order[b]; homePrefs.order[b] = tmp;
  saveHomePrefs(); renderHome();
}
function homeHide(id) {
  if (homePrefs.hidden.indexOf(id) === -1) homePrefs.hidden.push(id);
  saveHomePrefs(); renderHome();
}
function homeShow(id) {
  homePrefs.hidden = homePrefs.hidden.filter(function (x) { return x !== id; });
  homePrefs.order = homePrefs.order.filter(function (x) { return x !== id; });
  homePrefs.order.push(id);                      // a re-added widget lands at the end, where it is easy to see
  saveHomePrefs(); renderHome();
}
function homeEditOff() { if (homeEdit) { homeEdit = false; if (currentPageId === "home") renderHome(); } }

function renderHomeHeader() {
  var eb = document.getElementById("headerEyebrow");
  if (eb) eb.textContent = new Date().toLocaleDateString(I18N[state.lang].locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  var act = document.getElementById("homeActions");
  var html = '<button type="button" class="btn-ghost-sm" id="btnHomeEdit">' + svgIcon("edit") + "<span>" +
    escapeHtml(t(homeEdit ? "homeEditDone" : "homeEdit")) + "</span></button>";
  QUICK_ADDS.forEach(function (q, i) {
    html += '<button type="button" class="' + (q.primary ? "btn-primary" : "btn-ghost-sm") + ' home-qa" data-qa="' + i + '">' + svgIcon("plus") + "<span>" + escapeHtml(t(q.labelKey)) + "</span></button>";
  });
  act.innerHTML = html;
}

function renderHomeTiles() {
  var box = document.getElementById("homeTiles");
  box.innerHTML = NAV_ITEMS.filter(function (it) { return it.tileSub; }).map(function (it) {
    return '<a class="tile" href="#/' + it.page + '">' + svgIcon(it.tileIcon || it.icon) + "<b>" + escapeHtml(t(it.tileKey || it.labelKey)) + "</b><small>" +
      escapeHtml(it.tileSub()) + "</small></a>";
  }).join("");
}

function renderHome() {
  if (!document.getElementById("homeGrid")) return;
  renderHomeHeader();
  var grid = document.getElementById("homeGrid");
  if (!state.loaded) { grid.innerHTML = ""; return; }
  renderHomeTiles();
  var vis = homeVisibleIds();
  grid.className = "home-grid" + (homeEdit ? " editing" : "");
  grid.innerHTML = "";
  vis.forEach(function (id, idx) {
    var w = homeWidgetById(id);
    var card = document.createElement("section");
    card.className = "hw hw-" + w.size;
    card.setAttribute("data-wid", id);
    var head = '<h4>' + (w.icon ? svgIcon(w.icon) : "") + escapeHtml(t(w.titleKey)) +
      (w.more && !homeEdit ? '<a class="hw-more" href="#/' + w.more.page + '"' + (w.more.status !== undefined ? ' data-more="' + w.more.status + '"' : "") + ">" + escapeHtml(t("seeAll")) + "</a>" : "") + "</h4>";
    card.innerHTML = head + '<div class="hw-body"></div>';
    if (homeEdit) {
      var tools = document.createElement("div");
      tools.className = "hw-tools";
      tools.innerHTML =
        '<button type="button" data-wmove="-1" aria-label="' + escapeHtml(t("homeMoveEarlier")) + '"' + (idx === 0 ? " disabled" : "") + '>&#9664;</button>' +
        '<button type="button" data-wmove="1" aria-label="' + escapeHtml(t("homeMoveLater")) + '"' + (idx === vis.length - 1 ? " disabled" : "") + '>&#9654;</button>' +
        '<button type="button" data-whide="1" aria-label="' + escapeHtml(t("homeHide")) + '">&#10005;</button>';
      card.appendChild(tools);
    }
    w.render(card.querySelector(".hw-body"));
    grid.appendChild(card);
  });
  if (!vis.length) grid.innerHTML = '<div class="hempty wide">' + escapeHtml(t("homeNone")) + "</div>";

  var panel = document.getElementById("homeAddPanel");
  panel.hidden = !homeEdit;
  if (homeEdit) {
    var hidden = homePrefs.order.filter(function (id) { return homePrefs.hidden.indexOf(id) !== -1; });
    document.getElementById("homeAddList").innerHTML = hidden.length
      ? hidden.map(function (id) {
          return '<button type="button" class="chp-add" data-wshow="' + id + '">' + svgIcon("plus") + "<span>" + escapeHtml(t(homeWidgetById(id).titleKey)) + "</span></button>";
        }).join("")
      : '<span class="hempty">' + escapeHtml(t("homeNoHidden")) + "</span>";
  }
}

function initHome() {
  var page = document.getElementById("page-home");
  page.addEventListener("click", function (e) {
    var el;
    if ((el = e.target.closest("#btnHomeEdit"))) { homeEdit = !homeEdit; renderHome(); return; }
    if ((el = e.target.closest(".home-qa"))) { QUICK_ADDS[parseInt(el.getAttribute("data-qa"), 10)].run(); return; }
    if ((el = e.target.closest("[data-wmove]"))) { homeMove(el.closest("[data-wid]").getAttribute("data-wid"), parseInt(el.getAttribute("data-wmove"), 10)); return; }
    if ((el = e.target.closest("[data-whide]"))) { homeHide(el.closest("[data-wid]").getAttribute("data-wid")); return; }
    if ((el = e.target.closest("[data-wshow]"))) { homeShow(el.getAttribute("data-wshow")); return; }
    if ((el = e.target.closest("[data-open]"))) { if (!homeEdit) openDetailModal(el.getAttribute("data-open")); return; }
    if ((el = e.target.closest("[data-more]"))) {
      state.status = el.getAttribute("data-more") || "all";
      syncStatusFilterUI();
      renderGrid();
    }
  });
}
