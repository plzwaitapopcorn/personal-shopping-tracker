"use strict";
// ---------- Detail Modal ----------
var currentDetailId = null;

function openDetailModal(id) {
  var o = state.orders.find(function (x) { return x.id === id; });
  if (!o) return;
  currentDetailId = id;
  var style = STATUS_STYLE[o.status] || STATUS_STYLE.deposit;
  var remain = remainingOf(o);

  var hero = o.mainImage
    ? '<img src="' + o.mainImage.replace(/"/g, "&quot;") + '" alt="' + escapeHtml(o.productName) + '">'
    : placeholderSvg();

  var proofsHtml = "";
  if (o.proofImages && o.proofImages.length) {
    var proofAlt = t("proofImageAlt");
    proofsHtml = '<div class="detail-proofs"><div class="lbl">' + t("detailProofImages") + '</div><div class="proof-thumbs">' +
      o.proofImages.map(function (src) {
        return '<img src="' + src.replace(/"/g, "&quot;") + '" alt="' + proofAlt + '" data-full="' + src.replace(/"/g, "&quot;") + '">';
      }).join("") + "</div></div>";
  }

  var trackingHtml;
  if (o.trackingNumber) {
    var courierKey = (o.courier && COURIER_INFO[o.courier]) ? o.courier : "other";
    var courierName = t(COURIER_INFO[courierKey].nameKey);
    var trackUrl = COURIER_INFO[courierKey].urlFn(o.trackingNumber, state.lang);
    var trackHost = trackUrl.replace(/^https?:\/\//, "").split(/[\/?#]/)[0];
    trackingHtml =
      '<div class="detail-tracking">' +
        '<div class="k">' + t("labelTrackingNumber") + '</div>' +
        '<div class="v">' + escapeHtml(o.trackingNumber) + ' <span class="track-courier">(' + escapeHtml(courierName) + ')</span></div>' +
        '<a class="btn-track" id="btnTrackLink" href="' + trackUrl + '" target="_blank" rel="noopener"' + (COURIER_INFO[courierKey].copy ? ' data-copy="1"' : "") + ">" + t("trackPackageBtn") + "</a>" +
        '<div class="track-dest">' + t("trackOpensAt") + " <b>" + escapeHtml(trackHost) + "</b>" +
          (COURIER_INFO[courierKey].aggregator ? "<br>" + t("trackAggregatorNote") : "") + "</div>" +
      "</div>";
  } else {
    var courierOptionsHtml = ["other", "thailandpost", "kerry", "flash", "jt", "ninjavan", "dhl"].map(function (key) {
      return '<option value="' + key + '"' + (key === "other" ? " selected" : "") + '>' + t(COURIER_INFO[key].nameKey) + "</option>";
    }).join("");
    trackingHtml =
      '<div class="detail-tracking">' +
        '<div class="k">' + t("labelTrackingNumber") + '</div>' +
        '<div class="tracking-input-row">' +
          '<select id="detailCourierInput">' + courierOptionsHtml + '</select>' +
          '<input type="text" id="detailTrackingInput" placeholder="' + t("placeholderTrackingNumber") + '">' +
          '<button type="button" class="btn-track" id="btnSaveTracking">' + t("saveBtn") + '</button>' +
        "</div>" +
      "</div>";
  }

  var body =
    '<div class="detail-hero">' + hero + "</div>" +
    '<span class="detail-status ' + style.bg + '">' + statusLabel(o.status) + "</span>" +
    '<div class="detail-title">' + nameHtml(o) + "</div>" +
    '<div class="detail-shop">🏬 ' + escapeHtml(o.shopName || t("noShop")) +
      (o.shopLink ? ' &nbsp;·&nbsp; <a href="' + escapeHtml(o.shopLink) + '" target="_blank" rel="noopener">' + t("openShopLink") + "</a>" : "") +
    "</div>" +
    '<div class="detail-grid">' +
      '<div class="detail-item"><div class="k">' + t("detailPurchaseDate") + '</div><div class="v">' + formatDateLong(o.purchaseDate) + "</div></div>" +
      '<div class="detail-item"><div class="k">' + t("detailFullPrice") + '</div><div class="v">' + priceHtml(o) + "</div></div>" +
      (o.depositPaid
        ? '<div class="detail-item"><div class="k">' + t("detailDepositPaid") + '</div><div class="v">฿' + money(o.depositPaid) + "</div></div>" +
          '<div class="detail-item"><div class="k">' + t("detailRemainDue") + '</div><div class="v remain">฿' + money(remain) + "</div></div>" +
          (o.dueDate && remain > 0 ? '<div class="detail-item"><div class="k">' + t("detailDueDate") + '</div><div class="v">' + formatDateLong(o.dueDate) + "</div></div>" : "")
        : '<div class="detail-item"><div class="k">' + t("detailDepositLabel") + '</div><div class="v">' + t("detailNoDeposit") + "</div></div>") +
    "</div>" +
    trackingHtml +
    (o.notes ? '<div class="detail-notes">' + escapeHtml(o.notes) + "</div>" : "") +
    proofsHtml;

  document.getElementById("detailBody").innerHTML = body;
  var trackLink = document.getElementById("btnTrackLink");
  if (trackLink && trackLink.getAttribute("data-copy")) {
    trackLink.addEventListener("click", function () {
      var code = o.trackingNumber || "";
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () { showToast(t("toastTrackCopied")); }, function () {});
        }
      } catch (err) { /* clipboard unavailable: the link still opens */ }
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".proof-thumbs img"), function (img) {
    img.addEventListener("click", function () { openLightbox(img.getAttribute("data-full")); });
  });

  var saveTrackingBtn = document.getElementById("btnSaveTracking");
  if (saveTrackingBtn) {
    var doSaveTracking = function () {
      var trackingVal = document.getElementById("detailTrackingInput").value.trim();
      if (!trackingVal) return;
      var courierVal = document.getElementById("detailCourierInput").value;
      var ord = state.orders.find(function (x) { return x.id === id; });
      if (!ord) return;
      ord.courier = courierVal;
      ord.trackingNumber = trackingVal;
      if (saveData()) {
        showToast(t("toastTrackingSaved"));
        openDetailModal(id);
      }
    };
    saveTrackingBtn.addEventListener("click", doSaveTracking);
    document.getElementById("detailTrackingInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doSaveTracking(); }
    });
  }

  document.getElementById("detailModalOverlay").classList.add("open");
}

function closeDetailModal() {
  document.getElementById("detailModalOverlay").classList.remove("open");
  currentDetailId = null;
}

function openLightbox(src) {
  var img = document.getElementById("lightboxImg");
  img.src = src;
  img.alt = t("lightboxAlt");
  document.getElementById("lightbox").classList.add("open");
}
function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.getElementById("lightboxImg").src = "";
}
