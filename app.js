/* Pending Orders Tracker
   Static, framework-free app. Loads orders.json, renders a sortable /
   filterable / paginated table with frozen columns and status color coding.
*/

const COLUMNS = [
  { key: "Order Date", label: "Order Date", type: "date", width: 100 },
  { key: "Sr. No.", label: "Sr. No.", type: "number", width: 70 },
  { key: "Customer Name", label: "Customer Name", type: "text", width: 170, frozen: true },
  { key: "Material Name", label: "Material Name", type: "text", width: 170, frozen: true },
  { key: "Finish / Surface", label: "Finish / Surface", type: "text", width: 140, frozen: true },
  { key: "Is New Customer", label: "Is New Customer", type: "select", width: 110 },
  { key: "Unit", label: "Unit", type: "select", width: 70 },
  { key: "Order Qty", label: "Order Qty", type: "number", width: 100 },
  { key: "Dispatched Qty", label: "Dispatched Qty", type: "number", width: 110 },
  { key: "Balance Qty", label: "Balance Qty", type: "number", width: 100 },
  { key: "% Dispatched", label: "% Dispatched", type: "number", width: 100 },
  { key: "Rate (per Unit)", label: "Rate (per Unit)", type: "number", width: 100 },
  { key: "Stock Yard Available", label: "Stock Yard Available", type: "select", width: 110 },
  { key: "To Be Ordered Qty", label: "To Be Ordered Qty", type: "number", width: 120 },
  { key: "Available Qty", label: "Available Qty", type: "number", width: 100 },
  { key: "Order Status", label: "Order Status", type: "select", width: 120 },
  { key: "Machine Processing Required", label: "Machine Processing Required", type: "select", width: 130 },
  { key: "Days Since Order", label: "Days Since Order", type: "number", width: 110 },
  { key: "Expected Delivery Date", label: "Expected Delivery Date", type: "editdate", width: 150 },
  { key: "Remarks / Notes", label: "Remarks / Notes", type: "text", width: 260, wrap: true },
  { key: "Contact Number", label: "Contact Number", type: "text", width: 150 },
];

const STATUS_CLASS = {
  "Pending": "status-pending",
  "In Process": "status-inprocess",
  "Ready": "status-ready",
  "On Hold": "status-onhold",
  "Completed": "status-completed",
  "Cancelled": "status-cancelled",
};

const LEGEND = [
  ["Pending", "var(--c-pending)"],
  ["In Process", "var(--c-inprocess)"],
  ["Ready", "var(--c-ready)"],
  ["On Hold", "var(--c-onhold)"],
  ["Completed", "var(--c-completed)"],
  ["Cancelled", "var(--c-cancelled)"],
];

const STORAGE_KEY = "expectedDeliveryDates";

let rawData = [];
let filtered = [];
let sortState = { key: null, dir: 0 }; // dir: 1 asc, -1 desc, 0 none
let colFilters = {}; // key -> filter string/value
let globalQuery = "";
let currentPage = 1;
let pageSize = 25;

function loadDeliveryDates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}
function saveDeliveryDates(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function init() {
  fetch("orders.json")
    .then((r) => r.json())
    .then((data) => {
      const deliveryMap = loadDeliveryDates();
      rawData = data.map((row) => ({
        ...row,
        "Expected Delivery Date": deliveryMap[row["Sr. No."]] || "",
      }));
      buildLegend();
      buildHeader();
      buildFilterRow();
      applyAll();
      wireGlobalControls();
    })
    .catch((err) => {
      document.getElementById("tableBody").innerHTML =
        '<tr><td class="no-results">Failed to load orders.json — ' + err + "</td></tr>";
    });
}

function buildLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = LEGEND.map(
    ([label, color]) =>
      `<span><span class="swatch" style="background:${color}"></span>${label}</span>`
  ).join("");
}

function frozenLeftOffset(index) {
  let left = 0;
  for (let i = 0; i < index; i++) {
    if (COLUMNS[i].frozen) left += COLUMNS[i].width;
  }
  return left;
}

function buildHeader() {
  const headerRow = document.getElementById("headerRow");
  headerRow.innerHTML = "";
  COLUMNS.forEach((col, i) => {
    const th = document.createElement("th");
    th.style.width = col.width + "px";
    th.style.minWidth = col.width + "px";
    if (col.frozen) {
      th.classList.add("frozen");
      th.style.left = frozenLeftOffset(i) + "px";
    }
    const inner = document.createElement("div");
    inner.className = "th-inner";
    inner.innerHTML = `<span>${col.label}</span><span class="sort-arrow" data-key="${col.key}">⇅</span>`;
    inner.addEventListener("click", () => onSortClick(col.key));
    th.appendChild(inner);
    headerRow.appendChild(th);
  });
}

function uniqueValues(key) {
  const set = new Set();
  rawData.forEach((r) => {
    const v = r[key];
    if (v !== "" && v !== null && v !== undefined) set.add(String(v));
  });
  return Array.from(set).sort();
}

function buildFilterRow() {
  const filterRow = document.getElementById("filterRow");
  filterRow.innerHTML = "";
  COLUMNS.forEach((col, i) => {
    const th = document.createElement("th");
    th.style.width = col.width + "px";
    th.style.minWidth = col.width + "px";
    if (col.frozen) {
      th.classList.add("frozen");
      th.style.left = frozenLeftOffset(i) + "px";
    }
    if (col.type === "select") {
      const sel = document.createElement("select");
      sel.innerHTML =
        '<option value="">All</option>' +
        uniqueValues(col.key)
          .map((v) => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`)
          .join("");
      sel.addEventListener("change", (e) => {
        colFilters[col.key] = e.target.value;
        currentPage = 1;
        applyAll();
      });
      th.appendChild(sel);
    } else if (col.key !== "Expected Delivery Date" || true) {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "Filter…";
      inp.addEventListener("input", (e) => {
        colFilters[col.key] = e.target.value;
        currentPage = 1;
        applyAll();
      });
      th.appendChild(inp);
    }
    filterRow.appendChild(th);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function onSortClick(key) {
  if (sortState.key !== key) {
    sortState = { key, dir: 1 };
  } else if (sortState.dir === 1) {
    sortState.dir = -1;
  } else if (sortState.dir === -1) {
    sortState = { key: null, dir: 0 };
  }
  document.querySelectorAll(".sort-arrow").forEach((el) => {
    el.classList.remove("active");
    el.textContent = "⇅";
  });
  if (sortState.key) {
    const el = document.querySelector(`.sort-arrow[data-key="${cssEscape(sortState.key)}"]`);
    if (el) {
      el.classList.add("active");
      el.textContent = sortState.dir === 1 ? "▲" : "▼";
    }
  }
  applyAll();
}

function cssEscape(s) {
  return s.replace(/"/g, '\\"');
}

function compareValues(a, b, type) {
  if (a === "" && b === "") return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  if (type === "number") {
    return parseFloat(a) - parseFloat(b);
  }
  if (type === "date" || type === "editdate") {
    return new Date(a) - new Date(b);
  }
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

function applyAll() {
  const q = globalQuery.trim().toLowerCase();

  filtered = rawData.filter((row) => {
    for (const col of COLUMNS) {
      const fv = colFilters[col.key];
      if (!fv) continue;
      const cellVal = String(row[col.key] ?? "");
      if (col.type === "select") {
        if (cellVal !== fv) return false;
      } else {
        if (!cellVal.toLowerCase().includes(fv.toLowerCase())) return false;
      }
    }
    if (q) {
      const hit = COLUMNS.some((col) =>
        String(row[col.key] ?? "").toLowerCase().includes(q)
      );
      if (!hit) return false;
    }
    return true;
  });

  if (sortState.key) {
    const col = COLUMNS.find((c) => c.key === sortState.key);
    filtered.sort(
      (a, b) => sortState.dir * compareValues(a[sortState.key], b[sortState.key], col.type)
    );
  }

  currentPage = Math.min(currentPage, Math.max(1, totalPages()));
  renderBody();
  renderPagination();
  updateRowCount();
}

function totalPages() {
  if (pageSize === "all") return 1;
  return Math.max(1, Math.ceil(filtered.length / pageSize));
}

function statusClass(status) {
  return STATUS_CLASS[status] || "status-blank";
}

function renderBody() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td class="no-results" colspan="${COLUMNS.length}">No matching orders.</td></tr>`;
    return;
  }

  let pageRows;
  if (pageSize === "all") {
    pageRows = filtered;
  } else {
    const start = (currentPage - 1) * pageSize;
    pageRows = filtered.slice(start, start + pageSize);
  }

  const frag = document.createDocumentFragment();
  pageRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = statusClass(row["Order Status"]);
    COLUMNS.forEach((col, i) => {
      const td = document.createElement("td");
      if (col.frozen) {
        td.classList.add("frozen");
        td.style.left = frozenLeftOffset(i) + "px";
      }
      if (col.wrap) td.classList.add("wrap-cell");

      if (col.key === "Expected Delivery Date") {
        const input = document.createElement("input");
        input.type = "date";
        input.className = "edit-date";
        input.value = row[col.key] || "";
        input.addEventListener("change", (e) => {
          row[col.key] = e.target.value;
          const map = loadDeliveryDates();
          map[row["Sr. No."]] = e.target.value;
          saveDeliveryDates(map);
        });
        td.appendChild(input);
      } else {
        let val = row[col.key];
        if (col.type === "number" && col.key === "% Dispatched" && val !== "") {
          val = (parseFloat(val) * 100).toFixed(1) + "%";
        }
        td.textContent = val === "" || val === null || val === undefined ? "—" : val;
        td.title = String(val ?? "");
      }
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

function renderPagination() {
  const tp = totalPages();
  document.getElementById("pageInfo").textContent =
    pageSize === "all" ? `All ${filtered.length} rows` : `Page ${currentPage} of ${tp}`;
  document.getElementById("firstPage").disabled = currentPage <= 1 || pageSize === "all";
  document.getElementById("prevPage").disabled = currentPage <= 1 || pageSize === "all";
  document.getElementById("nextPage").disabled = currentPage >= tp || pageSize === "all";
  document.getElementById("lastPage").disabled = currentPage >= tp || pageSize === "all";
}

function updateRowCount() {
  document.getElementById("rowCount").textContent =
    `${filtered.length} of ${rawData.length} orders`;
}

function wireGlobalControls() {
  document.getElementById("globalSearch").addEventListener("input", (e) => {
    globalQuery = e.target.value;
    currentPage = 1;
    applyAll();
  });

  document.getElementById("clearFilters").addEventListener("click", () => {
    colFilters = {};
    globalQuery = "";
    sortState = { key: null, dir: 0 };
    document.getElementById("globalSearch").value = "";
    buildFilterRow();
    document.querySelectorAll(".sort-arrow").forEach((el) => {
      el.classList.remove("active");
      el.textContent = "⇅";
    });
    currentPage = 1;
    applyAll();
  });

  document.getElementById("pageSize").addEventListener("change", (e) => {
    pageSize = e.target.value === "all" ? "all" : parseInt(e.target.value, 10);
    currentPage = 1;
    applyAll();
  });

  document.getElementById("firstPage").addEventListener("click", () => {
    currentPage = 1;
    applyAll();
  });
  document.getElementById("prevPage").addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    applyAll();
  });
  document.getElementById("nextPage").addEventListener("click", () => {
    currentPage = Math.min(totalPages(), currentPage + 1);
    applyAll();
  });
  document.getElementById("lastPage").addEventListener("click", () => {
    currentPage = totalPages();
    applyAll();
  });
}

document.addEventListener("DOMContentLoaded", init);
