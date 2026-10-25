"use strict";
// ---------- Helpers ----------
function money(n) {
  n = Number(n) || 0;
  return n.toLocaleString(I18N[state.lang].locale, { maximumFractionDigits: 2 });
}

function formatDateLong(dateStr) {
  if (!dateStr) return t("noDate");
  var d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return t("noDate");
  return d.toLocaleDateString(I18N[state.lang].locale, { year: "numeric", month: "long", day: "numeric" });
}

// The date filter works by year (kept under the old "monthYear" names).
function monthYearKey(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 4); // YYYY
}

function monthYearLabel(key) {
  var d = new Date(parseInt(key, 10), 0, 1);
  return d.toLocaleDateString(I18N[state.lang].locale, { year: "numeric" });
}

// A wishlist item may have no name or price yet.
function nameHtml(o) {
  return o.productName ? escapeHtml(o.productName) : '<span class="untitled">' + t("noName") + "</span>";
}
function priceHtml(o) {
  if (o.status === "wishlist" && !Number(o.fullPrice)) return '<span class="na">\u2014</span>';
  return "฿" + money(o.fullPrice);
}

function remainingOf(order) {
  // Once an order has moved past the deposit stage (paid in full, awaiting shipment,
  // in transit, or received), the seller has been paid in full — nothing is outstanding,
  // regardless of what was recorded as a deposit.
  if (order.status !== "deposit") return 0;
  var deposit = Number(order.depositPaid) || 0;
  var full = Number(order.fullPrice) || 0;
  var r = full - deposit;
  return r > 0 ? r : 0;
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function showToast(msg) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () { el.classList.remove("show"); }, 2200);
}
