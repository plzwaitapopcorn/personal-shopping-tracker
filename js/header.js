"use strict";
// ---------- Header customization ----------
function loadHeaderData() {
  try {
    var raw = localStorage.getItem(HEADER_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    headerData = (parsed && typeof parsed === "object") ? parsed : { title: "", subtitle: "", image: "" };
  } catch (e) {
    headerData = { title: "", subtitle: "", image: "" };
  }
}

function saveHeaderData() {
  try {
    localStorage.setItem(HEADER_KEY, JSON.stringify(headerData));
    return true;
  } catch (e) {
    console.error("Failed to save header data", e);
    alert(t("alertSaveFail"));
    return false;
  }
}

function renderHeaderText() {
  var titleEl = document.getElementById("headerTitle");
  var subtitleEl = document.getElementById("headerSubtitle");
  if (titleEl) {
    // Last word of the title gets the primary color (only when there are 2+ words).
    var title = (headerData.title || t("appTitle")).trim();
    var idx = title.lastIndexOf(" ");
    titleEl.textContent = "";
    if (idx > 0 && idx < title.length - 1) {
      titleEl.appendChild(document.createTextNode(title.slice(0, idx + 1)));
      var hl = document.createElement("span");
      hl.className = "hl";
      hl.textContent = title.slice(idx + 1);
      titleEl.appendChild(hl);
    } else {
      titleEl.textContent = title;
    }
  }
  if (subtitleEl) subtitleEl.textContent = headerData.subtitle || t("appSubtitle");
}

function renderHeaderBanner() {
  var header = document.getElementById("appHeader");
  if (!header) return;
  if (headerData.image) {
    header.classList.add("has-banner");
    header.style.backgroundImage = "url('" + headerData.image.replace(/'/g, "\\'") + "')";
  } else {
    header.classList.remove("has-banner");
    header.style.backgroundImage = "";
  }
}

function openHeaderModal() {
  document.getElementById("fHeaderTitle").value = headerData.title || "";
  document.getElementById("fHeaderSubtitle").value = headerData.subtitle || "";
  tempHeaderImage = { type: "upload", value: headerData.image || "" };
  setHeaderTab("upload");
  renderHeaderPreview();
  document.getElementById("headerModalOverlay").classList.add("open");
}

function closeHeaderModal() {
  document.getElementById("headerModalOverlay").classList.remove("open");
}

function setHeaderTab(tab) {
  tempHeaderImage.type = tab;
  Array.prototype.forEach.call(document.querySelectorAll("[data-header-tab]"), function (b) {
    b.classList.toggle("active", b.getAttribute("data-header-tab") === tab);
  });
  document.getElementById("headerUploadPane").style.display = tab === "upload" ? "block" : "none";
  document.getElementById("headerUrlPane").style.display = tab === "url" ? "block" : "none";
}

function renderHeaderPreview() {
  var el = document.getElementById("headerImgPreview");
  if (tempHeaderImage.value) {
    el.className = "header-preview";
    el.innerHTML = '<img src="' + tempHeaderImage.value.replace(/"/g, "&quot;") + '" alt="">';
  } else {
    el.className = "header-preview empty";
    el.textContent = t("noImageYet");
  }
}
