/* Material Dispatch Sheet
   Printable A4 sheet, styled after Stonedge's paper dispatch form. Customer
   Name / Material Name / Finish-Surface are suggested from orders.json
   (each level filtered by the one before it); every other field is left
   blank for manual entry, on paper or on screen.
*/

const DEFAULT_ROWS = 10;

let customersToMaterials = {}; // customer -> Set of material names
let comboToFinishes = {}; // "customer||material" -> Set of finishes
let rowCount = 0;

function comboKey(customer, material) {
  return `${customer}||${material}`;
}

function buildLookups(orders) {
  customersToMaterials = {};
  comboToFinishes = {};
  orders.forEach((o) => {
    const cust = (o["Customer Name"] || "").trim();
    const mat = (o["Material Name"] || "").trim();
    const finish = (o["Finish / Surface"] || "").trim();
    if (!cust) return;
    if (!customersToMaterials[cust]) customersToMaterials[cust] = new Set();
    if (mat) customersToMaterials[cust].add(mat);
    if (mat && finish) {
      const key = comboKey(cust, mat);
      if (!comboToFinishes[key]) comboToFinishes[key] = new Set();
      comboToFinishes[key].add(finish);
    }
  });
}

function fillDatalist(list, values) {
  list.innerHTML = Array.from(values)
    .sort()
    .map((v) => `<option value="${escapeAttr(v)}"></option>`)
    .join("");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addRow() {
  rowCount += 1;
  const idx = rowCount;
  const tbody = document.getElementById("sheetBody");
  const tr = document.createElement("tr");

  const materialListId = `materialList-${idx}`;
  const finishListId = `finishList-${idx}`;

  tr.innerHTML = `
    <td class="col-sr sr-cell"></td>
    <td class="col-customer">
      <input type="text" class="cell-input customer-input" list="customerNames" />
    </td>
    <td class="col-material">
      <input type="text" class="cell-input material-input" list="${materialListId}" />
      <datalist id="${materialListId}"></datalist>
    </td>
    <td class="col-finish">
      <input type="text" class="cell-input finish-input" list="${finishListId}" />
      <datalist id="${finishListId}"></datalist>
    </td>
    <td class="col-address"><input type="text" class="cell-input" /></td>
    <td class="col-challan"><input type="text" class="cell-input" /></td>
    <td class="col-qty"><input type="text" class="cell-input" /></td>
    <td class="col-time"><input type="text" class="cell-input" /></td>
    <td class="col-remarks"><input type="text" class="cell-input" /></td>
  `;
  tbody.appendChild(tr);

  const customerInput = tr.querySelector(".customer-input");
  const materialInput = tr.querySelector(".material-input");
  const finishInput = tr.querySelector(".finish-input");
  const materialList = tr.querySelector(`#${materialListId}`);
  const finishList = tr.querySelector(`#${finishListId}`);

  const refreshMaterialOptions = () => {
    const cust = customerInput.value.trim();
    const materials = customersToMaterials[cust] || new Set();
    fillDatalist(materialList, materials);
  };
  const refreshFinishOptions = () => {
    const cust = customerInput.value.trim();
    const mat = materialInput.value.trim();
    const finishes = comboToFinishes[comboKey(cust, mat)] || new Set();
    fillDatalist(finishList, finishes);
  };

  customerInput.addEventListener("input", () => {
    refreshMaterialOptions();
    refreshFinishOptions();
  });
  materialInput.addEventListener("input", refreshFinishOptions);

  renumberRows();
}

function removeRow() {
  const tbody = document.getElementById("sheetBody");
  if (tbody.children.length === 0) return;
  tbody.removeChild(tbody.lastElementChild);
  renumberRows();
}

function renumberRows() {
  const tbody = document.getElementById("sheetBody");
  Array.from(tbody.children).forEach((tr, i) => {
    tr.querySelector(".sr-cell").textContent = i + 1;
  });
}

function clearSheet() {
  if (!confirm("Clear everything typed into this sheet?")) return;
  document.querySelectorAll("#sheetBody .cell-input").forEach((inp) => (inp.value = ""));
  document.querySelectorAll(".signoff-input").forEach((inp) => (inp.value = ""));
}

function setDefaultDate() {
  const el = document.getElementById("sheetDate");
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  el.value = `${y}-${m}-${d}`;
}

function init() {
  setDefaultDate();

  fetch(`orders.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((orders) => {
      buildLookups(orders);
      fillDatalist(document.getElementById("customerNames"), Object.keys(customersToMaterials));
      for (let i = 0; i < DEFAULT_ROWS; i++) addRow();
    })
    .catch(() => {
      // Even if orders.json can't be loaded, the sheet should still work —
      // just without autocomplete suggestions.
      for (let i = 0; i < DEFAULT_ROWS; i++) addRow();
    });

  document.getElementById("addRowBtn").addEventListener("click", addRow);
  document.getElementById("removeRowBtn").addEventListener("click", removeRow);
  document.getElementById("clearSheetBtn").addEventListener("click", clearSheet);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
}

document.addEventListener("DOMContentLoaded", init);
