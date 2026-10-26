"use strict";
// ---------- Rendering: stats ----------
function renderStats() {
  // Cancelled orders and wishlist items are left out of the summary figures (received,
  // spent, balance); they still appear in the status counts below.
  var orders = state.orders.filter(function (o) { return o.status !== "cancelled" && o.status !== "wishlist"; });
  var total = orders.length;
  var receivedCount = orders.filter(function (o) { return o.status === "received"; }).length;

  document.getElementById("statReceived").textContent = receivedCount;
  document.getElementById("statOfTotal").textContent = t("statOfTotal", { n: total });
  var pct = total > 0 ? Math.round((receivedCount / total) * 100) : 0;
  document.getElementById("statProgressFill").style.width = pct + "%";

  var totalSpent = orders.reduce(function (sum, o) { return sum + (Number(o.fullPrice) || 0); }, 0);
  document.getElementById("statSpent").textContent = "฿" + money(totalSpent);

  var totalRemain = orders.reduce(function (sum, o) { return sum + remainingOf(o); }, 0);
  var remainEl = document.getElementById("statRemain");
  remainEl.textContent = "฿" + money(totalRemain);
  remainEl.classList.toggle("has-due", totalRemain > 0);

  // Per-status counts for the rail rows and the mobile chips (all orders).
  var counts = { all: state.orders.length };
  state.orders.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
  Array.prototype.forEach.call(document.querySelectorAll("[data-count]"), function (el) {
    el.textContent = counts[el.getAttribute("data-count")] || 0;
  });
  syncStatusFilterUI();
}

function syncStatusFilterUI() {
  Array.prototype.forEach.call(document.querySelectorAll("#statusChips .chip, .rail-row"), function (el) {
    el.classList.toggle("active", el.getAttribute("data-status") === state.status);
  });
  var clear = document.getElementById("btnClearStatus");
  if (clear) clear.hidden = state.status === "all";
}

// ---------- Rendering: month filter options ----------
function refreshViewHints() {
  var g = document.getElementById("btnGroupToggle");
  var v = document.getElementById("btnViewToggle");
  if (!g || !v) return;
  var gTitle = t("groupToggleTitle") + ": " + t(viewPrefs.group ? "toggleOn" : "toggleOff");
  g.setAttribute("title", gTitle); g.setAttribute("aria-label", gTitle);
  g.classList.toggle("is-active", viewPrefs.group);
  var vTitle = t("viewToggleTitle") + ": " + t(viewPrefs.view === "list" ? "viewList" : "viewCards");
  v.setAttribute("title", vTitle); v.setAttribute("aria-label", vTitle);
  v.classList.toggle("is-active", viewPrefs.view === "list");
  document.getElementById("viewIconCards").style.display = viewPrefs.view === "list" ? "none" : "";
  document.getElementById("viewIconList").style.display = viewPrefs.view === "list" ? "" : "none";
}
function initViewToggles() {
  var g = document.getElementById("btnGroupToggle");
  var v = document.getElementById("btnViewToggle");
  g.addEventListener("click", function () {
    viewPrefs.group = !viewPrefs.group; saveViewPrefs(); refreshViewHints(); renderGrid();
  });
  v.addEventListener("click", function () {
    viewPrefs.view = viewPrefs.view === "list" ? "cards" : "list"; saveViewPrefs(); refreshViewHints(); renderGrid();
  });
  refreshViewHints();
}
function refreshToolbarHints() {
  [["sortSelect", "sortTitle", "status"], ["monthSelect", "monthTitle", "all"]].forEach(function (cfg) {
    var sel = document.getElementById(cfg[0]);
    var wrap = sel.parentNode;
    var label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
    wrap.setAttribute("title", t(cfg[1]) + ": " + label);
    sel.setAttribute("aria-label", t(cfg[1]) + ": " + label);
    wrap.classList.toggle("is-active", sel.value !== cfg[2]);
  });
}

function renderMonthOptions() {
  var sel = document.getElementById("monthSelect");
  var current = sel.value || "all";
  var keys = {};
  state.orders.forEach(function (o) {
    var k = monthYearKey(o.purchaseDate);
    if (k) keys[k] = true;
  });
  var sorted = Object.keys(keys).sort().reverse();
  sel.innerHTML = '<option value="all">' + t("monthAll") + "</option>" +
    sorted.map(function (k) {
      return '<option value="' + k + '">' + escapeHtml(monthYearLabel(k)) + "</option>";
    }).join("");
  if (sorted.indexOf(current) !== -1 || current === "all") {
    sel.value = current;
  } else {
    sel.value = "all";
    state.monthYear = "all";
  }
  refreshToolbarHints();
}

var COURIER_INFO = {
  thailandpost: {
    nameKey: "courierThailandPost",
    urlFn: function (code) { return "https://track.thailandpost.co.th/?trackNumber=" + encodeURIComponent(code); }
  },
  kerry: { nameKey: "courierKerry", copy: true, urlFn: function () { return "https://th.kex-express.com/th/track/"; } },
  dhl: {
    nameKey: "courierDHL",
    urlFn: function (code) { return "https://www.dhl.com/th-en/home/tracking.html?tracking-id=" + encodeURIComponent(code) + "&submit=1"; }
  },
  // These official pages have no prefill link, so the tracking number is copied to the clipboard on click
  // (copy: true) and the person pastes it into the page's search box.
  flash: { nameKey: "courierFlash", copy: true, urlFn: function () { return "https://www.flashexpress.co.th/fle/tracking"; } },
  jt: { nameKey: "courierJT", copy: true, urlFn: function () { return "https://www.jtexpress.co.th/service/track"; } },
  ninjavan: { nameKey: "courierNinjaVan", copy: true, urlFn: function () { return "https://www.ninjavan.co/en-th/tracking"; } },
  other: { nameKey: "courierOther", aggregator: true, urlFn: function (code) { return "https://t.17track.net/en#nums=" + encodeURIComponent(code); } }
};

var STATUS_ORDER = ["deposit", "full", "shipping", "intransit", "wishlist", "received", "cancelled"];

// ---------- Filtering / sorting ----------
function getVisibleOrders() {
  var list = state.orders.slice();

  if (state.status !== "all") {
    list = list.filter(function (o) { return o.status === state.status; });
  }
  if (state.monthYear !== "all") {
    list = list.filter(function (o) { return monthYearKey(o.purchaseDate) === state.monthYear; });
  }
  if (state.search.trim()) {
    var q = state.search.trim().toLowerCase();
    list = list.filter(function (o) {
      return (o.productName || "").toLowerCase().indexOf(q) !== -1 ||
             (o.shopName || "").toLowerCase().indexOf(q) !== -1 ||
             (o.notes || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  list.sort(function (a, b) {
    if (state.sort === "status") {
      var ia = STATUS_ORDER.indexOf(a.status);
      var ib = STATUS_ORDER.indexOf(b.status);
      if (ia === -1) ia = STATUS_ORDER.length;
      if (ib === -1) ib = STATUS_ORDER.length;
      if (ia !== ib) return ia - ib;
      // Within the same status, show the newest purchase first.
      var sa = a.purchaseDate || a.createdAt || "";
      var sb = b.purchaseDate || b.createdAt || "";
      if (sa < sb) return 1;
      if (sa > sb) return -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    var da = a.purchaseDate || a.createdAt || "";
    var db = b.purchaseDate || b.createdAt || "";
    if (da < db) return state.sort === "newest" ? 1 : -1;
    if (da > db) return state.sort === "newest" ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return list;
}

// ---------- Rendering: grid ----------
function renderGrid() {
  var grid = document.getElementById("grid");
  var list = getVisibleOrders();
  document.body.classList.toggle("selecting", selectMode);
  refreshBulkBar(list);

  if (list.length === 0) {
    var msg = state.orders.length === 0
      ? { title: t("emptyNoOrdersTitle"), body: t("emptyNoOrdersBody") }
      : { title: t("emptyNoMatchTitle"), body: t("emptyNoMatchBody") };
    grid.innerHTML =
      '<div class="empty-state"><h3>' + msg.title + "</h3><div>" + msg.body + "</div>" +
      (state.orders.length === 0 ? '<button class="btn-primary" style="margin:16px auto 0;" id="emptyAddBtn">' + t("emptyAddFirstBtn") + "</button>" : "") +
      "</div>";
    if (state.orders.length === 0) {
      document.getElementById("emptyAddBtn").addEventListener("click", function () { openOrderModal(); });
    }
    return;
  }

  var cardHtml = function (o) {
    var style = STATUS_STYLE[o.status] || STATUS_STYLE.deposit;
    var remain = remainingOf(o);
    var thumb = o.mainImage
      ? '<img class="thumb" src="' + (o.mainThumb || o.mainImage).replace(/"/g, "&quot;") + '" alt="' + escapeHtml(o.productName) + '" loading="lazy">'
      : '<div class="thumb-placeholder">' + placeholderSvg() + "</div>";

    var priceSubline = "";
    if (remain > 0) {
      priceSubline = o.depositPaid
        ? '<div class="remain">' + t("depositRemainLine", { deposit: money(o.depositPaid), remain: money(remain) }) + "</div>"
        : '<div class="remain">' + t("dueLine", { remain: money(remain) }) + "</div>";
    }

    return (
      '<article class="card' + (o.status === "cancelled" ? " is-cancelled" : "") + (selected[o.id] ? " is-selected" : "") + '" data-id="' + o.id + '">' + '<span class="sel-box" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg></span>' +
        '<div style="position:relative;">' + thumb + statusSelectHtml(o) +
        "</div>" +
        '<div class="card-body ' + style.border + '">' +
          "<h3>" + nameHtml(o) + "</h3>" +
          '<div class="shop">🏬 ' + escapeHtml(o.shopName || t("noShop")) + "</div>" +
          '<div class="price-row">' +
            '<div class="full">' + priceHtml(o) + "</div>" +
            priceSubline +
          "</div>" +
          '<div class="date">' + formatDateLong(o.purchaseDate) + "</div>" +
        "</div>" +
      "</article>"
    );
  };

  var rowHtml = function (o) {
    var style = STATUS_STYLE[o.status] || STATUS_STYLE.deposit;
    var remain = remainingOf(o);
    var thumb = o.mainImage
      ? '<img src="' + (o.mainThumb || o.mainImage).replace(/"/g, "&quot;") + '" alt="" loading="lazy">'
      : placeholderSvg();
    return (
      '<article class="row ' + style.border + (o.status === "cancelled" ? " is-cancelled" : "") + (selected[o.id] ? " is-selected" : "") + '" data-id="' + o.id + '">' + '<span class="sel-box" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg></span>' +
        '<div class="row-thumb">' + thumb + "</div>" +
        '<div class="row-main"><div class="row-title">' + nameHtml(o) + '</div>' +
          '<div class="row-shop">🏬 ' + escapeHtml(o.shopName || t("noShop")) + "</div></div>" +
        '<div class="row-date">' + formatDateLong(o.purchaseDate) + "</div>" +
        '<div class="row-price">' + priceHtml(o) +
          (remain > 0 ? '<div class="remain">' + t("dueLine", { remain: money(remain) }) + "</div>" : "") + "</div>" +
        '<div class="row-status">' + statusSelectHtml(o) + "</div>" +
      "</article>"
    );
  };

  var useList = viewPrefs.view === "list";
  var useGroups = viewPrefs.group;
  var itemHtml = useList ? rowHtml : cardHtml;
  var wrap = function (items) {
    return '<div class="' + (useList ? "list" : "grid") + '">' + items.map(itemHtml).join("") + "</div>";
  };

  if (!useList && !useGroups) {
    grid.className = "grid";
    grid.innerHTML = list.map(cardHtml).join("");
  } else {
    grid.className = "grid-flow";
    if (!useGroups) {
      grid.innerHTML = wrap(list);
    } else {
      grid.innerHTML = STATUS_GROUPS.map(function (g) {
        var items = list.filter(function (o) { return g.statuses.indexOf(o.status) !== -1; });
        if (!items.length) return "";
        var collapsed = !!viewPrefs.collapsed[g.key];
        var due = g.key === "pay"
          ? items.reduce(function (sum, o) { return sum + remainingOf(o); }, 0)
          : 0;
        return '<section class="group' + (collapsed ? " collapsed" : "") + '">' +
          '<button type="button" class="group-head" data-group="' + g.key + '" aria-expanded="' + (!collapsed) + '">' +
            '<svg class="chev-g" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l4 4 4-4"/></svg>' +
            '<span class="g-dot" style="background:' + g.color + '"></span>' +
            "<span>" + t(g.labelKey) + '</span><span class="g-count">' + items.length + "</span>" +
            (due > 0 ? '<span class="g-extra">' + t("dueLine", { remain: money(due) }) + "</span>" : "") +
          "</button>" +
          (collapsed ? "" : wrap(items)) +
        "</section>";
      }).join("");
      Array.prototype.forEach.call(grid.querySelectorAll(".group-head"), function (h) {
        h.addEventListener("click", function () {
          var key = h.getAttribute("data-group");
          viewPrefs.collapsed[key] = !viewPrefs.collapsed[key];
          saveViewPrefs();
          renderGrid();
        });
      });
    }
  }

  Array.prototype.forEach.call(grid.querySelectorAll(".card, .row"), function (card) {
    card.addEventListener("click", function (e) {
      if (selectMode) { toggleSelected(card.getAttribute("data-id")); return; }
      if (e.target.closest(".status-select")) return;
      openDetailModal(card.getAttribute("data-id"));
    });
  });

  Array.prototype.forEach.call(grid.querySelectorAll(".status-select"), function (sel) {
    sel.addEventListener("click", function (e) { e.stopPropagation(); });
    sel.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    sel.addEventListener("change", function (e) {
      e.stopPropagation();
      updateOrderStatus(sel.getAttribute("data-id"), sel.value);
    });
  });
}

function statusSelectHtml(o) {
  var style = STATUS_STYLE[o.status] || STATUS_STYLE.deposit;
  var options = ["wishlist", "deposit", "full", "shipping", "intransit", "received", "cancelled"].map(function (key) {
    return '<option value="' + key + '"' + (o.status === key ? " selected" : "") + ">" + statusLabel(key) + "</option>";
  }).join("");
  return '<select class="status-select ' + style.bg + '" data-id="' + o.id +
    '" aria-label="' + t("changeStatusAria") + '" title="' + t("changeStatusTitle") + '">' + options + "</select>";
}

function updateOrderStatus(id, newStatus) {
  var order = state.orders.find(function (o) { return o.id === id; });
  if (!order || order.status === newStatus) return;
  order.status = newStatus;
  if (saveData()) {
    renderStats();
    renderGrid();
    showToast(t("toastStatusUpdated", { status: statusLabel(newStatus) }));
  }
}

function placeholderSvg() {
  return '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
    '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m3 15 4.5-4.5a2 2 0 0 1 2.8 0L15 15"/>' +
    '<circle cx="9" cy="9" r="1.5"/></svg>';
}

function renderAll() {
  renderStats();
  renderMonthOptions();
  renderGrid();
  if (typeof renderNav === "function") renderNav();
  if (typeof renderHome === "function" && currentPageId === "home") renderHome();
}
