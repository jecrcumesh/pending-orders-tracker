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

const STORAGE_KEY = "expectedDeliveryDates"; // legacy, browser-only dates from an earlier version
const GH_CONFIG_KEY = "ghConfig"; // { token, owner, repo, branch, path }

let rawData = [];
let ghConfig = null;
let ghLatestSha = null;
let ghBusy = false;
let unsavedChanges = false;
let filtered = [];
let sortState = { key: null, dir: 0 }; // dir: 1 asc, -1 desc, 0 none
let colFilters = {}; // key -> filter string/value
let globalQuery = "";
let currentPage = 1;
let pageSize = 25;

function loadDeliveryDates() {
  // Only used as a one-time fallback for dates set in an earlier version of
  // this app (before edits were saved to orders.json). Edits now always
  // commit straight to orders.json via GitHub.
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (e) {
    return {};
  }
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
    const err = new Error(body.message || `GitHub GET failed (${res.status})`);
    err.status = res.status;
    throw err;
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
    const err = new Error(body.message || `GitHub PUT failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// GitHub rejects a write whenever the file's real sha (on the server) no
// longer matches the sha we last read — i.e. something else changed the
// file in between our read and our write (another tab, another device, a
// save that landed a moment earlier). That check is exactly what stops a
// save from silently overwriting someone else's change, so we keep it —
// but instead of surfacing that as a failure, we transparently re-read the
// now-current file and retry the write with the fresh sha a few times
// before giving up. This is what "many times" failing on a 409 needs: the
// data itself was never at risk (GitHub always refused the wrong-sha
// write), it just needed a retry with the latest sha.
async function ghPutFileWithRetry(cfg, dataArray, message, onRetry) {
  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const latest = await ghFetchFile(cfg);
      const result = await ghPutFile(cfg, dataArray, message, latest.sha);
      return result;
    } catch (err) {
      lastErr = err;
      const isConflict = err.status === 409 || /does not match/i.test(err.message || "");
      if (!isConflict || attempt === maxAttempts) throw err;
      if (onRetry) onRetry(attempt, maxAttempts);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastErr;
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

const LAST_SAVED_KEY = "lastSavedSnapshot"; // shared with delivery-plan.js

function stashLastSavedSnapshot(rows) {
  try {
    localStorage.setItem(
      LAST_SAVED_KEY,
      JSON.stringify({ savedAt: Date.now(), rows })
    );
  } catch (e) {
    /* ignore quota errors */
  }
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
    const payload = rawData.map(cleanRowForSave);
    const result = await ghPutFileWithRetry(ghConfig, payload, message, (attempt, max) => {
      setSaveStatus(
        `Someone/something else saved a moment before you — retrying with the latest version (${attempt}/${max})…`,
        "info"
      );
    });
    ghLatestSha = result.content ? result.content.sha : null;
    // Remember exactly what we just saved. GitHub Pages can take up to a
    // couple of minutes to redeploy, so if this page (or the Delivery
    // Planner) is reloaded before that happens, the server would still
    // serve the OLD orders.json — this snapshot lets us show the correct,
    // just-saved data anyway instead of appearing to have "lost" it.
    stashLastSavedSnapshot(payload);
    setSaveStatus("Saved ✓ — committed to orders.json. Checking when it's live…", "success");
    watchForRedeploy(payload);
    return true;
  } catch (err) {
    const isConflict = err.status === 409 || /does not match/i.test(err.message || "");
    setSaveStatus(
      isConflict
        ? "Save failed after retrying: another save keeps landing at the same time. Click \"Save Changes\" again — your edits are still here, nothing was lost."
        : "Save failed: " + err.message,
      "error"
    );
    return false;
  } finally {
    ghBusy = false;
  }
}

let redeployWatchToken = 0;

// After a save, quietly re-check the live orders.json every few seconds
// until it matches what we just committed, then say so. This is what makes
// the refresh "as soon as it's saved" visible/confirmed, on top of the app
// already showing the new data instantly in this tab without any refresh.
async function watchForRedeploy(expectedRows) {
  const myToken = ++redeployWatchToken; // cancel any earlier in-flight watch
  const deadline = Date.now() + 2 * 60 * 1000; // give up after 2 minutes
  const expectedJson = JSON.stringify(expectedRows);

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (myToken !== redeployWatchToken) return; // a newer save superseded this watch

    try {
      const res = await fetch(`orders.json?t=${Date.now()}`, { cache: "no-store" });
      const liveData = await res.json();
      if (JSON.stringify(liveData) === expectedJson) {
        if (myToken === redeployWatchToken) {
          setSaveStatus("✅ Live — GitHub Pages has redeployed with your latest save.", "success");
        }
        return;
      }
    } catch (e) {
      // transient network hiccup — just try again on the next tick
    }
  }
}

/* ---------------- unsaved-changes / Save Changes button ---------------- */

function markDirty() {
  unsavedChanges = true;
  updateSaveChangesButton();
}

function updateSaveChangesButton() {
  const btn = document.getElementById("saveChangesBtn");
  if (!btn) return;
  btn.disabled = !unsavedChanges;
  btn.textContent = unsavedChanges ? "💾 Save Changes" : "✓ All changes saved";
  btn.classList.toggle("has-changes", unsavedChanges);
}

async function handleSaveChangesClick() {
  const btn = document.getElementById("saveChangesBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  const ok = await commitOrdersToGitHub(`Update orders — ${new Date().toLocaleString()}`);
  if (ok) {
    unsavedChanges = false;
  }
  updateSaveChangesButton();
}

window.addEventListener("beforeunload", (e) => {
  if (unsavedChanges) {
    e.preventDefault();
    e.returnValue = "";
  }
});

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

const SNAPSHOT_FRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function resolveInitialData(fetchedData) {
  let cache;
  try {
    cache = JSON.parse(localStorage.getItem(LAST_SAVED_KEY) || "null");
  } catch (e) {
    cache = null;
  }
  if (!cache || !Array.isArray(cache.rows)) return fetchedData;

  const isFresh = Date.now() - cache.savedAt < SNAPSHOT_FRESH_WINDOW_MS;
  const matches = JSON.stringify(cache.rows) === JSON.stringify(fetchedData);
  if (isFresh && !matches) {
    // We saved something recently, but the server is still returning the
    // older file — GitHub Pages hasn't finished redeploying yet. Show what
    // we know we just saved instead of appearing to have lost it.
    setSaveStatus(
      "Showing your last saved changes — GitHub Pages is still redeploying (usually under a minute). Refresh again shortly to confirm.",
      "info"
    );
    return cache.rows;
  }
  return fetchedData;
}

function init() {
  ghConfig = loadGhConfig();

  fetch(`orders.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((fetchedData) => {
      const data = resolveInitialData(fetchedData);
      const deliveryMap = loadDeliveryDates();
      // _id is an internal, never-saved row identifier used for edit/delete.
      // Sr. No. is NOT guaranteed unique in the source spreadsheet (a few
      // rows share the same Sr. No.), so it can't safely be used to look up
      // "the row" on its own — using Sr. No. for delete would risk removing
      // the wrong one of two duplicates.
      rawData = data.map((row, idx) => ({
        ...row,
        _id: "row-" + idx + "-" + Date.now(),
        "Expected Delivery Date": row["Expected Delivery Date"] || deliveryMap[row["Sr. No."]] || "",
      }));
      buildLegend();
      buildHeader();
      buildFilterRow();
      applyAll();
      wireGlobalControls();
      buildAddOrderForm();
      updateGhStatus();
      updateSaveChangesButton();
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

function deleteOrder(id) {
  if (!confirm("Remove this order from the list? Click \"Save Changes\" afterwards to make it permanent in orders.json.")) return;

  rawData = rawData.filter((r) => r._id !== id);
  markDirty();
  buildFilterRow();
  applyAll();
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
  row._id = "new-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const orderQty = parseFloat(row["Order Qty"]) || 0;
  const dispatchedQty = parseFloat(row["Dispatched Qty"]) || 0;
  row["Balance Qty"] = orderQty - dispatchedQty;
  row["% Dispatched"] = orderQty > 0 ? dispatchedQty / orderQty : 0;
  row["Days Since Order"] = daysSince(row["Order Date"]);

  // Add it locally and reflect it right away...
  rawData = rawData.concat([row]);
  markDirty();
  buildFilterRow();
  applyAll();

  // ...then try to save it to orders.json immediately, so clicking "Save"
  // here actually saves. If we're not signed in yet, this opens the GitHub
  // sign-in dialog instead (the new order stays in the list either way —
  // "💾 Save Changes" in the top bar remains available as a fallback).
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";
  const ok = await commitOrdersToGitHub(
    `Add order for ${row["Customer Name"]} (Sr. No. ${row["Sr. No."]})`
  );
  submitBtn.disabled = false;
  submitBtn.textContent = "Save";
  if (ok) {
    unsavedChanges = false;
    updateSaveChangesButton();
  }
  closeAddOrderModal();
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

/* ---------------- inline cell editing ---------------- */

function displayValue(col, row) {
  let val = row[col.key];
  if (col.key === "% Dispatched" && val !== "" && val !== undefined && val !== null) {
    val = (parseFloat(val) * 100).toFixed(1) + "%";
  }
  return val === "" || val === null || val === undefined ? "—" : val;
}

function renderCellStatic(td, row, col) {
  td.innerHTML = "";
  td.classList.remove("editing");
  const span = document.createElement("span");
  span.className = "cell-text";
  span.textContent = displayValue(col, row);
  td.title = String(row[col.key] ?? "");
  td.appendChild(span);
}

function buildFieldFor(col, currentVal) {
  let field;
  if (col.formType === "yesno") {
    field = document.createElement("select");
    field.innerHTML =
      '<option value=""></option><option value="Yes">Yes</option><option value="No">No</option>';
  } else if (col.formType === "status") {
    field = document.createElement("select");
    field.innerHTML = LEGEND.map(([s]) => `<option value="${s}">${s}</option>`).join("");
  } else if (col.formType === "unit") {
    field = document.createElement("input");
    field.type = "text";
    field.setAttribute("list", "unitOptions");
  } else if (col.formType === "number") {
    field = document.createElement("input");
    field.type = "number";
    field.step = "any";
  } else if (col.type === "date" || col.type === "editdate" || col.formType === "date") {
    field = document.createElement("input");
    field.type = "date";
  } else if (col.formType === "textarea") {
    field = document.createElement("textarea");
    field.rows = 2;
  } else {
    field = document.createElement("input");
    field.type = "text";
  }
  field.className = "cell-edit-input";
  field.value = currentVal ?? "";
  return field;
}

function makeEditableCell(td, row, col) {
  renderCellStatic(td, row, col);
  td.classList.add("editable-cell");
  td.title = (td.title ? td.title + " — " : "") + "Click to edit";
  td.addEventListener("click", () => startEditingCell(td, row, col));
}

function startEditingCell(td, row, col) {
  if (td.classList.contains("editing")) return;
  td.classList.add("editing");
  td.innerHTML = "";

  const currentVal = row[col.key] ?? "";
  const field = buildFieldFor(col, currentVal);
  td.appendChild(field);
  field.focus();
  if (field.select) field.select();

  let finished = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    renderCellStatic(td, row, col);
  };
  const commit = () => {
    if (finished) return;
    finished = true;
    saveCellEdit(row, col, field.value, td);
  };

  field.addEventListener("blur", commit);
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && field.tagName !== "TEXTAREA") {
      e.preventDefault();
      field.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      field.removeEventListener("blur", commit);
      cancel();
    }
  });
  if (field.tagName === "SELECT") {
    field.addEventListener("change", () => field.blur());
  }
}

function recomputeDependents(row, changedKey) {
  if (changedKey === "Order Qty" || changedKey === "Dispatched Qty") {
    const oq = parseFloat(row["Order Qty"]) || 0;
    const dq = parseFloat(row["Dispatched Qty"]) || 0;
    row["Balance Qty"] = oq - dq;
    row["% Dispatched"] = oq > 0 ? dq / oq : 0;
  }
  if (changedKey === "Order Date") {
    row["Days Since Order"] = daysSince(row["Order Date"]);
  }
}

function saveCellEdit(row, col, rawValue, td) {
  const previous = row[col.key];
  const newValue = typeof rawValue === "string" ? rawValue.trim() : rawValue;

  if (String(newValue) === String(previous ?? "")) {
    renderCellStatic(td, row, col);
    return;
  }

  if ((col.key === "Customer Name" || col.key === "Material Name") && !newValue) {
    alert(`${col.label} cannot be empty.`);
    renderCellStatic(td, row, col);
    return;
  }

  // Apply the edit locally and re-render immediately — this is what makes
  // the change show up right away. It is NOT written to orders.json yet;
  // click "Save Changes" in the top bar to commit everything at once.
  row[col.key] = newValue;
  recomputeDependents(row, col.key);
  markDirty();

  buildFilterRow();
  applyAll();
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
        del.addEventListener("click", () => deleteOrder(row._id));
        td.appendChild(del);
      } else if (col.computed) {
        renderCellStatic(td, row, col);
      } else {
        makeEditableCell(td, row, col);
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

  document.getElementById("saveChangesBtn").addEventListener("click", handleSaveChangesClick);
}

document.addEventListener("DOMContentLoaded", init);
