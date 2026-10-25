"use strict";
// ---------- Appearance (mode + primary color) ----------
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  function f(v) { return Math.max(0, Math.min(255, Math.round(v * (1 - amt)))); }
  return "#" + [f(r), f(g), f(b)].map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
}
function hexRgba(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}
function primaryById(id) {
  for (var i = 0; i < PRIMARIES.length; i++) if (PRIMARIES[i].id === id) return PRIMARIES[i];
  return PRIMARIES[0];
}
function applyAppearance() {
  var mode = state.theme === "light" ? "light" : "dark";
  var pr = primaryById(state.primary)[mode];
  var root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.style.setProperty("--accent", pr.c);
  root.style.setProperty("--accent-strong", shade(pr.c, 0.14));
  root.style.setProperty("--accent-soft", hexRgba(pr.c, mode === "light" ? 0.14 : 0.16));
  root.style.setProperty("--accent-ink", pr.ink);
  root.style.setProperty("--on-accent", pr.on);
  var mt = document.getElementById("metaTheme");
  if (mt) mt.setAttribute("content", mode === "light" ? "#f7f7f8" : "#121212");   // browser bar / installed-app title bar
  renderAppearanceMenu();
}
function renderAppearanceMenu() {
  var mode = state.theme === "light" ? "light" : "dark";
  Array.prototype.forEach.call(document.querySelectorAll(".mode-btn"), function (b) {
    var on = b.getAttribute("data-mode") === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  var row = document.getElementById("colorRow");
  if (!row) return;
  // Update swatches in place (keeps the clicked node attached so the menu stays open).
  if (row.children.length !== PRIMARIES.length) {
    row.innerHTML = PRIMARIES.map(function (p) {
      return '<button type="button" class="color-dot" data-primary="' + p.id + '"></button>';
    }).join("");
  }
  PRIMARIES.forEach(function (p, i) {
    var d = row.children[i], on = p.id === state.primary;
    d.style.background = p[mode].c;
    d.title = t(p.nameKey);
    d.setAttribute("aria-label", t(p.nameKey));
    d.setAttribute("aria-pressed", on ? "true" : "false");
    d.classList.toggle("active", on);
  });
}
function loadAppearancePref() {
  var theme = "dark", primary = "teal";
  try {
    var saved = localStorage.getItem(THEME_KEY);
    // Older saved choices (pastel) map to the closest remaining mode.
    if (saved === "pastel") saved = "light";
    theme = saved === "light" ? "light" : "dark";
    var sp = localStorage.getItem(PRIMARY_KEY);
    if (PRIMARIES.some(function (p) { return p.id === sp; })) primary = sp;
  } catch (e) { /* ignore */ }
  state.theme = theme;
  state.primary = primary;
  applyAppearance();
}
function setMode(mode) {
  if (mode !== "light" && mode !== "dark") return;
  state.theme = mode;
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ }
  applyAppearance();
}
function setPrimary(id) {
  state.primary = primaryById(id).id;
  try { localStorage.setItem(PRIMARY_KEY, state.primary); } catch (e) { /* ignore */ }
  applyAppearance();
}
