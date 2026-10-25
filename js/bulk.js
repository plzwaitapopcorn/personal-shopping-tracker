"use strict";
// ---------- Bulk select / delete ----------
var selectMode = false;
var selected = {};   // id -> true

function selectedVisibleIds(list) {
  list = list || getVisibleOrders();
  return list.filter(function (o) { return selected[o.id]; }).map(function (o) { return o.id; });
}
function refreshBulkBar(list) {
  var bar = document.getElementById("bulkBar");
  var btn = document.getElementById("btnSelectMode");
  if (!bar || !btn) return;
  list = list || getVisibleOrders();
  var n = selectedVisibleIds(list).length;
  bar.classList.toggle("show", selectMode);
  btn.classList.toggle("is-active", selectMode);
  btn.setAttribute("aria-pressed", selectMode ? "true" : "false");
  var title = t("selectModeTitle");
  btn.setAttribute("title", title); btn.setAttribute("aria-label", title);
  document.getElementById("bulkCount").textContent = t("bulkSelected", { n: n });
  var allSelected = list.length > 0 && n === list.length;
  document.getElementById("bulkAll").textContent = allSelected ? t("bulkNone") : t("bulkAll");
  var del = document.getElementById("bulkDelete");
  del.textContent = t("bulkDelete") + (n ? " (" + n + ")" : "");
  del.disabled = n === 0;
  document.getElementById("bulkCancel").textContent = t("bulkDone");
}
function setSelectMode(on) {
  selectMode = !!on;
  if (!selectMode) selected = {};
  renderGrid();
}
function toggleSelected(id) {
  if (selected[id]) delete selected[id]; else selected[id] = true;
  var el = document.querySelector('#grid [data-id="' + id + '"].card, #grid [data-id="' + id + '"].row');
  if (el) el.classList.toggle("is-selected", !!selected[id]);
  refreshBulkBar();
}
function bulkDeleteSelected() {
  var ids = selectedVisibleIds();
  if (!ids.length) return;
  if (!confirm(t("confirmBulkDelete", { n: ids.length }))) return;
  var gone = {}; ids.forEach(function (id) { gone[id] = true; });
  state.orders = state.orders.filter(function (o) { return !gone[o.id]; });
  saveData();
  selected = {}; selectMode = false;
  renderAll();
  showToast(t("toastBulkDeleted", { n: ids.length }));
}
function initBulkSelect() {
  document.getElementById("btnSelectMode").addEventListener("click", function () { setSelectMode(!selectMode); });
  document.getElementById("bulkCancel").addEventListener("click", function () { setSelectMode(false); });
  document.getElementById("bulkDelete").addEventListener("click", bulkDeleteSelected);
  document.getElementById("bulkAll").addEventListener("click", function () {
    var list = getVisibleOrders();
    var all = list.length > 0 && selectedVisibleIds(list).length === list.length;
    list.forEach(function (o) { if (all) delete selected[o.id]; else selected[o.id] = true; });
    renderGrid();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !selectMode) return;
    if (document.querySelector(".modal-overlay.open, .lightbox.open")) return;
    setSelectMode(false);
  });
}

function deleteOrder(id) {
  if (!confirm(t("confirmDelete"))) return;
  state.orders = state.orders.filter(function (o) { return o.id !== id; });
  saveData();
  renderAll();
  closeOrderModal();
  document.getElementById("detailModalOverlay").classList.remove("open");
  showToast(t("toastDeleted"));
}
