"use strict";
// ---------- i18n ----------
function t(key, vars) {
  var dict = I18N[state.lang] || I18N.th;
  var str = dict[key] != null ? dict[key] : (I18N.th[key] != null ? I18N.th[key] : key);
  if (vars) {
    Object.keys(vars).forEach(function (k) {
      str = str.replace("{" + k + "}", vars[k]);
    });
  }
  return str;
}

function statusLabel(key) {
  return t(STATUS_KEY_MAP[key] || "statusDeposit");
}

function loadLangPref() {
  try {
    var saved = localStorage.getItem(LANG_KEY);
    state.lang = (saved === "en" || saved === "th") ? saved : "en";
  } catch (e) {
    state.lang = "en";
  }
}

function saveLangPref() {
  try { localStorage.setItem(LANG_KEY, state.lang); } catch (e) { /* ignore */ }
}

function applyStaticTranslations() {
  document.documentElement.lang = state.lang;
  document.title = t("appTitle");

  Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-placeholder]"), function (el) {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-title]"), function (el) {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });

  Array.prototype.forEach.call(document.querySelectorAll(".lang-toggle .lang-btn"), function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === state.lang);
  });

  renderHeaderText();
  if (typeof refreshToolbarHints === "function") refreshToolbarHints();
  if (typeof refreshViewHints === "function") refreshViewHints();
  if (typeof refreshBulkBar === "function") refreshBulkBar();
  if (typeof renderSyncUI === "function") renderSyncUI();
}

function setLang(lang) {
  if (lang !== "th" && lang !== "en") return;
  if (state.lang === lang) return;
  state.lang = lang;
  saveLangPref();
  applyStaticTranslations();
  renderAppearanceMenu();
  renderAll();
}
