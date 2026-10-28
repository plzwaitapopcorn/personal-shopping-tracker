"use strict";
// ---------- Export / Import ----------
function exportData() {
  var blob = new Blob([JSON.stringify({ v: 2, orders: state.orders, finance: fin.items }, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  var stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = "preorder-vault-backup-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(t("toastExported"));
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      var finItems = [];
      if (!Array.isArray(data)) {             // newer backups: { orders: [...], finance: [...] }
        if (!data || !Array.isArray(data.orders)) throw new Error("Invalid file format");
        finItems = Array.isArray(data.finance) ? data.finance : [];
        data = data.orders;
      }
      var existingIds = {};
      state.orders.forEach(function (o) { existingIds[o.id] = true; });
      var added = 0;
      data.forEach(function (o) {
        if (o && o.id && !existingIds[o.id]) {
          state.orders.push(o);
          added++;
        }
      });
      var finIds = {};
      fin.items.forEach(function (x) { finIds[x.id] = true; });
      finItems.forEach(function (x) {
        if (finValid(x) && !finIds[x.id]) { fin.items.push(x); finIds[x.id] = true; added++; }
      });
      saveData();
      finSave();
      renderAll();
      if (typeof finRenderAll === "function") finRenderAll();
      showToast(t("toastImported", { n: added }));
      setTimeout(autoOptimize, 500);
    } catch (err) {
      alert(t("alertImportFail"));
    }
  };
  reader.readAsText(file);
}
