"use strict";
// ---------- Event wiring ----------
function init() {
  loadAppearancePref();
  loadLangPref();
  loadHeaderData();
  applyStaticTranslations();
  renderHeaderBanner();
  initViewToggles();
  initBulkSelect();
  initSync();
  initFinance();
  initHome();
  initRouter();
  loadData().then(function () { return loadFinance().catch(function (e) { console.error("finance load", e); }); }).then(function () {
    syncInitMaps();
    state.loaded = true;
    renderAll();
    if (sync.enabled) runSync(false, false);   // pick up changes made on other devices (shrinks images when done)
    else setTimeout(autoOptimize, 1200);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".lang-toggle .lang-btn"), function (btn) {
    btn.addEventListener("click", function () { setLang(btn.getAttribute("data-lang")); });
  });

  Array.prototype.forEach.call(document.querySelectorAll(".mode-btn"), function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
  });
  document.getElementById("colorRow").addEventListener("click", function (e) {
    var d = e.target.closest(".color-dot");
    if (d) setPrimary(d.getAttribute("data-primary"));
  });

  document.getElementById("btnCustomizeHeader").addEventListener("click", openHeaderModal);
  document.getElementById("closeHeaderModal").addEventListener("click", closeHeaderModal);
  document.getElementById("cancelHeaderForm").addEventListener("click", closeHeaderModal);
  document.getElementById("headerModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeHeaderModal();
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-header-tab]"), function (btn) {
    btn.addEventListener("click", function () { setHeaderTab(btn.getAttribute("data-header-tab")); });
  });
  document.getElementById("fHeaderImageFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    compressImageFile(file, IMG_MAIN).then(function (dataUrl) {
      tempHeaderImage = { type: "upload", value: dataUrl };
      renderHeaderPreview();
    });
  });
  document.getElementById("fHeaderImageUrl").addEventListener("input", function (e) {
    tempHeaderImage = { type: "url", value: e.target.value.trim() };
    renderHeaderPreview();
  });
  document.getElementById("btnRemoveHeaderImage").addEventListener("click", function () {
    tempHeaderImage = { type: "upload", value: "" };
    renderHeaderPreview();
    document.getElementById("fHeaderImageFile").value = "";
    document.getElementById("fHeaderImageUrl").value = "";
  });
  document.getElementById("btnResetHeader").addEventListener("click", function () {
    if (!confirm(t("confirmResetHeader"))) return;
    headerData = { title: "", subtitle: "", image: "" };
    tempHeaderImage = { type: "upload", value: "" };
    if (saveHeaderData()) {
      renderHeaderText();
      renderHeaderBanner();
      closeHeaderModal();
      showToast(t("toastHeaderReset"));
    }
  });
  document.getElementById("saveHeaderForm").addEventListener("click", function () {
    headerData.title = document.getElementById("fHeaderTitle").value.trim();
    headerData.subtitle = document.getElementById("fHeaderSubtitle").value.trim();
    headerData.image = tempHeaderImage.value || "";
    if (saveHeaderData()) {
      renderHeaderText();
      renderHeaderBanner();
      closeHeaderModal();
      showToast(t("toastHeaderSaved"));
    }
  });

  function showHelpTab(id) {
    Array.prototype.forEach.call(document.querySelectorAll(".help-tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-help-tab") === id);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".help-panel"), function (pn) {
      pn.classList.toggle("active", pn.getAttribute("data-help-panel") === id);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll(".help-tab"), function (b) {
    b.addEventListener("click", function () { showHelpTab(b.getAttribute("data-help-tab")); });
  });
  document.getElementById("btnHelp").addEventListener("click", function () {
    showHelpTab("start");
    document.getElementById("helpModalOverlay").classList.add("open");
  });
  document.getElementById("closeHelpModal").addEventListener("click", function () {
    document.getElementById("helpModalOverlay").classList.remove("open");
  });
  document.getElementById("helpModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("open");
  });

  document.getElementById("btnAdd").addEventListener("click", function () { openOrderModal(); });
  document.getElementById("closeOrderModal").addEventListener("click", closeOrderModal);
  document.getElementById("cancelOrderForm").addEventListener("click", closeOrderModal);
  document.getElementById("orderForm").addEventListener("submit", handleOrderSubmit);
  document.getElementById("btnDeleteOrder").addEventListener("click", function () {
    if (editingId) deleteOrder(editingId);
  });

  document.getElementById("orderModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeOrderModal();
  });
  document.getElementById("detailModalOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeDetailModal();
  });

  document.getElementById("closeDetailModal").addEventListener("click", closeDetailModal);
  document.getElementById("btnEditFromDetail").addEventListener("click", function () {
    var idToEdit = currentDetailId; // closeDetailModal() clears currentDetailId, so grab it first
    closeDetailModal();
    openOrderModal(idToEdit);
  });
  document.getElementById("btnDeleteFromDetail").addEventListener("click", function () {
    if (currentDetailId) deleteOrder(currentDetailId);
  });

  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
  document.getElementById("lightbox").addEventListener("click", function (e) {
    if (e.target === this) closeLightbox();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeLightbox();
      closeOrderModal();
      closeDetailModal();
      closeHeaderModal();
      document.getElementById("helpModalOverlay").classList.remove("open");
    }
  });

  // Filters
  (function () {
    var box = document.getElementById("searchBox");
    var input = document.getElementById("searchInput");
    function open() { box.classList.add("open"); input.focus(); }
    function closeIfEmpty() { if (!input.value) box.classList.remove("open"); }
    document.getElementById("searchToggle").addEventListener("click", function () {
      if (box.classList.contains("open") && !input.value) closeIfEmpty(); else open();
    });
    input.addEventListener("blur", closeIfEmpty);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); input.blur(); }
    });
  })();
  document.getElementById("searchInput").addEventListener("input", function (e) {
    state.search = e.target.value;
    renderGrid();
  });
  document.getElementById("sortSelect").addEventListener("change", function (e) {
    state.sort = e.target.value;
    refreshToolbarHints();
    renderGrid();
  });
  document.getElementById("monthSelect").addEventListener("change", function (e) {
    state.monthYear = e.target.value;
    refreshToolbarHints();
    renderGrid();
  });
  // Status filter: mobile chips and the desktop rail rows share one handler.
  // Tapping the active status again goes back to "all".
  Array.prototype.forEach.call(document.querySelectorAll("#statusChips .chip, .rail-row"), function (el) {
    el.addEventListener("click", function () {
      var value = el.getAttribute("data-status");
      state.status = (state.status === value && value !== "all") ? "all" : value;
      syncStatusFilterUI();
      renderGrid();
    });
  });
  document.getElementById("btnClearStatus").addEventListener("click", function () {
    state.status = "all";
    syncStatusFilterUI();
    renderGrid();
  });

  // Main image: one zone (click to choose, drag & drop, paste) + change / remove
  var mainZone = document.getElementById("mainPreview");
  var mainFile = document.getElementById("fMainImageFile");
  function loadMainFile(file) {
    if (!file || file.type.indexOf("image/") !== 0) return;
    compressImageFile(file, IMG_MAIN).then(setMainImage);
  }
  mainZone.addEventListener("click", function (e) {
    pasteZone = "main";
    mainZone.focus();
    var act = e.target.closest && e.target.closest("[data-act]");
    if (act) {
      e.stopPropagation();
      if (act.getAttribute("data-act") === "remove") {
        tempMain = { type: "upload", value: "" }; tempMainThumb = "";
        document.getElementById("fMainImageUrl").value = "";
        setMainTab("upload");
        renderMainPreview();
        mainZone.focus();
      } else {
        mainFile.click();
      }
      return;
    }
    if (!tempMain.value) mainFile.click();
  });
  mainZone.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target === mainZone) {
      e.preventDefault();
      mainFile.click();
    }
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    mainZone.addEventListener(ev, function (e) { e.preventDefault(); mainZone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    mainZone.addEventListener(ev, function () { mainZone.classList.remove("dragover"); });
  });
  mainZone.addEventListener("drop", function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadMainFile(f);
  });
  mainFile.addEventListener("change", function (e) {
    loadMainFile(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("btnMainUrlToggle").addEventListener("click", function () {
    var open = document.getElementById("mainUrlPane").style.display !== "none";
    setMainTab(open ? "upload" : "url");
    if (!open) document.getElementById("fMainImageUrl").focus();
  });
  document.getElementById("fMainImageUrl").addEventListener("input", function (e) {
    tempMain = { type: "url", value: e.target.value.trim() };
    renderMainPreview();
  });
  document.getElementById("proofImageRow").addEventListener("pointerdown", function () { pasteZone = "proof"; });
  document.getElementById("proofImageRow").addEventListener("focusin", function () { pasteZone = "proof"; });

  // Proof images: same zone (click / drop / paste), multiple files, link box behind a small toggle
  var proofZone = document.getElementById("proofDrop");
  var proofFile = document.getElementById("fProofFiles");
  function addProofFiles(list) {
    var files = Array.prototype.slice.call(list || []).filter(function (f) { return f.type.indexOf("image/") === 0; });
    if (!files.length) return;
    Promise.all(files.map(function (f) { return compressImageFile(f, IMG_PROOF); })).then(function (results) {
      tempProofs = tempProofs.concat(results);
      pasteZone = "proof";
      renderProofPreview();
    });
  }
  proofZone.addEventListener("click", function () { pasteZone = "proof"; proofZone.focus(); proofFile.click(); });
  proofZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pasteZone = "proof"; proofFile.click(); }
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    proofZone.addEventListener(ev, function (e) { e.preventDefault(); proofZone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    proofZone.addEventListener(ev, function () { proofZone.classList.remove("dragover"); });
  });
  proofZone.addEventListener("drop", function (e) {
    e.preventDefault();
    addProofFiles(e.dataTransfer && e.dataTransfer.files);
  });
  proofFile.addEventListener("change", function (e) {
    addProofFiles(e.target.files);
    e.target.value = "";
  });
  document.getElementById("btnProofUrlToggle").addEventListener("click", function () {
    var pane = document.getElementById("proofUrlPane");
    var open = pane.style.display !== "none";
    pane.style.display = open ? "none" : "flex";
    if (!open) document.getElementById("fProofUrl").focus();
  });
  document.getElementById("btnAddProofUrl").addEventListener("click", function () {
    var input = document.getElementById("fProofUrl");
    var val = input.value.trim();
    if (val) {
      tempProofs.push(val);
      input.value = "";
      renderProofPreview();
    }
  });

  // Paste images from the clipboard (screenshots, copied images)
  document.addEventListener("paste", function (e) {
    var cd = e.clipboardData;
    if (!cd || !cd.items) return;
    var files = [];
    Array.prototype.forEach.call(cd.items, function (it) {
      if (it.kind === "file" && it.type.indexOf("image/") === 0) {
        var f = it.getAsFile();
        if (f) files.push(f);
      }
    });
    if (!files.length) return; // plain text paste: leave it alone

    var orderOpen = document.getElementById("orderModalOverlay").classList.contains("open");
    var headerOpen = document.getElementById("headerModalOverlay").classList.contains("open");
    if (!orderOpen && !headerOpen) return;
    e.preventDefault();

    if (headerOpen) {
      compressImageFile(files[0], IMG_MAIN).then(function (dataUrl) {
        tempHeaderImage = { type: "upload", value: dataUrl };
        setHeaderTab("upload");
        renderHeaderPreview();
        showToast(t("pasteDone"));
      });
      return;
    }

    // Order form: paste goes where the cursor is; otherwise main photo if empty, else proof.
    // The last zone the user touched wins (so pasting again replaces the main photo until they click the proof area).
    var active = document.activeElement;
    if (active && document.getElementById("mainImageRow").contains(active)) pasteZone = "main";
    else if (active && document.getElementById("proofImageRow").contains(active)) pasteZone = "proof";
    var toMain = pasteZone ? pasteZone === "main" : !tempMain.value;
    if (toMain) {
      compressImageFile(files[0], IMG_MAIN).then(function (dataUrl) {
        setMainImage(dataUrl);
        showToast(t("pasteDone"));
      });
    } else {
      Promise.all(files.map(function (f) { return compressImageFile(f, IMG_PROOF); })).then(function (results) {
        tempProofs = tempProofs.concat(results);
        renderProofPreview();
        showToast(t("pasteDone"));
      });
    }
  });

  // Live remaining calc
  document.getElementById("fStatus").addEventListener("change", syncWishlistRequired);
  document.getElementById("fFullPrice").addEventListener("input", updateRemainLive);
  document.getElementById("fDeposit").addEventListener("input", updateRemainLive);

  // Export / Import
  document.getElementById("btnExport").addEventListener("click", exportData);
  document.getElementById("btnImport").addEventListener("click", function () {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
