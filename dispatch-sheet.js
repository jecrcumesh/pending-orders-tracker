/* Material Dispatch Sheet
   Printable A4 sheet, styled after Stonedge's paper dispatch form. Customer
   Name / Material Name / Finish-Surface are suggested from orders.json
   (each level filtered by the one before it). Rows due tomorrow (per the
   same logic as the Delivery Planner) are pre-filled automatically to cut
   down on retyping; every other field is left blank for manual entry.
*/

const DEFAULT_ROWS = 10;
const EXTRA_BLANK_ROWS = 5; // added after any auto-filled rows, for walk-ins/extras
const INACTIVE_STATUSES = ["Completed", "Cancelled"];

let customersToMaterials = {}; // customer -> Set of material names
let comboToFinishes = {}; // "customer||material" -> Set of finishes
let rowCount = 0;

function tomorrowKey() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Same rule as the Delivery Planner's "Tomorrow" bucket: active orders
// (not Completed/Cancelled) whose Expected Delivery Date is tomorrow.
function ordersDueTomorrow(orders) {
  const key = tomorrowKey();
  return orders.filter(
    (o) =>
      !INACTIVE_STATUSES.includes(o["Order Status"]) &&
      (o["Expected Delivery Date"] || "") === key
  );
}

function orderToPrefill(o) {
  const qty = o["Balance Qty"] !== "" && o["Balance Qty"] !== undefined ? o["Balance Qty"] : o["Order Qty"];
  const unit = o["Unit"] || "";
  return {
    customer: o["Customer Name"] || "",
    material: o["Material Name"] || "",
    finish: o["Finish / Surface"] || "",
    address: o["Contact Number"] || "",
    qty: qty !== "" && qty !== undefined && qty !== null ? `${qty}${unit ? " " + unit : ""}` : "",
    remarks: o["Remarks / Notes"] || "",
  };
}

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

// Supports comma-separated multi-value entry: once you've typed one value
// and a comma, suggest the *remaining* candidates (as full "already-typed,
// next-candidate" strings, since that's what the browser's datalist needs
// to match against and insert correctly).
function commaAwareOptions(rawValue, candidateSet) {
  const parts = rawValue.split(",").map((p) => p.trim()).filter((p) => p !== "");
  const endsWithComma = /,\s*$/.test(rawValue);
  const committedParts = endsWithComma ? parts : parts.slice(0, -1);
  const usedLower = new Set(committedParts.map((p) => p.toLowerCase()));
  const remaining = Array.from(candidateSet).filter((v) => !usedLower.has(v.toLowerCase()));
  const prefix = committedParts.length ? committedParts.join(", ") + ", " : "";
  return remaining.map((v) => prefix + v);
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addRow(prefill) {
  rowCount += 1;
  const idx = rowCount;
  const tbody = document.getElementById("sheetBody");
  const tr = document.createElement("tr");
  if (prefill) tr.classList.add("prefilled-row");

  const materialListId = `materialList-${idx}`;
  const finishListId = `finishList-${idx}`;

  tr.innerHTML = `
    <td class="col-color">
      <input type="color" class="color-input" value="#ffffff" title="Pick a color to highlight this row" />
      <button type="button" class="color-clear-btn" title="Clear row color">✕</button>
    </td>
    <td class="col-sr sr-cell"></td>
    <td class="col-customer">
      <input type="text" class="cell-input customer-input" list="customerNames" />
      <span class="print-text"></span>
    </td>
    <td class="col-material">
      <input type="text" class="cell-input material-input" list="${materialListId}" />
      <datalist id="${materialListId}"></datalist>
      <span class="print-text"></span>
    </td>
    <td class="col-finish">
      <input type="text" class="cell-input finish-input" list="${finishListId}" />
      <datalist id="${finishListId}"></datalist>
      <span class="print-text"></span>
    </td>
    <td class="col-address"><input type="text" class="cell-input address-input" /><span class="print-text"></span></td>
    <td class="col-qty"><input type="text" class="cell-input qty-input" /><span class="print-text"></span></td>
    <td class="col-time"><input type="text" class="cell-input time-input" /><span class="print-text"></span></td>
    <td class="col-remarks"><input type="text" class="cell-input remarks-input" /><span class="print-text"></span></td>
  `;
  tbody.appendChild(tr);

  const colorInput = tr.querySelector(".color-input");
  const colorClearBtn = tr.querySelector(".color-clear-btn");
  colorInput.addEventListener("input", () => {
    tr.style.backgroundColor = colorInput.value;
  });
  colorClearBtn.addEventListener("click", () => {
    tr.style.backgroundColor = "";
    colorInput.value = "#ffffff";
  });

  const customerInput = tr.querySelector(".customer-input");
  const materialInput = tr.querySelector(".material-input");
  const finishInput = tr.querySelector(".finish-input");
  const materialList = tr.querySelector(`#${materialListId}`);
  const finishList = tr.querySelector(`#${finishListId}`);

  const refreshMaterialOptions = () => {
    const cust = customerInput.value.trim();
    const materials = customersToMaterials[cust] || new Set();
    fillDatalist(materialList, commaAwareOptions(materialInput.value, materials));
  };
  const refreshFinishOptions = () => {
    const cust = customerInput.value.trim();
    // Finish suggestions should be based on whichever material was typed
    // most recently (last comma-separated entry so far), since that's the
    // one the user is currently picking a finish for.
    const matParts = materialInput.value.split(",").map((p) => p.trim()).filter((p) => p !== "");
    const mat = matParts.length ? matParts[matParts.length - 1] : "";
    const finishes = comboToFinishes[comboKey(cust, mat)] || new Set();
    fillDatalist(finishList, commaAwareOptions(finishInput.value, finishes));
  };

  customerInput.addEventListener("input", () => {
    refreshMaterialOptions();
    refreshFinishOptions();
  });
  // Each field also needs to refresh its own suggestions as the user types
  // past a comma within it (that's what makes "already typed, next comma"
  // suggest the next remaining value instead of just filtering on the
  // whole string).
  materialInput.addEventListener("input", () => {
    refreshMaterialOptions();
    refreshFinishOptions();
  });
  finishInput.addEventListener("input", refreshFinishOptions);

  if (prefill) {
    customerInput.value = prefill.customer || "";
    materialInput.value = prefill.material || "";
    finishInput.value = prefill.finish || "";
    tr.querySelector(".address-input").value = prefill.address || "";
    tr.querySelector(".qty-input").value = prefill.qty || "";
    tr.querySelector(".remarks-input").value = prefill.remarks || "";
    // Setting .value programmatically doesn't fire "input" events, so the
    // cascading suggestion lists need to be refreshed by hand.
    refreshMaterialOptions();
    refreshFinishOptions();
  }

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
  if (!confirm("Clear everything typed into this sheet, including row colors?")) return;
  document.querySelectorAll("#sheetBody .cell-input").forEach((inp) => (inp.value = ""));
  document.querySelectorAll("#sheetBody .print-text").forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".signoff-input").forEach((inp) => (inp.value = ""));
  document.querySelectorAll("#sheetBody tr").forEach((tr) => {
    tr.style.backgroundColor = "";
    const colorInput = tr.querySelector(".color-input");
    if (colorInput) colorInput.value = "#ffffff";
  });
}

// Inputs render as a single line on screen (so the browser's own datalist
// autocomplete keeps working), but that means long text just scrolls
// sideways rather than wrapping — fine to edit, but it would get cut off
// on a printed page. Right before printing, copy each input's current
// value into a plain wrapped text element and show that instead; the print
// CSS swaps which one is visible.
function syncPrintText() {
  document.querySelectorAll("#sheetBody td").forEach((td) => {
    const input = td.querySelector(".cell-input");
    const printSpan = td.querySelector(".print-text");
    if (input && printSpan) printSpan.textContent = input.value;
  });
}

function setDefaultDate() {
  const el = document.getElementById("sheetDate");
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  el.value = `${y}-${m}-${d}`;
}

function populateRows(orders) {
  const tbody = document.getElementById("sheetBody");
  tbody.innerHTML = "";
  rowCount = 0;

  const dueTomorrow = ordersDueTomorrow(orders);
  dueTomorrow.forEach((o) => addRow(orderToPrefill(o)));

  const blankCount = dueTomorrow.length ? EXTRA_BLANK_ROWS : DEFAULT_ROWS;
  for (let i = 0; i < blankCount; i++) addRow();

  const note = document.getElementById("prefillNote");
  if (note) {
    note.textContent = dueTomorrow.length
      ? `📅 Pre-filled ${dueTomorrow.length} order${dueTomorrow.length === 1 ? "" : "s"} due tomorrow (${tomorrowKey()}) from the Delivery Planner, plus ${blankCount} blank row${blankCount === 1 ? "" : "s"} for anything else.`
      : `No active orders are due tomorrow (${tomorrowKey()}) yet, so the sheet starts blank.`;
  }
}

function loadOrdersAndPopulate() {
  return fetch(`orders.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((orders) => {
      buildLookups(orders);
      fillDatalist(document.getElementById("customerNames"), Object.keys(customersToMaterials));
      populateRows(orders);
    })
    .catch(() => {
      // Even if orders.json can't be loaded, the sheet should still work —
      // just without autocomplete suggestions or pre-filled rows.
      populateRows([]);
    });
}

function init() {
  setDefaultDate();
  loadOrdersAndPopulate();

  document.getElementById("addRowBtn").addEventListener("click", () => addRow());
  document.getElementById("removeRowBtn").addEventListener("click", removeRow);
  document.getElementById("clearSheetBtn").addEventListener("click", clearSheet);
  document.getElementById("refillBtn").addEventListener("click", () => {
    if (
      confirm(
        "Replace everything currently on the sheet with tomorrow's Delivery Planner orders (plus a few blank rows)?"
      )
    ) {
      loadOrdersAndPopulate();
    }
  });
  document.getElementById("printBtn").addEventListener("click", () => {
    syncPrintText();
    window.print();
  });
  // Also catch printing triggered via Ctrl/Cmd+P or the browser's own menu,
  // not just our button.
  window.addEventListener("beforeprint", syncPrintText);
}

document.addEventListener("DOMContentLoaded", init);
