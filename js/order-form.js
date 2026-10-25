"use strict";
// ---------- Order Modal (add/edit) ----------
// Wishlist items don't need a name or price: drop the browser's "required" check and the * marks.
function syncWishlistRequired() {
  var wish = document.getElementById("fStatus").value === "wishlist";
  document.getElementById("fProductName").required = !wish;
  document.getElementById("fFullPrice").required = !wish;
  document.getElementById("reqName").style.display = wish ? "none" : "";
  document.getElementById("reqPrice").style.display = wish ? "none" : "";
}

function resetOrderForm() {
  editingId = null;
  tempMain = { type: "upload", value: "" }; tempMainThumb = "";
  tempProofs = [];
  pasteZone = null;
  document.getElementById("orderForm").reset();
  document.getElementById("orderId").value = "";
  document.getElementById("fPurchaseDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("fStatus").value = "deposit";
  syncWishlistRequired();
  document.getElementById("btnDeleteOrder").style.display = "none";
  document.getElementById("orderModalTitle").textContent = t("modalTitleAdd");
  setMainTab("upload");
  document.getElementById("proofUrlPane").style.display = "none";
  renderMainPreview();
  renderProofPreview();
  updateRemainLive();
}

function openOrderModal(orderId) {
  resetOrderForm();
  if (orderId) {
    var o = state.orders.find(function (x) { return x.id === orderId; });
    if (o) {
      editingId = o.id;
      document.getElementById("orderModalTitle").textContent = t("modalTitleEdit");
      document.getElementById("orderId").value = o.id;
      document.getElementById("fProductName").value = o.productName || "";
      document.getElementById("fShopName").value = o.shopName || "";
      document.getElementById("fPurchaseDate").value = o.purchaseDate || "";
      document.getElementById("fFullPrice").value = o.fullPrice != null ? o.fullPrice : "";
      document.getElementById("fDeposit").value = o.depositPaid != null ? o.depositPaid : "";
      document.getElementById("fStatus").value = o.status || "deposit";
      syncWishlistRequired();
      document.getElementById("fCourier").value = o.courier || "other";
      document.getElementById("fTrackingNumber").value = o.trackingNumber || "";
      document.getElementById("fShopLink").value = o.shopLink || "";
      document.getElementById("fNotes").value = o.notes || "";
      tempMain = { type: "upload", value: o.mainImage || "" }; tempMainThumb = o.mainThumb || "";
      tempProofs = (o.proofImages || []).slice();
      pasteZone = null;
      if (/^https?:/i.test(tempMain.value)) { tempMain.type = "url"; document.getElementById("fMainImageUrl").value = tempMain.value; }
      setMainTab(tempMain.type);
      renderMainPreview();
      renderProofPreview();
      updateRemainLive();
      document.getElementById("btnDeleteOrder").style.display = "inline-block";
    }
  }
  document.getElementById("orderModalOverlay").classList.add("open");
  document.getElementById("fProductName").focus();
}

function closeOrderModal() {
  document.getElementById("orderModalOverlay").classList.remove("open");
}

// "url" shows the image-link input; anything else hides it (upload / paste / drop need no extra UI).
function setMainTab(tab) {
  tempMain.type = tab;
  document.getElementById("mainUrlPane").style.display = tab === "url" ? "block" : "none";
}

function renderMainPreview() {
  var el = document.getElementById("mainPreview");
  if (tempMain.value) {
    el.className = "drop-zone has-img";
    el.innerHTML = '<img src="' + tempMain.value.replace(/"/g, "&quot;") + '" alt="' + t("mainImageAlt") + '">' +
      '<div class="drop-actions">' +
      '<button type="button" data-act="change">' + t("changeImage") + "</button>" +
      '<button type="button" class="danger" data-act="remove">\u2715 ' + t("removeImage") + "</button></div>";
  } else {
    el.className = "drop-zone";
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>' +
      "<div>" + t("dropHint") + "</div>";
  }
}

function setMainImage(dataUrl) {
  tempMain = { type: "upload", value: dataUrl };
  tempMainThumb = "";
  makeThumb(dataUrl).then(function (th) { if (tempMain.value === dataUrl) tempMainThumb = th; });
  pasteZone = "main";
  setMainTab("upload");
  document.getElementById("fMainImageUrl").value = "";
  renderMainPreview();
}

function renderProofPreview() {
  var row = document.getElementById("proofPreviewRow");
  var alt = t("proofImageAlt");
  row.innerHTML = tempProofs.map(function (src, i) {
    return '<div class="img-preview"><img src="' + src.replace(/"/g, "&quot;") + '" alt="' + alt + " " + (i + 1) + '">' +
      '<button type="button" class="rm" data-idx="' + i + '">✕</button></div>';
  }).join("");
  Array.prototype.forEach.call(row.querySelectorAll(".rm"), function (btn) {
    btn.addEventListener("click", function () {
      tempProofs.splice(parseInt(btn.getAttribute("data-idx"), 10), 1);
      renderProofPreview();
    });
  });
}

function updateRemainLive() {
  var full = parseFloat(document.getElementById("fFullPrice").value) || 0;
  var dep = parseFloat(document.getElementById("fDeposit").value) || 0;
  var el = document.getElementById("remainLive");
  if (dep > 0) {
    var remain = full - dep;
    el.textContent = remain > 0
      ? t("remainLiveDue", { remain: money(remain) })
      : t("remainLiveFull");
  } else {
    el.textContent = "";
  }
}

function handleOrderSubmit(e) {
  e.preventDefault();
  var productName = document.getElementById("fProductName").value.trim();
  var shopName = document.getElementById("fShopName").value.trim();
  var fullPrice = parseFloat(document.getElementById("fFullPrice").value) || 0;
  var deposit = document.getElementById("fDeposit").value === "" ? null : parseFloat(document.getElementById("fDeposit").value);

  var isWish = document.getElementById("fStatus").value === "wishlist";
  if (!productName && !isWish) { alert(t("alertProductNameRequired")); return; }

  var order = {
    id: editingId || uid(),
    productName: productName,
    shopName: shopName,
    purchaseDate: document.getElementById("fPurchaseDate").value || "",
    fullPrice: fullPrice,
    depositPaid: deposit,
    status: document.getElementById("fStatus").value,
    courier: document.getElementById("fCourier").value,
    trackingNumber: document.getElementById("fTrackingNumber").value.trim(),
    shopLink: document.getElementById("fShopLink").value.trim(),
    notes: document.getElementById("fNotes").value.trim(),
    mainImage: tempMain.value || "",
    mainThumb: (tempMain.type === "upload" && tempMain.value) ? tempMainThumb : "",
    proofImages: tempProofs.slice(),
    createdAt: editingId ? (state.orders.find(function (o) { return o.id === editingId; }) || {}).createdAt || Date.now() : Date.now()
  };

  if (editingId) {
    var idx = state.orders.findIndex(function (o) { return o.id === editingId; });
    if (idx !== -1) state.orders[idx] = order;
  } else {
    state.orders.push(order);
  }

  if (saveData()) {
    closeOrderModal();
    renderAll();
    showToast(editingId ? t("toastUpdated") : t("toastAdded"));
  }
}
