"use strict";
// Registers the offline helper (service worker). Only on https / localhost; skipped when opened as a local file.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("sw", e); });
  });
}
