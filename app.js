/* Pending Orders Tracker
   Static, framework-free app. Loads orders.json, renders a sortable /
   filterable / paginated table with frozen columns and status color coding.
*/

const COLUMNS = [
  { key: "Sr. No.", label: "Sr. No.", type: "number", width: 70, computed: true },
  { key: "Order Date", label: "Order Date", type: "date", width: 110 },
  { key: "Customer Name", label: "Customer Name", type: "text", width: 170, frozen: true },
  { key: "Material Name", label: "Material Name", type: "text", width: 170, frozen: true },
  { key: "Finish / Surface", label: "Finish / Surface", type: "text", width: 140, frozen: true },
  { key: "Is New Customer", label: "Is New Customer", type: "select", width: 110, formType: "yesno" },
  { key: "Unit", label: "Unit", type: "select", width: 70, formType: "unit" },
  { key: "Order Qty", label: "Order Qty", type: "number", width: 100, formType: "number" },
  { key: "Dispatched Qty", label: "Dispatched Qty", type: "number", width: 110, formType: "number" },
  { key: "Balance Qty", label: "Balance Qty", type: "number", width: 100, computed: true },
  { key: "% Dispatched", label: "% Dispatched", type: "number", width: 100, computed: true },
  { key: "Rate (per Unit)", label: "Rate (per Unit)", type: "number", width: 100, formType: "number" },
  { key: "Stock Yard Available", label: "Stock Yard Available", type: "select", width: 110, formType: "yesno" },
  { key: "To Be Ordered Qty", label: "To Be Ordered Qty", type: "number", width: 120, formType: "number" },
  { key: "Available Qty", label: "Available Qty", type: "number", width: 100, formType: "number" },
  { key: "Order Status", label: "Order Status", type: "select", width: 120, formType: "status" },
  { key: "Machine Processing Required", label: "Machine Processing Required", type: "select", width: 130, formType: "yesno" },
  { key: "Days Since Order", label: "Days Since Order", type: "number", width: 110, computed: true },
  { key: "Expected Delivery Date", label: "Expected Delivery Date", type: "editdate", width: 150, formType: "date" },
  { key: "Remarks / Notes", label: "Remarks / Notes", type: "text", width: 260, wrap: true, formType: "textarea" },
  { key: "Contact Number", label: "Contact Number", type: "text", width: 150, formType: "text" },
  { key: "_actions", label: "Actions", type: "actions", width: 70 },
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
const GH_CONFIG_KEY = "ghConfig"; // { token, owner, repo, branch, path }

let rawData = [];
let ghConfig = null;
let ghLatestSha = null;
let ghBusy = false;
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

/* ---------------- GitHub login / persistence ---------------- */

function loadGhConfig() {
  try {
    return JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || "null");
  } catch (e) {
    return null;
  }
}
function saveGhConfig(cfg) {
  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
}
function clearGhConfig() {
  localStorage.removeItem(GH_CONFIG_KEY);
}

function b64EncodeUtf8(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}
function b64DecodeUtf8(str) {
  return decodeURIComponent(
    atob(str.replace(/\n/g, ""))
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function ghContentsUrl(cfg) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    cfg.path
  ).replace(/%2F/g, "/")}?ref=${encodeURIComponent(cfg.branch)}`;
}

async function ghFetchFile(cfg) {
  const res = await fetch(ghContentsUrl(cfg), {
    headers: {
      Authorization: `token ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub GET failed (${res.status})`);
  }
  const json = await res.json();
  return { sha: json.sha, data: JSON.parse(b64DecodeUtf8(json.content)) };
}

async function ghPutFile(cfg, dataArray, message, sha) {
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
      cfg.path
    ).replace(/%2F/g, "/")}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: b64EncodeUtf8(JSON.stringify(dataArray, null, 1)),
        sha,
        branch: cfg.branch,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub PUT failed (${res.status})`);
  }
  return res.json();
}

function isConnected() {
  return !!(ghConfig && ghConfig.token && ghConfig.owner && ghConfig.repo);
}

function updateGhStatus() {
  const el = document.getElementById("ghStatus");
  const connectBtn = document.getElementById("connectGithubBtn");
  if (isConnected()) {
    el.textContent = `🟢 Connected to ${ghConfig.owner}/${ghConfig.repo}`;
    connectBtn.textContent = "GitHub settings";
  } else {
    el.textContent = "⚪ Not connected — sign in to save changes";
    connectBtn.textContent = "Sign in with GitHub token";
  }
}

function cleanRowForSave(row) {
  const out = {};
  COLUMNS.filter((c) => c.type !== "actions").forEach((col) => {
    let v = row[col.key];
    if (v === undefined || v === null) v = "";
    if (col.type === "number" && v !== "" && !isNaN(parseFloat(v))) {
      v = parseFloat(v);
    }
    out[col.key] = v;
  });
  return out;
}

async function commitOrdersToGitHub(message) {
  if (!isConnected()) {
    openConnectModal();
    return false;
  }
  if (ghBusy) return false;
  ghBusy = true;
  setSaveStatus("Saving to GitHub…", "info");
  try {
    // Always fetch the latest sha right before writing to avoid 409 conflicts.
    const latest = await ghFetchFile(ghConfig);
    ghLatestSha = latest.sha;
    const payload = rawData.map(cleanRowForSave);
    const result = await ghPutFile(ghConfig, payload, message, ghLatestSha);
    ghLatestSha = result.content ? result.content.sha : null;
    setSaveStatus("Saved to orders.json ✓ (GitHub Pages will redeploy shortly)", "success");
    return true;
  } catch (err) {
    setSaveStatus("Save failed: " + err.message, "error");
    return false;
  } finally {
    ghBusy = false;
  }
}

function setSaveStatus(text, kind) {
  // Update every status element on the page (topbar + any open modal) so the
  // message is visible no matter what's currently in front.
  document.querySelectorAll(".save-status").forEach((el) => {
    el.textContent = text;
    el.className = "save-status " + (kind || "");
  });
  if (kind === "success") {
    clearTimeout(setSaveStatus._t);
    setSaveStatus._t = setTimeout(() => {
      document.querySelectorAll(".save-status").forEach((el) => {
        el.textContent = "";
        el.className = "save-status";
      });
    }, 6000);
  }
}

function openConnectModal() {
  const form = document.getElementById("connectForm");
  if (ghConfig) {
    form.owner.value = ghConfig.owner || "";
    form.repo.value = ghConfig.repo || "";
    form.branch.value = ghConfig.branch || "main";
    form.path.value = ghConfig.path || "orders.json";
    form.token.value = "";
  } else {
    form.reset();
    form.branch.value = "main";
    form.path.value = "orders.json";
  }
  document.getElementById("disconnectGithub").style.display = ghConfig ? "inline-block" : "none";
  document.getElementById("connectModal").classList.add("open");
}
function closeConnectModal() {
  document.getElementById("connectModal").classList.remove("open");
}

async function handleConnectSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const cfg = {
    token: form.token.value.trim(),
    owner: form.owner.value.trim(),
    repo: form.repo.value.trim(),
    branch: form.branch.value.trim() || "main",
    path: form.path.value.trim() || "orders.json",
  };
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    alert("Token, repository owner, and repository name are required.");
    return;
  }
  setSaveStatus("Checking access…", "info");
  try {
    const latest = await ghFetchFile(cfg);
    ghLatestSha = latest.sha;
    ghConfig = cfg;
    saveGhConfig(cfg);
    updateGhStatus();
    setSaveStatus("Connected ✓", "success");
    closeConnectModal();
  } catch (err) {
    setSaveStatus("", "");
    alert("Could not access that file with this token: " + err.message);
  }
}

function handleDisconnect() {
  ghConfig = null;
  ghLatestSha = null;
  clearGhConfig();
  updateGhStatus();
  closeConnectModal();
}

/* ---------------- init ---------------- */

function init() {
  ghConfig = loadGhConfig();

  fetch("orders.json")
    .then((r) => r.json())
    .then((data) => {
      const deliveryMap = loadDeliveryDates();
      rawData = data.map((row) => ({
        ...row,
        "Expected Delivery Date": row["Expected Delivery Date"] || deliveryMap[row["Sr. No."]] || "",
      }));
      buildLegend();
      buildHeader();
      buildFilterRow();
      applyAll();
      wireGlobalControls();
      buildAddOrderForm();
      updateGhStatus();
    })
    .catch((err) => {
      document.getElementById("tableBody").innerHTML =
        '<tr><td class="no-results">Failed to load orders.json — ' + err + "</td></tr>";
    });
}

function nextSrNo() {
  let max = 0;
  rawData.forEach((r) => {
    const n = parseFloat(r["Sr. No."]);
    if (!isNaN(n) && n > max) max = n;
  });
  return Math.floor(max) + 1;
}

function daysSince(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  return diff < 0 ? 0 : diff;
}

async function deleteOrder(srNo) {
  if (!isConnected()) {
    alert("Sign in with your GitHub token first so the deletion can be saved to orders.json.");
    openConnectModal();
    return;
  }
  if (!confirm("Delete this order from orders.json? This cannot be undone.")) return;

  const backup = rawData;
  rawData = rawData.filter((r) => r["Sr. No."] !== srNo);
  buildFilterRow();
  applyAll();

  const ok = await commitOrdersToGitHub(`Delete order Sr. No. ${srNo}`);
  if (!ok) {
    rawData = backup; // revert on failure
    buildFilterRow();
    applyAll();
  }
}

function buildAddOrderForm() {
  const formFields = document.getElementById("addOrderFields");
  formFields.innerHTML = "";
  COLUMNS.filter((c) => !c.computed && c.type !== "actions").forEach((col) => {
    const wrap = document.createElement("label");
    wrap.className = "form-field" + (col.formType === "textarea" ? " form-field-wide" : "");
    wrap.textContent = col.label;
    let field;
    if (col.formType === "yesno") {
      field = document.createElement("select");
      field.innerHTML = '<option value=""></option><option value="Yes">Yes</option><option value="No">No</option>';
    } else if (col.formType === "status") {
      field = document.createElement("select");
      field.innerHTML =
        '<option value=""></option>' +
        LEGEND.map(([s]) => `<option value="${s}">${s}</option>`).join("");
    } else if (col.formType === "unit") {
      field = document.createElement("input");
      field.setAttribute("list", "unitOptions");
      field.type = "text";
    } else if (col.formType === "number") {
      field = document.createElement("input");
      field.type = "number";
      field.step = "any";
    } else if (col.type === "date" || col.formType === "date") {
      field = document.createElement("input");
      field.type = "date";
    } else if (col.formType === "textarea") {
      field = document.createElement("textarea");
      field.rows = 2;
    } else {
      field = document.createElement("input");
      field.type = "text";
    }
    field.name = col.key;
    wrap.appendChild(field);
    formFields.appendChild(wrap);
  });

  const unitList = document.getElementById("unitOptions");
  unitList.innerHTML = uniqueValues("Unit")
    .map((v) => `<option value="${escapeAttr(v)}"></option>`)
    .join("");
}

function openAddOrderModal() {
  document.getElementById("addOrderForm").reset();
  document.getElementById("addOrderModal").classList.add("open");
}
function closeAddOrderModal() {
  document.getElementById("addOrderModal").classList.remove("open");
}

async function handleAddOrderSubmit(e) {
  e.preventDefault();

  if (!isConnected()) {
    alert("Sign in with your GitHub token first so the new order can be saved to orders.json.");
    openConnectModal();
    return;
  }

  const form = e.target;
  const fd = new FormData(form);
  const row = {};
  COLUMNS.filter((c) => !c.computed && c.type !== "actions").forEach((col) => {
    row[col.key] = (fd.get(col.key) || "").toString().trim();
  });

  if (!row["Customer Name"] || !row["Material Name"]) {
    alert("Customer Name and Material Name are required.");
    return;
  }

  row["Sr. No."] = nextSrNo();
  const orderQty = parseFloat(row["Order Qty"]) || 0;
  const dispatchedQty = parseFloat(row["Dispatched Qty"]) || 0;
  row["Balance Qty"] = orderQty - dispatchedQty;
  row["% Dispatched"] = orderQty > 0 ? dispatchedQty / orderQty : 0;
  row["Days Since Order"] = daysSince(row["Order Date"]);

  const backup = rawData;
  rawData = rawData.concat([row]);

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";
  try {
    const ok = await commitOrdersToGitHub(
      `Add order for ${row["Customer Name"]} (Sr. No. ${row["Sr. No."]})`
    );
    if (ok) {
      closeAddOrderModal();
      buildFilterRow();
      applyAll();
    } else {
      rawData = backup; // revert on failure, keep modal open so user can retry
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save to orders.json";
  }
}

/* ---------------- export to Excel ---------------- */

function exportToExcel(rows, filenameBase) {
  if (typeof XLSX === "undefined") {
    alert("The Excel export library didn't load (check your internet connection) — please try again.");
    return;
  }
  if (!rows.length) {
    alert("Nothing to export.");
    return;
  }
  const exportCols = COLUMNS.filter((c) => c.type !== "actions");
  const plainRows = rows.map((row) => {
    const out = {};
    exportCols.forEach((col) => {
      let v = row[col.key];
      if (v === undefined || v === null) v = "";
      if (col.key === "% Dispatched" && v !== "") {
        v = (parseFloat(v) * 100).toFixed(1) + "%";
      }
      out[col.label] = v;
    });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(plainRows, {
    header: exportCols.map((c) => c.label),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenameBase}_${stamp}.xlsx`);
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
    if (col.type === "actions") {
      inner.innerHTML = `<span>${col.label}</span>`;
    } else {
      inner.innerHTML = `<span>${col.label}</span><span class="sort-arrow" data-key="${col.key}">⇅</span>`;
      inner.addEventListener("click", () => onSortClick(col.key));
      inner.style.cursor = "pointer";
    }
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
    if (col.type === "actions") {
      // no filter control for the actions column
    } else if (col.type === "select") {
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
    } else {
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

      if (col.type === "actions") {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "row-delete";
        del.title = "Delete this order";
        del.textContent = "🗑";
        del.addEventListener("click", () => deleteOrder(row["Sr. No."]));
        td.appendChild(del);
      } else if (col.key === "Expected Delivery Date") {
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

  document.getElementById("addOrderBtn").addEventListener("click", openAddOrderModal);
  document.getElementById("closeAddOrderModal").addEventListener("click", closeAddOrderModal);
  document.getElementById("cancelAddOrder").addEventListener("click", closeAddOrderModal);
  document.getElementById("addOrderModal").addEventListener("click", (e) => {
    if (e.target.id === "addOrderModal") closeAddOrderModal();
  });
  document.getElementById("addOrderForm").addEventListener("submit", handleAddOrderSubmit);

  document.getElementById("connectGithubBtn").addEventListener("click", openConnectModal);
  document.getElementById("closeConnectModal").addEventListener("click", closeConnectModal);
  document.getElementById("cancelConnect").addEventListener("click", closeConnectModal);
  document.getElementById("connectModal").addEventListener("click", (e) => {
    if (e.target.id === "connectModal") closeConnectModal();
  });
  document.getElementById("connectForm").addEventListener("submit", handleConnectSubmit);
  document.getElementById("disconnectGithub").addEventListener("click", handleDisconnect);

  document.getElementById("exportAllBtn").addEventListener("click", () => {
    exportToExcel(rawData, "orders_all");
  });
  document.getElementById("exportFilteredBtn").addEventListener("click", () => {
    exportToExcel(filtered, "orders_filtered");
  });
}

document.addEventListener("DOMContentLoaded", init);
