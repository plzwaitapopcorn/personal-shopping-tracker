"use strict";
// ---------- Shrink saved images in the background ----------
// Runs quietly (no prompts): any order whose images have not been looked at yet is re-saved at a sensible size.
// The "already handled" memo lives only on this device, keyed by the images' total length, so edits are noticed.
var OPT_KEY = "preorderVault_opt";
var optimizing = false, optimizeAgain = false, optMemo = null;
function imgSig(o) {
  var n = (o.mainImage || "").length;
  (o.proofImages || []).forEach(function (x) { n += "|" + (x || "").length; });
  return String(n) + ":" + (o.mainThumb ? 1 : 0);
}
function loadOptMemo() {
  if (optMemo) return optMemo;
  try { optMemo = JSON.parse(localStorage.getItem(OPT_KEY) || "{}") || {}; } catch (e) { optMemo = {}; }
  return optMemo;
}
function saveOptMemo() { try { localStorage.setItem(OPT_KEY, JSON.stringify(optMemo)); } catch (e) { /* ignore */ } }
function autoOptimize() {
  if (!state.loaded) return Promise.resolve();
  if (optimizing) { optimizeAgain = true; return Promise.resolve(); }
  var memo = loadOptMemo();
  var todo = state.orders.filter(function (o) {
    return memo[o.id] !== imgSig(o) && (isRasterData(o.mainImage) || (o.proofImages || []).some(isRasterData));
  });
  if (!todo.length) return Promise.resolve();
  optimizing = true;
  var idx = 0, changed = false;
  function work(o) {
    var startSig = imgSig(o), main = o.mainImage || "", proofs = (o.proofImages || []).slice();
    var newMain = main, newThumb = o.mainThumb || "", newProofs = proofs.slice(), chain = Promise.resolve();
    if (isRasterData(main)) {
      chain = chain.then(function () { return compressDataUrl(main, IMG_MAIN); }).then(function (out) {
        if (out !== main) { newMain = out; newThumb = ""; }
        if (!newThumb) return makeThumb(newMain).then(function (th) { newThumb = th; });
      });
    }
    proofs.forEach(function (src, i) {
      chain = chain.then(function () { return compressDataUrl(src, IMG_PROOF); }).then(function (out) { newProofs[i] = out; });
    });
    return chain.then(function () {
      if (state.orders.indexOf(o) < 0 || imgSig(o) !== startSig) return;   // deleted or edited meanwhile: leave it
      var diff = newMain !== main || newThumb !== (o.mainThumb || "") || newProofs.some(function (x, i) { return x !== proofs[i]; });
      if (diff) {
        o.mainImage = newMain; o.mainThumb = newThumb;
        if (o.proofImages) o.proofImages = newProofs;
        changed = true;
      }
      memo[o.id] = imgSig(o);
    });
  }
  function next() {
    if (idx >= todo.length) return Promise.resolve();
    var o = todo[idx++];
    return work(o).catch(function (e) { console.error("optimize", e); }).then(function () {
      if (changed && idx % 10 === 0) saveData();
      return new Promise(function (r) { setTimeout(r, 40); });   // keep the page responsive
    }).then(next);
  }
  return next().then(function () {
    if (changed) { saveData(); renderAll(); }
    saveOptMemo();
  }).catch(function (e) { console.error("optimize", e); }).then(function () {
    optimizing = false;
    if (optimizeAgain) { optimizeAgain = false; setTimeout(autoOptimize, 500); }
  });
}
