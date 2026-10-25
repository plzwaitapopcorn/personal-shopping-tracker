"use strict";
// ---------- Image handling ----------
// Quality-preserving size reduction. Long edge is capped (proof 2000 px, main 1600 px) and re-encoded at high JPEG
// quality, so text on receipts / slips stays readable. Small files are left byte-for-byte untouched.
var IMG_MAIN = { edge: 1600, q: 0.86 }, IMG_PROOF = { edge: 2000, q: 0.88 }, IMG_THUMB = { edge: 480, q: 0.8 };
var IMG_SKIP = 300 * 1024;
function dataUrlBytes(str) { return str ? Math.round(str.length * 0.75) : 0; }
function isRasterData(str) { return typeof str === "string" && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(str); }
function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var im = new Image();
    im.onload = function () { resolve(im); };
    im.onerror = reject;
    im.src = src;
  });
}
function recodeImage(img, spec) {
  var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  var k = Math.min(1, spec.edge / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  var canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  var out = canvas.toDataURL("image/jpeg", spec.q);
  canvas.width = canvas.height = 0;   // release the bitmap right away (matters on phones)
  return out;
}
function recodeDataUrl(src, spec) { return loadImage(src).then(function (img) { return recodeImage(img, spec); }); }
// Decides whether an image is worth re-encoding. A JPEG that already fits the size limit is left alone, so
// running the shrink twice never degrades a picture a second time.
function shrinkPlan(src, spec) {
  if (!isRasterData(src) || dataUrlBytes(src) < IMG_SKIP) return Promise.resolve(null);
  return loadImage(src).then(function (img) {
    var tooBig = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height) > spec.edge;
    var isJpeg = /^data:image\/jpe?g/i.test(src);
    return (tooBig || !isJpeg || dataUrlBytes(src) > 1200 * 1024) ? img : null;
  }, function () { return null; });
}
// Resolves to the original string when it is not a raster data URL, already fine, or not made smaller.
function compressDataUrl(src, spec) {
  return shrinkPlan(src, spec).then(function (img) {
    if (!img) return src;
    var out = recodeImage(img, spec);
    return out.length < src.length ? out : src;
  }).catch(function () { return src; });
}
function makeThumb(src) {
  if (!isRasterData(src) || dataUrlBytes(src) < 60 * 1024) return Promise.resolve("");
  return recodeDataUrl(src, IMG_THUMB).then(function (out) { return out.length < src.length ? out : ""; }, function () { return ""; });
}
function compressImageFile(file, spec) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) { compressDataUrl(e.target.result, spec || IMG_MAIN).then(resolve); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
