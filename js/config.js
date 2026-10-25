"use strict";
var STORAGE_KEY = "preorderVault_v1";
var LANG_KEY = "preorderVault_lang";
var THEME_KEY = "preorderVault_theme";
var HEADER_KEY = "preorderVault_header";
// List view + status groups (remembered between visits).
var VIEW_KEY = "preorderVault_view_v2";
var viewPrefs = { view: "list", group: true, collapsed: {} };
try {
  var savedView = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
  if (savedView) {
    if (savedView.view === "list" || savedView.view === "cards") viewPrefs.view = savedView.view;
    if (typeof savedView.group === "boolean") viewPrefs.group = savedView.group;
    if (savedView.collapsed && typeof savedView.collapsed === "object") viewPrefs.collapsed = savedView.collapsed;
  }
} catch (e) { /* ignore */ }
function saveViewPrefs() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewPrefs)); } catch (e) { /* ignore */ }
}
var STATUS_GROUPS = [
  { key: "pay",       statuses: ["deposit"],                          labelKey: "groupPay",       color: "var(--status-deposit)" },
  { key: "wait",      statuses: ["full", "shipping", "intransit"],    labelKey: "groupWait",      color: "var(--status-shipping)" },
  { key: "wishlist",  statuses: ["wishlist"],                         labelKey: "groupWishlist",  color: "var(--status-wishlist)" },
  { key: "done",      statuses: ["received"],                         labelKey: "groupDone",      color: "var(--status-received)" },
  { key: "cancelled", statuses: ["cancelled"],                        labelKey: "groupCancelled", color: "var(--status-cancelled)" }
];

var PRIMARY_KEY = "preorderVault_primary";
// Primary colors: the six status-palette colors plus the original teal.
// fill = button/fill color, ink = same hue readable as text on that mode's background, on = text drawn on the fill.
var PRIMARIES = [
  { id: "teal",   nameKey: "colorTeal",   dark: { c: "#33d6c0", ink: "#33d6c0", on: "#111315" }, light: { c: "#0f9c8c", ink: "#0f9c8c", on: "#ffffff" } },
  { id: "pink",   nameKey: "colorPink",   dark: { c: "#ff4ace", ink: "#ff4ace", on: "#111315" }, light: { c: "#ff6dd8", ink: "#c2188f", on: "#111315" } },
  { id: "orange", nameKey: "colorOrange", dark: { c: "#ff953d", ink: "#ff953d", on: "#111315" }, light: { c: "#ffab66", ink: "#c2570c", on: "#111315" } },
  { id: "yellow", nameKey: "colorYellow", dark: { c: "#ffe11d", ink: "#ffe11d", on: "#111315" }, light: { c: "#ffe433", ink: "#b88a00", on: "#111315" } },
  { id: "green",  nameKey: "colorGreen",  dark: { c: "#69ff32", ink: "#69ff32", on: "#111315" }, light: { c: "#9aff75", ink: "#218a0a", on: "#111315" } },
  { id: "blue",   nameKey: "colorBlue",   dark: { c: "#3db4ff", ink: "#3db4ff", on: "#111315" }, light: { c: "#66c4ff", ink: "#0a7bc4", on: "#111315" } },
  { id: "purple", nameKey: "colorPurple", dark: { c: "#a348ff", ink: "#bd7bff", on: "#111315" }, light: { c: "#ba75ff", ink: "#7a2fd1", on: "#111315" } }
];

var STATUS_STYLE = {
  deposit:   { bg: "status-deposit-bg",   border: "b-deposit"   },
  full:      { bg: "status-full-bg",      border: "b-full"      },
  shipping:  { bg: "status-shipping-bg",  border: "b-shipping"  },
  intransit: { bg: "status-intransit-bg", border: "b-intransit" },
  received:  { bg: "status-received-bg",  border: "b-received"  },
  cancelled: { bg: "status-cancelled-bg", border: "b-cancelled" },
  wishlist:  { bg: "status-wishlist-bg",  border: "b-wishlist"  }
};

var STATUS_KEY_MAP = {
  deposit: "statusDeposit",
  full: "statusFull",
  shipping: "statusShipping",
  intransit: "statusInTransit",
  received: "statusReceived",
  cancelled: "statusCancelled",
  wishlist: "statusWishlist"
};
