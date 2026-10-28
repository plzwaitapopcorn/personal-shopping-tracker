"use strict";
// ---------- Finance: pages, forms, home widgets ----------
var finView = { month: monthKeyOf(new Date()), type: "all", cat: "" };
var txDraft = { id: null, type: "expense", cat: "" };
var catDraft = { id: null, type: "expense", color: CAT_COLORS[0] };

function yen(n) { return "฿" + money(n); }
function signedYen(r) { return (r.type === "income" ? "+" : "−") + yen(r.amount); }
function el(id) { return document.getElementById(id); }
function orderRef(id) { return state.orders.find(function (o) { return o.id === id; }) || null; }

// ================= action toast + small dialog =================
var actToastTimer = null;
function showActionToast(msg, actions, ms) {
  el("toastActMsg").textContent = msg;
  var box = el("toastActBtns");
  box.innerHTML = "";
  (actions || []).forEach(function (a) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = a.label;
    b.addEventListener("click", function () { hideActionToast(); a.run(); });
    box.appendChild(b);
  });
  el("toastAct").classList.add("show");
  clearTimeout(actToastTimer);
  actToastTimer = setTimeout(hideActionToast, ms || 7000);
}
function hideActionToast() { clearTimeout(actToastTimer); el("toastAct").classList.remove("show"); }

var payDlgCb = null;
function openPayDialog(opts) {
  el("payDlgTitle").textContent = opts.title;
  var hasAmt = opts.amount != null;
  el("payDlgAmountRow").style.display = hasAmt ? "" : "none";
  el("payDlgAmount").value = hasAmt ? opts.amount : "";
  el("payDlgAmount").required = hasAmt;
  el("payDlgDate").value = opts.date || todayStr();
  payDlgCb = opts.onOk;
  el("payDlgOverlay").classList.add("open");
  (hasAmt ? el("payDlgAmount") : el("payDlgDate")).focus();
}
function closePayDialog() { el("payDlgOverlay").classList.remove("open"); payDlgCb = null; }

// The balance of an order was just marked paid: say so, and let the user fix the date or take it back.
function offerBalanceUndo(order, info, oldStatus, oldPaid) {
  var id = order.id;
  showActionToast(t("finBalanceRecorded", { amount: money(info.amount) }), [
    { label: t("finChangeDate"), run: function () {
        var o = orderRef(id); if (!o) return;
        openPayDialog({ title: t("finBalanceDateTitle"), amount: null, date: o.paidFullDate, onOk: function (v) {
          o.paidFullDate = v.date || todayStr(); saveData(); renderAll(); finRenderAll(); showToast(t("toastUpdated"));
        } });
      } },
    { label: t("finUndo"), run: function () {
        var o = orderRef(id); if (!o) return;
        o.status = oldStatus;
        if (oldPaid) o.paidFullDate = oldPaid; else delete o.paidFullDate;
        saveData(); renderAll(); finRenderAll(); showToast(t("finUndone"));
      } }
  ], 8000);
}

// ================= order detail: payments + refund =================
var PAY_KIND_KEY = { paid: "finKindPaid", deposit: "finKindDeposit", balance: "finKindBalance", full: "finKindFull", refund: "finKindRefund" };
function finBindDetail(o) {
  var body = el("detailBody");
  var pays = orderPayments(o);
  var canRefund = o.status === "cancelled" && orderPaidTotal(o) > 0 && !o.refund;
  if (!pays.length && !canRefund) return;
  var html = '<div class="detail-pays"><div class="k">' + escapeHtml(t("finPaymentsTitle")) + "</div>";
  pays.forEach(function (r) {
    html += '<div class="pay-line"><span>' + escapeHtml(t(PAY_KIND_KEY[r.kind] || "finKindPaid")) + '</span><span class="pay-d">' + escapeHtml(formatDateLong(r.date)) +
      '</span><b class="' + (r.type === "income" ? "up" : "") + '">' + signedYen(r) + "</b>" +
      (r.kind === "balance" ? '<button type="button" class="link-btn" data-paydate="1">' + escapeHtml(t("finChangeDate")) + "</button>" : "") +
      (r.kind === "refund" ? '<button type="button" class="link-btn" data-refunddel="1">' + escapeHtml(t("finRefundRemove")) + "</button>" : "") + "</div>";
  });
  if (canRefund) html += '<button type="button" class="btn-secondary pay-refund" data-refund="1">' + escapeHtml(t("finRefundBtn")) + "</button>";
  html += "</div>";
  body.insertAdjacentHTML("beforeend", html);
  var box = body.querySelector(".detail-pays");
  box.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var ord = orderRef(o.id); if (!ord) return;
    if (b.hasAttribute("data-paydate")) {
      openPayDialog({ title: t("finBalanceDateTitle"), amount: null, date: ord.paidFullDate || ord.purchaseDate, onOk: function (v) {
        ord.paidFullDate = v.date || todayStr(); saveData(); renderAll(); finRenderAll(); openDetailModal(ord.id);
      } });
    } else if (b.hasAttribute("data-refund")) {
      openPayDialog({ title: t("finRefundTitle"), amount: orderPaidTotal(ord), date: todayStr(), onOk: function (v) {
        var amt = Number(v.amount) || 0; if (amt <= 0) return;
        ord.refund = { amount: amt, date: v.date || todayStr() }; saveData(); renderAll(); finRenderAll(); openDetailModal(ord.id);
        showToast(t("finRefundSaved"));
      } });
    } else if (b.hasAttribute("data-refunddel")) {
      delete ord.refund; saveData(); renderAll(); finRenderAll(); openDetailModal(ord.id);
    }
  });
}

// ================= transaction modal =================
function txCatsFor(type) { return finCats(type); }
function renderTxCats() {
  var cats = txCatsFor(txDraft.type);
  if (!cats.some(function (c) { return c.id === txDraft.cat; })) txDraft.cat = cats.length ? cats[0].id : "";
  el("txCatChips").innerHTML = cats.map(function (c) {
    return '<button type="button" class="cat-chip' + (c.id === txDraft.cat ? " on" : "") + '" data-catpick="' + c.id + '"><i style="background:' + finCatColor(c) + '"></i>' + escapeHtml(finCatName(c)) + "</button>";
  }).join("");
}
function setTxType(type) {
  txDraft.type = type;
  Array.prototype.forEach.call(document.querySelectorAll("[data-txtype]"), function (b) {
    var on = b.getAttribute("data-txtype") === type;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  el("txModalTitle").textContent = t(type === "income" ? "finAddIncome" : "finAddExpense");
  renderTxCats();
}
function openTxModal(id, type) {
  var x = id ? fin.items.find(function (i) { return i.id === id && i.kind === "tx"; }) : null;
  txDraft.id = x ? x.id : null;
  txDraft.cat = x ? x.cat : "";
  el("fTxAmount").value = x ? x.amount : "";
  el("fTxDate").value = x ? x.date : todayStr();
  el("fTxNote").value = x ? (x.note || "") : "";
  el("btnTxDelete").style.display = x ? "inline-block" : "none";
  setTxType(x ? x.type : (type || "expense"));
  if (x) el("txModalTitle").textContent = t("finEditRecord");
  el("txModalOverlay").classList.add("open");
  el("fTxAmount").focus();
}
function closeTxModal() { el("txModalOverlay").classList.remove("open"); }
function submitTx(e) {
  e.preventDefault();
  var amount = parseFloat(el("fTxAmount").value);
  if (!(amount > 0)) { el("fTxAmount").focus(); return; }
  var rec = { id: txDraft.id || uid(), kind: "tx", type: txDraft.type, amount: amount, date: el("fTxDate").value || todayStr(),
    cat: txDraft.cat, note: el("fTxNote").value.trim() };
  var i = fin.items.findIndex(function (x) { return x.id === rec.id; });
  if (i >= 0) fin.items[i] = rec; else fin.items.push(rec);
  finView.month = rec.date.slice(0, 7);
  finSave(); closeTxModal(); finRenderAll(); renderHome();
  showToast(t(i >= 0 ? "toastUpdated" : "finAdded"));
}

// ================= category modal =================
function renderCatColors() {
  el("catColors").innerHTML = CAT_COLORS.map(function (c) {
    return '<button type="button" class="color-dot' + (c === catDraft.color ? " active" : "") + '" data-catcolor="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>';
  }).join("");
}
function setCatType(type) {
  catDraft.type = type;
  Array.prototype.forEach.call(document.querySelectorAll("[data-cattype]"), function (b) {
    var on = b.getAttribute("data-cattype") === type;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  el("catBudgetRow").style.display = type === "expense" ? "" : "none";
}
function openCatModal(id, type) {
  var c = id ? finCatById(id) : null;
  catDraft.id = c ? c.id : null;
  catDraft.color = c ? finCatColor(c) : CAT_COLORS[(finCats().length) % CAT_COLORS.length];
  el("catModalTitle").textContent = t(c ? "finCatEdit" : "finCatNew");
  el("fCatName").value = c ? finCatName(c) : "";
  el("fCatName").placeholder = t("finCatNamePh");
  el("fCatBudget").value = c && c.budget ? c.budget : "";
  el("catTypeRow").style.display = c ? "none" : "";
  el("btnCatDelete").style.display = c ? "inline-block" : "none";
  setCatType(c ? c.type : (type || "expense"));
  renderCatColors();
  el("catModalOverlay").classList.add("open");
  el("fCatName").focus();
}
function closeCatModal() { el("catModalOverlay").classList.remove("open"); }
function submitCat(e) {
  e.preventDefault();
  var name = el("fCatName").value.trim();
  var cur = catDraft.id ? finCatById(catDraft.id) : null;
  if (!name) { el("fCatName").focus(); return; }
  var budget = catDraft.type === "expense" ? (parseFloat(el("fCatBudget").value) || 0) : 0;
  if (cur) {
    // a default category keeps using its translated name until the user really renames it
    if (!(cur.dk && name === finCatName(cur))) cur.name = name;
    cur.color = catDraft.color; cur.budget = budget;
  } else {
    var maxSort = finCats().reduce(function (m, c) { return Math.max(m, c.sort || 0); }, 0);
    fin.items.push({ id: uid(), kind: "cat", type: catDraft.type, name: name, color: catDraft.color, budget: budget, sort: maxSort + 1 });
  }
  finSave(); closeCatModal(); finRenderAll();
  showToast(t("toastUpdated"));
}
function deleteCat() {
  var c = catDraft.id ? finCatById(catDraft.id) : null;
  if (!c || !confirm(t("finCatDeleteConfirm"))) return;
  fin.items = fin.items.filter(function (x) { return x.id !== c.id; });
  finSave(); closeCatModal(); finRenderAll();
}

// ================= pages =================
function monthNavHtml() {
  var isNow = finView.month === monthKeyOf(new Date());
  return '<div class="fin-monthnav"><button type="button" class="tool-btn" data-fm="-1" aria-label="' + escapeHtml(t("finPrevMonth")) + '">' + svgIcon("chev-l") + "</button>" +
    "<b>" + escapeHtml(monthLabelOf(finView.month)) + '</b><button type="button" class="tool-btn" data-fm="1" aria-label="' + escapeHtml(t("finNextMonth")) + '">' + svgIcon("chev-r") + "</button>" +
    (isNow ? "" : '<button type="button" class="btn-ghost-sm" data-fm="now">' + escapeHtml(t("finThisMonth")) + "</button>") + "</div>";
}
function addButtonsHtml() {
  return '<div class="fin-addbtns"><button type="button" class="btn-ghost-sm" data-finadd="income">' + svgIcon("plus") + "<span>" + escapeHtml(t("finIncome")) + "</span></button>" +
    '<button type="button" class="btn-primary" data-finadd="expense">' + svgIcon("plus") + "<span>" + escapeHtml(t("finExpense")) + "</span></button></div>";
}
function rowKindLabel(r) { return r.src === "order" ? t(PAY_KIND_KEY[r.kind] || "finKindPaid") : ""; }
function finRowHtml(r) {
  var c = finCatById(r.cat);
  var title = r.note || finCatName(c);
  var sub = escapeHtml(finCatName(c));
  if (r.src === "order") sub = escapeHtml(rowKindLabel(r)) + ' <span class="htag" style="color:var(--accent-ink)">' + escapeHtml(t("finFromOrder")) + "</span>";
  return '<button type="button" class="frow" data-src="' + r.src + '" data-id="' + escapeHtml(r.id) + '"' + (r.orderId ? ' data-order="' + r.orderId + '"' : "") + ">" +
    '<span class="frow-dot" style="background:' + finCatColor(c) + '"></span>' +
    '<span class="frow-main"><span class="frow-t">' + escapeHtml(title) + '</span><span class="frow-s">' + sub + "</span></span>" +
    '<span class="frow-r' + (r.type === "income" ? " up" : "") + '">' + signedYen(r) + "</span></button>";
}

function expenseByCat(rows) {
  var spent = {};
  rows.forEach(function (r) { if (r.type === "expense") spent[r.cat] = (spent[r.cat] || 0) + r.amount; });
  return spent;
}
function catBarsHtml(rows, limit) {
  var spent = expenseByCat(rows);
  var items = [];
  finCats("expense").forEach(function (c) { if (spent[c.id] || c.budget > 0) items.push({ c: c, amt: spent[c.id] || 0 }); delete spent[c.id]; });
  var stray = 0; Object.keys(spent).forEach(function (k) { stray += spent[k]; });
  if (stray > 0) items.push({ c: null, amt: stray });
  items.sort(function (a, b) { return b.amt - a.amt; });
  if (limit) items = items.slice(0, limit);
  if (!items.length) return '<div class="hempty">' + escapeHtml(t("finNoSpend")) + "</div>";
  var max = items.reduce(function (m, i) { return Math.max(m, i.amt); }, 0) || 1;
  return '<div class="fbars">' + items.map(function (i) {
    var bud = i.c && i.c.budget > 0 ? i.c.budget : 0;
    var pct = Math.min(100, (bud ? i.amt / bud : i.amt / max) * 100);
    var over = bud && i.amt > bud;
    return '<button type="button" class="fbar' + (over ? " over" : "") + '" data-fcat="' + (i.c ? i.c.id : "") + '">' +
      '<span class="fbar-name"><i style="background:' + finCatColor(i.c) + '"></i>' + escapeHtml(finCatName(i.c)) + "</span>" +
      '<span class="fbar-track"><i style="width:' + pct + "%;background:" + (over ? "var(--due-ink)" : finCatColor(i.c)) + '"></i></span>' +
      '<span class="fbar-v">' + yen(i.amt) + (bud ? "<small>/ " + yen(bud) + "</small>" : "") + "</span></button>";
  }).join("") + "</div>";
}
function vsPrevHtml(cur, prev) {
  if (!(prev > 0)) return "";
  var pct = Math.round((cur - prev) / prev * 100);
  if (pct === 0) return escapeHtml(t("finSameAsPrev"));
  return '<span class="' + (pct > 0 ? "dn" : "up") + '">' + (pct > 0 ? "▲ " : "▼ ") + Math.abs(pct) + "%</span> " + escapeHtml(t("finVsPrev"));
}

function renderFinOverview() {
  var box = el("finOverviewBody");
  if (!fin.loaded) { box.innerHTML = ""; return; }
  var key = finView.month, all = finAllRows();
  var byMonth = {};
  all.forEach(function (r) { var k = r.date ? r.date.slice(0, 7) : ""; if (k) (byMonth[k] = byMonth[k] || []).push(r); });
  var rows = byMonth[key] || [], tot = finTotals(rows), prev = finTotals(byMonth[shiftMonthKey(key, -1)] || []);
  var html = '<div class="fin-toolbar">' + monthNavHtml() + addButtonsHtml() + "</div>";
  html += '<div class="fin-stats">' +
    '<div class="hw"><h4>' + svgIcon("arrow-in") + escapeHtml(t("finIncome")) + '</h4><div class="big up">' + yen(tot.income) + "</div></div>" +
    '<div class="hw"><h4>' + svgIcon("wallet") + escapeHtml(t("finExpense")) + '</h4><div class="big">' + yen(tot.expense) + '</div><div class="sub">' + vsPrevHtml(tot.expense, prev.expense) + "</div></div>" +
    '<div class="hw"><h4>' + svgIcon("chart") + escapeHtml(t("finLeft")) + '</h4><div class="big ' + (tot.balance < 0 ? "dn" : "up") + '">' + (tot.balance < 0 ? "−" : "") + yen(Math.abs(tot.balance)) + "</div></div></div>";
  // 6-month trend (ending at the selected month)
  var months = [], max = 1;
  for (var i = 5; i >= 0; i--) {
    var mk = shiftMonthKey(key, -i), tt = finTotals(byMonth[mk] || []);
    months.push({ key: mk, inc: tt.income, exp: tt.expense });
    max = Math.max(max, tt.income, tt.expense);
  }
  var chart = '<div class="fchart">' + months.map(function (m) {
    return '<button type="button" class="fcol' + (m.key === key ? " on" : "") + '" data-fmset="' + m.key + '"><span class="fcol-bars">' +
      '<i class="inc" style="height:' + Math.round(m.inc / max * 100) + '%"></i><i class="exp" style="height:' + Math.round(m.exp / max * 100) + '%"></i></span>' +
      '<span class="fcol-l">' + escapeHtml(monthLabelOf(m.key, true)) + "</span></button>";
  }).join("") + "</div>" +
    '<div class="fleg"><span><i class="inc"></i>' + escapeHtml(t("finIncome")) + '</span><span><i class="exp"></i>' + escapeHtml(t("finExpense")) + "</span></div>";
  html += '<div class="fin-grid">' +
    '<div class="hw"><h4 class="hw-h">' + escapeHtml(t("finByCategory")) + "</h4>" + catBarsHtml(rows) + "</div>" +
    '<div class="hw"><h4 class="hw-h">' + escapeHtml(t("finTrend")) + "</h4>" + chart + "</div></div>";
  var recent = finSortRows(rows).slice(0, 6);
  html += '<div class="hw fin-recent"><h4 class="hw-h">' + escapeHtml(t("finRecent")) + '<a class="hw-more" href="#/fin-list">' + escapeHtml(t("seeAll")) + "</a></h4>" +
    (recent.length ? recent.map(finRowHtml).join("") : '<div class="hempty">' + escapeHtml(t("finNoRows")) + "</div>") + "</div>";
  box.innerHTML = html;
}

function renderFinList() {
  var box = el("finListBody");
  if (!fin.loaded) { box.innerHTML = ""; return; }
  var rows = finRowsOfMonth(finView.month), tot = finTotals(rows);
  var shown = rows.filter(function (r) {
    return (finView.type === "all" || r.type === finView.type) && (!finView.cat || (finView.cat === "__none" ? !finCatById(r.cat) : r.cat === finView.cat));
  });
  var catOpts = '<option value="">' + escapeHtml(t("finAllCats")) + "</option>" + finCats().map(function (c) {
    return '<option value="' + c.id + '"' + (finView.cat === c.id ? " selected" : "") + ">" + escapeHtml(finCatName(c)) + "</option>";
  }).join("");
  var html = '<div class="fin-toolbar">' + monthNavHtml() + addButtonsHtml() + "</div>" +
    '<div class="fin-filters"><div class="fseg" role="group">' +
    ["all", "expense", "income"].map(function (k) {
      return '<button type="button" class="fseg-btn' + (finView.type === k ? " on" : "") + '" data-ftype="' + k + '">' + escapeHtml(t(k === "all" ? "chipAll" : (k === "expense" ? "finExpense" : "finIncome"))) + "</button>";
    }).join("") + '</div><select class="fin-select" id="finCatSel">'+ catOpts + "</select></div>" +
    '<div class="fin-sum"><span>' + escapeHtml(t("finIncome")) + ' <b class="up">' + yen(tot.income) + "</b></span><span>" + escapeHtml(t("finExpense")) + " <b>" + yen(tot.expense) + "</b></span></div>";
  if (!shown.length) html += '<div class="hempty wide">' + escapeHtml(t("finNoRows")) + "</div>";
  else {
    var last = "";
    finSortRows(shown).forEach(function (r) {
      if (r.date !== last) { last = r.date; html += '<div class="fin-day">' + escapeHtml(formatDateLong(r.date)) + "</div>"; }
      html += finRowHtml(r);
    });
  }
  box.innerHTML = html;
}

function renderFinCats() {
  var box = el("finCatsBody");
  if (!fin.loaded) { box.innerHTML = ""; return; }
  function sec(type) {
    var cats = finCats(type);
    return '<div class="fin-catsec"><div class="fin-cathead"><h3>' + escapeHtml(t(type === "expense" ? "finExpense" : "finIncome")) + '</h3><button type="button" class="btn-ghost-sm" data-catnew="' + type + '">' +
      svgIcon("plus") + "<span>" + escapeHtml(t("finCatNew")) + "</span></button></div>" +
      cats.map(function (c) {
        return '<button type="button" class="frow" data-catedit="' + c.id + '"><span class="frow-dot" style="background:' + finCatColor(c) + '"></span>' +
          '<span class="frow-main"><span class="frow-t">' + escapeHtml(finCatName(c)) + "</span>" +
          (type === "expense" ? '<span class="frow-s">' + escapeHtml(c.budget > 0 ? t("finBudgetLine", { n: money(c.budget) }) : t("finNoBudget")) + "</span>" : "") +
          '</span><span class="frow-r">' + svgIcon("chev-r") + "</span></button>";
      }).join("") + "</div>";
  }
  box.innerHTML = '<p class="fin-hint">' + escapeHtml(t("finCatsHint")) + "</p>" + sec("expense") + sec("income");
}

function finRenderPage(page) {
  if (page === "fin-overview") renderFinOverview();
  else if (page === "fin-list") renderFinList();
  else if (page === "fin-cats") renderFinCats();
}
function finRenderAll() {
  if (typeof currentPageId === "string" && currentPageId.indexOf("fin-") === 0) finRenderPage(currentPageId);
  if (typeof renderHome === "function" && currentPageId === "home") renderHome();
  if (typeof renderNav === "function") renderNav();
}

// ================= home widgets =================
function finMonthRows() { return finRowsOfMonth(monthKeyOf(new Date())); }
(function registerFinanceWidgets() {
  var spend = { id: "fin-spend", titleKey: "wFinSpend", size: "s", icon: "wallet", render: function (b) {
    var key = monthKeyOf(new Date()), cur = finTotals(finMonthRows()), prev = finTotals(finRowsOfMonth(shiftMonthKey(key, -1)));
    b.innerHTML = '<div class="big">' + yen(cur.expense) + '</div><div class="sub">' + (vsPrevHtml(cur.expense, prev.expense) || escapeHtml(monthLabelOf(key))) + "</div>";
  } };
  var left = { id: "fin-left", titleKey: "wFinLeft", size: "s", icon: "chart", render: function (b) {
    var cur = finTotals(finMonthRows());
    b.innerHTML = '<div class="big ' + (cur.balance < 0 ? "dn" : "up") + '">' + (cur.balance < 0 ? "−" : "") + yen(Math.abs(cur.balance)) + '</div><div class="sub">' +
      escapeHtml(t("finIncomeSub", { n: money(cur.income) })) + "</div>";
  } };
  var cats = { id: "fin-cats", titleKey: "wFinCats", size: "m", more: { page: "fin-overview" }, render: function (b) {
    b.innerHTML = catBarsHtml(finMonthRows(), 5);
  } };
  var recent = { id: "fin-recent", titleKey: "wFinRecent", size: "m", more: { page: "fin-list" }, render: function (b) {
    var rows = finSortRows(finMonthRows()).slice(0, 5);
    b.innerHTML = rows.length ? rows.map(finRowHtml).join("") : '<div class="hempty">' + escapeHtml(t("finNoRows")) + "</div>";
  } };
  HOME_WIDGETS.unshift(left); HOME_WIDGETS.unshift(spend);
  var idx = HOME_WIDGETS.findIndex(function (w) { return w.id === "due-soon"; });
  HOME_WIDGETS.splice(idx, 0, cats);
  var ri = HOME_WIDGETS.findIndex(function (w) { return w.id === "recent-orders"; });
  HOME_WIDGETS.splice(ri, 0, recent);
})();

// ================= wiring =================
function initFinance() {
  QUICK_ADDS.unshift(
    { id: "expense", primary: true, icon: "wallet", labelKey: "finAddExpense", run: function () { openTxModal(null, "expense"); } },
    { id: "income", icon: "arrow-in", labelKey: "finAddIncome", run: function () { openTxModal(null, "income"); } }
  );
  // modals
  el("closeTxModal").addEventListener("click", closeTxModal);
  el("cancelTxForm").addEventListener("click", closeTxModal);
  el("txModalOverlay").addEventListener("click", function (e) { if (e.target === this) closeTxModal(); });
  el("txForm").addEventListener("submit", submitTx);
  el("txTypeSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-txtype]"); if (b) setTxType(b.getAttribute("data-txtype")); });
  el("txCatChips").addEventListener("click", function (e) { var b = e.target.closest("[data-catpick]"); if (b) { txDraft.cat = b.getAttribute("data-catpick"); renderTxCats(); } });
  el("btnTxDelete").addEventListener("click", function () {
    if (!txDraft.id || !confirm(t("finDeleteConfirm"))) return;
    fin.items = fin.items.filter(function (x) { return x.id !== txDraft.id; });
    finSave(); closeTxModal(); finRenderAll();
  });
  el("closeCatModal").addEventListener("click", closeCatModal);
  el("cancelCatForm").addEventListener("click", closeCatModal);
  el("catModalOverlay").addEventListener("click", function (e) { if (e.target === this) closeCatModal(); });
  el("catForm").addEventListener("submit", submitCat);
  el("btnCatDelete").addEventListener("click", deleteCat);
  el("catTypeSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-cattype]"); if (b) setCatType(b.getAttribute("data-cattype")); });
  el("catColors").addEventListener("click", function (e) { var b = e.target.closest("[data-catcolor]"); if (b) { catDraft.color = b.getAttribute("data-catcolor"); renderCatColors(); } });
  el("closePayDlg").addEventListener("click", closePayDialog);
  el("cancelPayDlg").addEventListener("click", closePayDialog);
  el("payDlgOverlay").addEventListener("click", function (e) { if (e.target === this) closePayDialog(); });
  el("payDlgForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var cb = payDlgCb, v = { amount: el("payDlgAmount").value, date: el("payDlgDate").value };
    closePayDialog();
    if (cb) cb(v);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeTxModal(); closeCatModal(); closePayDialog(); }
  });

  // pages (event delegation on the three containers)
  ["finOverviewBody", "finListBody", "finCatsBody"].forEach(function (id) {
    el(id).addEventListener("click", function (e) {
      var b;
      if ((b = e.target.closest("[data-fm]"))) {
        var d = b.getAttribute("data-fm");
        finView.month = d === "now" ? monthKeyOf(new Date()) : shiftMonthKey(finView.month, parseInt(d, 10));
        finRenderAll(); return;
      }
      if ((b = e.target.closest("[data-fmset]"))) { finView.month = b.getAttribute("data-fmset"); finRenderAll(); return; }
      if ((b = e.target.closest("[data-finadd]"))) { openTxModal(null, b.getAttribute("data-finadd")); return; }
      if ((b = e.target.closest("[data-ftype]"))) { finView.type = b.getAttribute("data-ftype"); finRenderAll(); return; }
      if ((b = e.target.closest("[data-fcat]"))) { finView.cat = b.getAttribute("data-fcat") || "__none"; finView.type = "expense"; navigate("fin-list"); return; }
      if ((b = e.target.closest("[data-catnew]"))) { openCatModal(null, b.getAttribute("data-catnew")); return; }
      if ((b = e.target.closest("[data-catedit]"))) { openCatModal(b.getAttribute("data-catedit")); return; }
      if ((b = e.target.closest(".frow[data-src]"))) { openFinRow(b); }
    });
  });
  el("finListBody").addEventListener("change", function (e) {
    if (e.target.id === "finCatSel") { finView.cat = e.target.value; finRenderAll(); }
  });
  // rows inside home widgets
  el("homeGrid").addEventListener("click", function (e) {
    if (homeEdit) return;
    var b = e.target.closest(".frow[data-src]");
    if (b) openFinRow(b);
    var f = e.target.closest("[data-fcat]");
    if (f) { finView.cat = f.getAttribute("data-fcat") || "__none"; finView.type = "expense"; finView.month = monthKeyOf(new Date()); navigate("fin-list"); }
  });
}
function openFinRow(b) {
  if (b.getAttribute("data-src") === "order") openDetailModal(b.getAttribute("data-order"));
  else openTxModal(b.getAttribute("data-id"));
}
