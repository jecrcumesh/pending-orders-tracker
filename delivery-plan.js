/* Delivery Planner
   Standalone page: shows active (non-Completed/Cancelled) orders whose
   Expected Delivery Date falls today, tomorrow, or the day after — grouped
   by day, so deliveries can be planned at a glance.
*/

const STORAGE_KEY = "expectedDeliveryDates";
const LAST_SAVED_KEY = "lastSavedSnapshot"; // written by app.js after a successful GitHub save
const SNAPSHOT_FRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const DISPLAY_COLUMNS = [
  { key: "Sr. No.", label: "Sr. No." },
  { key: "Customer Name", label: "Customer Name" },
  { key: "Material Name", label: "Material Name" },
  { key: "Finish / Surface", label: "Finish / Surface" },
  { key: "Order Qty", label: "Order Qty" },
  { key: "Unit", label: "Unit" },
  { key: "Balance Qty", label: "Balance Qty" },
  { key: "Order Status", label: "Order Status" },
  { key: "Contact Number", label: "Contact Number" },
  { key: "Remarks / Notes", label: "Remarks / Notes" },
];

const STATUS_CLASS = {
  "Pending": "status-pending",
  "In Process": "status-inprocess",
  "Ready": "status-ready",
  "On Hold": "status-onhold",
};

const INACTIVE_STATUSES = ["Completed", "Cancelled"];

function loadDeliveryDates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNice(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let planRows = []; // rows currently shown across all three buckets, for export

function resolveData(fetchedData) {
  let cache;
  try {
    cache = JSON.parse(localStorage.getItem(LAST_SAVED_KEY) || "null");
  } catch (e) {
    cache = null;
  }
  if (!cache || !Array.isArray(cache.rows)) return { data: fetchedData, usedCache: false };

  const isFresh = Date.now() - cache.savedAt < SNAPSHOT_FRESH_WINDOW_MS;
  const matches = JSON.stringify(cache.rows) === JSON.stringify(fetchedData);
  if (isFresh && !matches) {
    // A save happened recently (in this browser) but GitHub Pages hasn't
    // finished redeploying orders.json yet — use what was actually saved
    // instead of showing the older, still-live file.
    return { data: cache.rows, usedCache: true };
  }
  return { data: fetchedData, usedCache: false };
}

function loadOrders() {
  // Cache-bust so a stale, browser- or CDN-cached copy of orders.json
  // is never shown after a recent save.
  return fetch(`orders.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((fetchedData) => {
      const { data, usedCache } = resolveData(fetchedData);
      const deliveryMap = loadDeliveryDates();
      const rows = data.map((row) => ({
        ...row,
        "Expected Delivery Date": row["Expected Delivery Date"] || deliveryMap[row["Sr. No."]] || "",
      }));
      render(rows);
      setLoadedAt(usedCache);
    })
    .catch((err) => {
      document.getElementById("planGroups").innerHTML =
        `<p class="no-results">Failed to load orders.json — ${escapeHtml(err.message || err)}</p>`;
    });
}

function setLoadedAt(usedCache) {
  const el = document.getElementById("loadedAt");
  if (!el) return;
  el.textContent = usedCache
    ? "Showing your last saved changes (GitHub Pages still redeploying) — " + new Date().toLocaleTimeString()
    : "Data as of " + new Date().toLocaleTimeString();
}

function init() {
  loadOrders();
  wireControls();
}

function render(rows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = [0, 1, 2].map((offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return {
      key: toDateKey(d),
      label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : "Day After Tomorrow",
    };
  });

  const active = rows.filter((r) => !INACTIVE_STATUSES.includes(r["Order Status"]));

  planRows = [];
  const container = document.getElementById("planGroups");
  container.innerHTML = "";

  buckets.forEach((bucket) => {
    const bucketRows = active.filter((r) => r["Expected Delivery Date"] === bucket.key);
    planRows = planRows.concat(bucketRows);

    const section = document.createElement("section");
    section.className = "plan-group";

    const heading = document.createElement("h2");
    heading.className = "plan-group-heading";
    heading.innerHTML = `${bucket.label} <span class="plan-date">(${formatNice(bucket.key)})</span> <span class="plan-count">${bucketRows.length} order${bucketRows.length === 1 ? "" : "s"}</span>`;
    section.appendChild(heading);

    if (bucketRows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = "No deliveries scheduled.";
      section.appendChild(empty);
    } else {
      section.appendChild(buildTable(bucketRows));
    }

    container.appendChild(section);
  });
}

function buildTable(rows) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap plan-table-wrap";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  DISPLAY_COLUMNS.forEach((col) => {
    const th = document.createElement("th");
    th.innerHTML = `<div class="th-inner"><span>${col.label}</span></div>`;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = STATUS_CLASS[row["Order Status"]] || "status-blank";
    DISPLAY_COLUMNS.forEach((col) => {
      const td = document.createElement("td");
      const val = row[col.key];
      td.textContent = val === "" || val === null || val === undefined ? "—" : val;
      td.title = String(val ?? "");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function exportPlan() {
  if (typeof XLSX === "undefined") {
    alert("The Excel export library didn't load (check your internet connection) — please try again.");
    return;
  }
  if (!planRows.length) {
    alert("Nothing to export — no deliveries in the next 3 days.");
    return;
  }
  const allCols = DISPLAY_COLUMNS.concat([{ key: "Expected Delivery Date", label: "Expected Delivery Date" }]);
  const plainRows = planRows.map((row) => {
    const out = {};
    allCols.forEach((col) => {
      const v = row[col.key];
      out[col.label] = v === "" || v === null || v === undefined ? "" : v;
    });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(plainRows, { header: allCols.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Delivery Plan");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `delivery_plan_next3days_${stamp}.xlsx`);
}

function wireControls() {
  document.getElementById("exportPlanBtn").addEventListener("click", exportPlan);
  document.getElementById("refreshPlanBtn").addEventListener("click", () => loadOrders());
}

document.addEventListener("DOMContentLoaded", init);
