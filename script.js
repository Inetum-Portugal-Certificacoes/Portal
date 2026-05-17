// Capture URL params before any IIFE clears them via history.replaceState
const _initSearch = window.location.search;
if (_initSearch) history.replaceState(null, "", window.location.pathname);

const SUPABASE_URL = "https://tkguljltsuxwftmnbavo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrZ3Vsamx0c3V4d2Z0bW5iYXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NDQzMTgsImV4cCI6MjA5NDQyMDMxOH0.RxemxZ9TN39hmxSqwWNEl8oVf4tZSuKZvqctHW6PwWA";

const SITE_OPTIONS = ["Lisboa", "Porto", "Braganca", "Covilha", "Brasil"];
const COLUMN_KEYS = ["equipa", "email", "codigo_certificacao", "nome_certificacao", "site", "data_certificacao", "data_expiracao", "externo", "status_cert", "saiu", "acoes"];
const COLUMN_LABELS = {
  equipa: "Equipa",
  email: "Email",
  codigo_certificacao: "Codigo",
  nome_certificacao: "Certificacao",
  site: "Site",
  data_certificacao: "Data Certificacao",
  data_expiracao: "Válida até",
  externo: "Externo",
  status_cert: "Status",
  saiu: "Saiu",
  acoes: "Acoes"
};

let stayRows = [];
let displayedRows = [];
let editMode = false;
let newRowDraft = null;
let stayDirtySet = new Set(); // "equipa::email::codigo_certificacao" keys of rows with unsaved edits
let _savedVisibleColumns = null;
let sortState = { key: "email", direction: "asc" };
const HIDDEN_BY_DEFAULT = new Set(["site", "data_certificacao", "externo", "saiu", "acoes"]);
let visibleColumns = Object.fromEntries(COLUMN_KEYS.map((k) => [k, !HIDDEN_BY_DEFAULT.has(k)]));
let filterState = {
  equipa: "",
  email: "",
  codigo_certificacao: "",
  nome_certificacao: "",
  site: "",
  data_certificacao: "",
  data_expiracao: "",
  externo: "",
  status_cert: "",
  saiu: ""
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function calcExpirado(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toISOString().slice(0, 10));
}
function rowStateLabel(row) { return row.expirado ? "Expirado" : "Ativo"; }
function externoLabel(row) { return row.externo ? "Sim" : ""; }
function saiuLabel(row) { return row.saiu ? "Sim" : ""; }
function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", ...extra };
}

async function loadStayCertifiedTable() {
  const tbody = document.getElementById("stayTableBody");
  if (!tbody) return;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/stay_certified` +
      "?select=equipa,email,codigo_certificacao,nome_certificacao,site,data_expiracao,expirado,data_certificacao,externo,saiu" +
      "&order=data_expiracao.asc&limit=1000";
    const res = await fetch(url, { headers: supabaseHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stayRows = await res.json();
    buildStayDataLists(stayRows);
    renderTeamTiles(stayRows);
    renderStayTable();
  } catch (err) {
    tbody.innerHTML = "<tr><td colspan=\"9\">Erro a carregar dados do Supabase.</td></tr>";
    console.error(err);
  }
}

function normalizeSortValue(value, key, row) {
  if (key === "externo" || key === "saiu") return value ? 1 : 0;
  if (key === "data_expiracao" || key === "data_certificacao") return value ? new Date(value).getTime() : 0;
  if (key === "status_cert") return calcExpirado(row?.data_expiracao) ? 1 : 0;
  return String(value ?? "").toLowerCase();
}
function applyFilters(rows) {
  return rows.filter((row) =>
    Object.entries(filterState).every(([key, value]) => {
      const needle = String(value || "").trim().toLowerCase();
      if (!needle) return true;
      let haystack;
      if (key === "externo") haystack = externoLabel(row).toLowerCase();
      else if (key === "saiu") haystack = saiuLabel(row).toLowerCase();
      else if (key === "status_cert") haystack = (row.expirado === true || row.expirado === 'X') ? "expirado" : "válido";
      else haystack = String(row[key] ?? "").toLowerCase();
      return haystack.includes(needle);
    })
  );
}
function getViewRows() {
  const rows = applyFilters([...stayRows]);
  const { key, direction } = sortState;
  rows.sort((a, b) => {
    const va = normalizeSortValue(a[key], key, a);
    const vb = normalizeSortValue(b[key], key, b);
    if (va < vb) return direction === "asc" ? -1 : 1;
    if (va > vb) return direction === "asc" ? 1 : -1;
    return 0;
  });
  return rows;
}

function attachAutocomplete(input, suggestions) {
  let dropdown = null;

  function showDropdown(items) {
    removeDropdown();
    if (!items.length) return;
    dropdown = document.createElement("ul");
    dropdown.className = "ac-dropdown";
    items.slice(0, 25).forEach(item => {
      const li = document.createElement("li");
      li.className = "ac-option";
      li.textContent = item;
      li.addEventListener("mousedown", e => {
        e.preventDefault();
        input.value = item;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        removeDropdown();
      });
      dropdown.appendChild(li);
    });
    const wrap = input.closest("th") || input.parentNode;
    wrap.style.position = "relative";
    wrap.appendChild(dropdown);
  }

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  input.addEventListener("focus", () => {
    const val = input.value.toLowerCase();
    const matches = val ? suggestions.filter(s => s.toLowerCase().includes(val)) : suggestions.slice(0, 25);
    showDropdown(matches);
  });

  input.addEventListener("input", () => {
    const val = input.value.toLowerCase();
    const matches = val ? suggestions.filter(s => s.toLowerCase().includes(val)) : suggestions.slice(0, 25);
    showDropdown(matches);
  });

  input.addEventListener("blur", () => setTimeout(removeDropdown, 150));

  input.addEventListener("keydown", e => {
    if (!dropdown) return;
    const items = [...dropdown.querySelectorAll(".ac-option")];
    const active = dropdown.querySelector(".ac-option.ac-active");
    let idx = items.indexOf(active);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (active) active.classList.remove("ac-active");
      items[(idx + 1) % items.length].classList.add("ac-active");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (active) active.classList.remove("ac-active");
      items[(idx - 1 + items.length) % items.length].classList.add("ac-active");
    } else if (e.key === "Enter" && active) {
      e.preventDefault();
      input.value = active.textContent;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      removeDropdown();
    } else if (e.key === "Escape") {
      removeDropdown();
    }
  });
}

function applyDatePickers(container) {
  if (!window.flatpickr) return;
  container.querySelectorAll("input.fp-date").forEach(inp => {
    if (inp._flatpickr) return;
    flatpickr(inp, {
      dateFormat: "Y-m-d",
      allowInput: true,
      disableMobile: true,
      locale: { firstDayOfWeek: 1 },
      onChange: () => inp.dispatchEvent(new Event("change", { bubbles: true })),
    });
  });
}

function buildStayDataLists(rows) {
  Object.keys(filterState).forEach(field => {
    const unique = [...new Set(rows.map(r => String(r[field] ?? "")).filter(Boolean))].sort();
    const input = document.querySelector(`.filter-row [data-filter="${field}"]`);
    if (input) attachAutocomplete(input, unique);
  });
}

function renderStayTable() {
  const tbody = document.getElementById("stayTableBody");
  if (!tbody) return;
  displayedRows = getViewRows();
  if (!displayedRows.length && !newRowDraft) {
    tbody.innerHTML = "<tr><td colspan=\"11\">Sem registos.</td></tr>";
    updateTotals();
    return;
  }

  const rowsHtml = displayedRows.map((r, idx) => {
    const statusBadge = (r.expirado === true || r.expirado === 'X')
      ? '<span class="badge danger">Expirado</span>'
      : '<span class="badge ok">Válido</span>';
    if (!editMode) {
      return `<tr>
        <td class="col-equipa">${escapeHtml(r.equipa)}</td>
        <td class="col-email">${escapeHtml(r.email)}</td>
        <td class="col-codigo_certificacao">${escapeHtml(r.codigo_certificacao)}</td>
        <td class="col-nome_certificacao">${escapeHtml(r.nome_certificacao)}</td>
        <td class="col-site">${escapeHtml(r.site)}</td>
        <td class="col-data_certificacao">${escapeHtml(r.data_certificacao)}</td>
        <td class="col-data_expiracao">${escapeHtml(r.data_expiracao)}</td>
        <td class="col-externo">${r.externo ? '<span class="badge ok">Sim</span>' : ""}</td>
        <td class="col-status_cert">${statusBadge}</td>
        <td class="col-saiu">${r.saiu ? '<span class="badge danger">Sim</span>' : ""}</td>
        <td class="col-acoes">-</td>
      </tr>`;
    }
    const isExp = r.expirado === true || r.expirado === 'X';
    const isDirty = stayDirtySet.has(`${r.equipa}::${r.email}::${r.codigo_certificacao}`);
    return `<tr${isDirty ? ' class="row-dirty"' : ''}>
      <td class="col-equipa">${escapeHtml(r.equipa)}</td>
      <td class="col-email">${escapeHtml(r.email)}</td>
      <td class="col-codigo_certificacao">${escapeHtml(r.codigo_certificacao)}</td>
      <td class="col-nome_certificacao"><input data-field="nome_certificacao" data-idx="${idx}" value="${escapeHtml(r.nome_certificacao)}" /></td>
      <td class="col-site"><select data-field="site" data-idx="${idx}">${SITE_OPTIONS.map((s) => `<option value="${s}" ${r.site === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td class="col-data_certificacao"><input class="fp-date" data-field="data_certificacao" data-idx="${idx}" type="text" value="${escapeHtml(r.data_certificacao ?? '')}" placeholder="AAAA-MM-DD" /></td>
      <td class="col-data_expiracao"><input class="fp-date" data-field="data_expiracao" data-idx="${idx}" type="text" value="${escapeHtml(r.data_expiracao ?? '')}" placeholder="AAAA-MM-DD" /></td>
      <td class="col-externo"><select data-field="externo" data-idx="${idx}"><option value="" ${!r.externo ? "selected" : ""}> </option><option value="Sim" ${r.externo ? "selected" : ""}>Sim</option></select></td>
      <td class="col-status_cert"><select data-field="expirado" data-idx="${idx}"><option value="false" ${!isExp ? "selected" : ""}>Válido</option><option value="true" ${isExp ? "selected" : ""}>Expirado</option></select></td>
      <td class="col-saiu"><select data-field="saiu" data-idx="${idx}"><option value="" ${!r.saiu ? "selected" : ""}> </option><option value="Sim" ${r.saiu ? "selected" : ""}>Sim</option></select></td>
      <td class="col-acoes"><div class="row-actions"><button class="mini-btn cancel" data-action="delete-row" data-idx="${idx}" title="Eliminar registo">🗑</button></div></td>
    </tr>`;
  }).join("");

  const newRowHtml = editMode && newRowDraft ? `<tr>
    <td class="col-equipa"><input data-new="equipa" value="${escapeHtml(newRowDraft.equipa)}" /></td>
    <td class="col-email"><input data-new="email" type="email" value="${escapeHtml(newRowDraft.email)}" /></td>
    <td class="col-codigo_certificacao"><input data-new="codigo_certificacao" value="${escapeHtml(newRowDraft.codigo_certificacao)}" /></td>
    <td class="col-nome_certificacao"><input data-new="nome_certificacao" value="${escapeHtml(newRowDraft.nome_certificacao)}" /></td>
    <td class="col-site"><select data-new="site">${SITE_OPTIONS.map((s) => `<option value="${s}" ${newRowDraft.site === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
    <td class="col-data_certificacao"><input class="fp-date" data-new="data_certificacao" type="text" value="" placeholder="AAAA-MM-DD" /></td>
    <td class="col-data_expiracao"><input class="fp-date" data-new="data_expiracao" type="text" value="" placeholder="AAAA-MM-DD" /></td>
    <td class="col-externo"><select data-new="externo"><option value="" selected> </option><option value="Sim">Sim</option></select></td>
    <td class="col-status_cert"><select data-new="expirado"><option value="false" selected>Válido</option><option value="true">Expirado</option></select></td>
    <td class="col-saiu"><select data-new="saiu"><option value="" selected> </option><option value="Sim">Sim</option></select></td>
    <td class="col-acoes"><div class="row-actions"><button class="mini-btn cancel" id="cancelNewRowBtn" title="Cancelar">✕</button></div></td>
  </tr>` : "";

  tbody.innerHTML = rowsHtml + newRowHtml;
  applyDatePickers(tbody);
  updateSortHeaderUI();
  applyColumnVisibility();
  updateTotals();
  fitTableColumns();
}

function fitTableColumns() {
  const table = document.querySelector(".data-table");
  if (!table) return;
  const headerCells = table.querySelectorAll("thead tr:first-child th");
  // Reset previously forced widths so the browser can measure naturally
  headerCells.forEach((th) => { th.style.width = ""; th.style.minWidth = ""; });
  table.style.width = "max-content";
  // Measure each column's natural max content width
  headerCells.forEach((th, i) => {
    const col = i + 1;
    let max = th.scrollWidth;
    table.querySelectorAll(`tr td:nth-child(${col}), thead tr th:nth-child(${col})`).forEach((cell) => {
      if (cell.scrollWidth > max) max = cell.scrollWidth;
    });
    th.style.width = `${max}px`;
    th.style.minWidth = `${max}px`;
  });
}

function updateSortHeaderUI() {
  document.querySelectorAll("th[data-sort]").forEach((h) => {
    h.classList.remove("sorted-asc", "sorted-desc");
    if (h.dataset.sort === sortState.key) h.classList.add(sortState.direction === "asc" ? "sorted-asc" : "sorted-desc");
  });
}
function updateTotals() {
  const c = document.getElementById("filteredCount");
  if (c) c.textContent = `${displayedRows.length} / ${stayRows.length}`;
}

function collectRowInput(idx) {
  const getValue = (field) => document.querySelector(`[data-field="${field}"][data-idx="${idx}"]`)?.value?.trim() ?? "";
  const getCheck = (field) => getValue(field) === "Sim";
  const original = displayedRows[idx];
  const dataExp = getValue("data_expiracao");
  return {
    nome_certificacao: getValue("nome_certificacao"),
    site: getValue("site"),
    data_expiracao: dataExp,
    expirado: getValue("expirado") === "true",
    externo: getCheck("externo"),
    saiu: getCheck("saiu"),
    updated_at: new Date().toISOString(),
    data_certificacao: getValue("data_certificacao") || original.data_certificacao
  };
}
async function saveExistingRow(idx) {
  const row = displayedRows[idx];
  const payload = collectRowInput(idx);
  const query = `equipa=eq.${encodeURIComponent(row.equipa)}&email=eq.${encodeURIComponent(row.email)}&codigo_certificacao=eq.${encodeURIComponent(row.codigo_certificacao)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stay_certified?${query}`, { method: "PATCH", headers: supabaseHeaders({ Prefer: "return=representation" }), body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`PATCH failed ${res.status}`);
}
async function deleteExistingRow(idx) {
  const row = displayedRows[idx];
  if (!await _modal.confirm(`Eliminar o registo ${row.email} / ${row.codigo_certificacao}?`, "Confirmar eliminação")) return;
  const query = `equipa=eq.${encodeURIComponent(row.equipa)}&email=eq.${encodeURIComponent(row.email)}&codigo_certificacao=eq.${encodeURIComponent(row.codigo_certificacao)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stay_certified?${query}`, { method: "DELETE", headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`DELETE failed ${res.status}`);
}

function startNewRow() {
  newRowDraft = { equipa: "", email: "", codigo_certificacao: "", nome_certificacao: "", site: "Lisboa", data_certificacao: "", data_expiracao: "" };
  if (!_savedVisibleColumns) {
    _savedVisibleColumns = { ...visibleColumns };
    COLUMN_KEYS.forEach(k => { if (k !== "acoes") visibleColumns[k] = true; });
    applyColumnVisibility();
    syncStayColToggleButtons();
  }
  renderStayTable();
  const newInputs = [...document.querySelectorAll("[data-new]")];
  const first = newInputs.find((el) => el.closest("td")?.style.display !== "none");
  first?.focus();
}
function readNewRowDraft() {
  const getValue = (field) => document.querySelector(`[data-new="${field}"]`)?.value?.trim() ?? "";
  const dataExp = getValue("data_expiracao");
  return {
    equipa: getValue("equipa"),
    email: getValue("email"),
    codigo_certificacao: getValue("codigo_certificacao"),
    nome_certificacao: getValue("nome_certificacao"),
    site: getValue("site"),
    data_expiracao: dataExp,
    data_certificacao: getValue("data_certificacao"),
    expirado: document.querySelector('[data-new="expirado"]')?.value === "true" || calcExpirado(dataExp),
    externo: document.querySelector('[data-new="externo"]')?.value === "Sim",
    saiu: document.querySelector('[data-new="saiu"]')?.value === "Sim"
  };
}
async function insertNewRow() {
  const payload = readNewRowDraft();
  if (!payload.equipa || !payload.email || !payload.codigo_certificacao || !payload.nome_certificacao) {
    await _modal.alert("Preenche todos os campos obrigatórios: equipa, email, código e certificação.");
    return;
  }
  const isDuplicate = stayRows.some((r) =>
    r.equipa === payload.equipa &&
    r.email === payload.email &&
    r.codigo_certificacao === payload.codigo_certificacao
  );
  if (isDuplicate) {
    await _modal.alert("Já existe um registo com esta combinação de equipa, email e código de certificação.", "Registo duplicado");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stay_certified`, { method: "POST", headers: supabaseHeaders({ Prefer: "return=representation" }), body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`POST failed ${res.status}`);
  newRowDraft = null;
}

function renderTeamTiles(rows) {
  const container = document.getElementById("teamTiles");
  if (!container) return;
  const counts = {};
  rows.forEach((r) => { counts[r.equipa] = (counts[r.equipa] || 0) + 1; });
  const teams = Object.keys(counts).sort();
  container.innerHTML = teams.map((t) =>
    `<button type="button" class="team-tile${filterState.equipa === t ? " active" : ""}" data-team="${escapeHtml(t)}">
      <span class="team-tile-name">${escapeHtml(t)}</span>
      <span class="team-tile-count">${counts[t]} cert.</span>
    </button>`
  ).join("");
  container.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-team]");
    if (!tile) return;
    const team = tile.dataset.team;
    const isActive = filterState.equipa === team;
    filterState.equipa = isActive ? "" : team;
    const equipaInput = document.querySelector(".filter-row [data-filter='equipa']");
    if (equipaInput) equipaInput.value = filterState.equipa;
    renderStayTable();
    renderTeamTiles(stayRows);
    if (!isActive) {
      document.getElementById("certPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, { once: true });
}

const _modal = (() => {
  let overlay, titleEl, msgEl, okBtn, cancelBtn;
  function build() {
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal-box">
      <div class="modal-title" id="_mTitle"></div>
      <p class="modal-message" id="_mMsg"></p>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="_mCancel">Cancelar</button>
        <button class="modal-btn modal-btn-ok" id="_mOk">OK</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    titleEl  = overlay.querySelector("#_mTitle");
    msgEl    = overlay.querySelector("#_mMsg");
    okBtn    = overlay.querySelector("#_mOk");
    cancelBtn = overlay.querySelector("#_mCancel");
  }
  function show(title, msg, hasCancel, okLabel = "OK", cancelLabel = "Cancelar") {
    if (!overlay) build();
    titleEl.textContent = title;
    msgEl.textContent   = msg;
    okBtn.textContent     = okLabel;
    cancelBtn.textContent = cancelLabel;
    cancelBtn.style.display = hasCancel ? "" : "none";
    overlay.classList.add("visible");
    return new Promise((resolve) => {
      const done = (val) => { overlay.classList.remove("visible"); okBtn.onclick = null; cancelBtn.onclick = null; resolve(val); };
      okBtn.onclick     = () => done(true);
      cancelBtn.onclick = () => done(false);
    });
  }
  return {
    alert:   (msg, title = "Aviso")                                          => show(title, msg, false),
    confirm: (msg, title = "Confirmação", ok = "OK", cancel = "Cancelar")    => show(title, msg, true, ok, cancel)
  };
})();
function setupColumnMenu() {
  const container = document.getElementById("colToggles");
  if (!container) return;
  const toggleable = COLUMN_KEYS.filter((k) => k !== "acoes");
  container.innerHTML = toggleable.map((k) =>
    `<button type="button" class="col-toggle-btn${visibleColumns[k] ? " active" : ""}" data-col-toggle="${k}">${COLUMN_LABELS[k]}</button>`
  ).join("");
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-col-toggle]");
    if (!btn) return;
    const key = btn.dataset.colToggle;
    visibleColumns[key] = !visibleColumns[key];
    btn.classList.toggle("active", visibleColumns[key]);
    applyColumnVisibility();
  });
}
function syncStayColToggleButtons() {
  document.querySelectorAll("#colToggles [data-col-toggle]").forEach(btn => {
    btn.classList.toggle("active", !!visibleColumns[btn.dataset.colToggle]);
  });
}

function applyColumnVisibility() {
  COLUMN_KEYS.forEach((k) => {
    const show = visibleColumns[k];
    document.querySelectorAll(`.col-${k}`).forEach((el) => { el.style.display = show ? "" : "none"; });
    const filterInput = document.querySelector(`[data-filter="${k}"]`);
    if (filterInput) filterInput.style.display = show ? "" : "none";
  });
}

async function saveStayDirtyRows() {
  if (newRowDraft !== null) await insertNewRow();
  for (const key of stayDirtySet) {
    const [equipa, email, codigo] = key.split("::");
    const idx = displayedRows.findIndex(r => r.equipa === equipa && r.email === email && r.codigo_certificacao === codigo);
    if (idx >= 0) await saveExistingRow(idx);
  }
  stayDirtySet.clear();
}

function updateStaySaveAllBtnState(saveAllBtn) {
  if (!saveAllBtn) return;
  const hasPending = stayDirtySet.size > 0 || newRowDraft !== null;
  saveAllBtn.classList.toggle("has-changes", hasPending);
}

function cleanExcelVal(col, val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  const s = String(val);
  if (s === "true")  return "Sim";
  if (s === "false") return "Não";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

async function exportToExcel(rows, columns, labels, filename) {
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const XLSX = window.XLSX;
  const data = [
    labels,
    ...rows.map(r => columns.map(c => cleanExcelVal(c, r[c])))
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = columns.map((c, i) => {
    const maxLen = Math.max(labels[i].length, ...rows.map(r => String(cleanExcelVal(c, r[c])).length));
    return { wch: Math.min(Math.max(maxLen + 2, 12), 55) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, filename);
}

function setupStayCertifiedEdition() {
  const toggleBtn = document.getElementById("toggleEditBtn");
  const addRowBtn = document.getElementById("addRowBtn");
  const saveAllBtn = document.getElementById("saveAllBtn");
  const exportBtn  = document.getElementById("exportBtn");
  const tbody = document.getElementById("stayTableBody");
  if (!toggleBtn || !addRowBtn || !tbody) return;

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const exportCols   = COLUMN_KEYS.filter(k => k !== "acoes");
      const exportLabels = exportCols.map(k => COLUMN_LABELS[k]);
      const today = new Date().toISOString().slice(0, 10);
      const processedRows = displayedRows.map(r => ({
        ...r,
        status_cert: (r.expirado === true || r.expirado === "X") ? "Expirado" : "Válido",
        externo: r.externo ? "Sim" : "Não",
        saiu:    r.saiu    ? "Sim" : "Não",
      }));
      exportToExcel(processedRows, exportCols, exportLabels, `certificacoes_${today}.xlsx`);
    });
  }

  const exitEditMode = async (reload) => {
    editMode = false;
    newRowDraft = null;
    stayDirtySet.clear();
    toggleBtn.classList.remove("active");
    addRowBtn.classList.add("hidden");
    if (saveAllBtn) { saveAllBtn.classList.add("hidden"); saveAllBtn.classList.remove("has-changes"); }
    if (exportBtn)  exportBtn.classList.remove("hidden");
    if (_savedVisibleColumns) {
      Object.assign(visibleColumns, _savedVisibleColumns);
      _savedVisibleColumns = null;
    }
    visibleColumns.acoes = false;
    applyColumnVisibility();
    syncStayColToggleButtons();
    if (reload) await loadStayCertifiedTable();
    else renderStayTable();
  };

  toggleBtn.addEventListener("click", async () => {
    if (!editMode) {
      editMode = true;
      toggleBtn.classList.add("active");
      addRowBtn.classList.remove("hidden");
      if (saveAllBtn) saveAllBtn.classList.remove("hidden");
      if (exportBtn)  exportBtn.classList.add("hidden");
      visibleColumns.acoes = true;
      applyColumnVisibility();
      renderStayTable();
      return;
    }
    const hasPending = stayDirtySet.size > 0 || newRowDraft !== null;
    if (hasPending) {
      const save = await _modal.confirm(
        "Existem alterações não guardadas. Guardar antes de sair do modo de edição?",
        "Alterações pendentes",
        "Guardar",
        "Descartar"
      );
      if (save) {
        try {
          await saveStayDirtyRows();
          await exitEditMode(true);
        } catch (err) {
          console.error(err);
          await _modal.alert("Erro ao guardar os dados. Tenta novamente.", "Erro");
        }
      } else {
        await exitEditMode(false);
      }
    } else {
      await exitEditMode(false);
    }
  });

  if (saveAllBtn) {
    saveAllBtn.addEventListener("click", async () => {
      if (!stayDirtySet.size && newRowDraft === null) return;
      saveAllBtn.disabled = true;
      try {
        await saveStayDirtyRows();
        await loadStayCertifiedTable();
        updateStaySaveAllBtnState(saveAllBtn);
      } catch (err) {
        console.error(err);
        await _modal.alert("Erro ao guardar os dados. Tenta novamente.", "Erro");
      } finally {
        saveAllBtn.disabled = false;
      }
    });
  }

  addRowBtn.addEventListener("click", () => {
    startNewRow();
    updateStaySaveAllBtnState(saveAllBtn);
  });

  tbody.addEventListener("change", (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const idx = Number(e.target.dataset.idx);
    const row = displayedRows[idx];
    if (row) {
      stayDirtySet.add(`${row.equipa}::${row.email}::${row.codigo_certificacao}`);
      e.target.closest("tr")?.classList.add("row-dirty");
      updateStaySaveAllBtnState(saveAllBtn);
    }
  });

  tbody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    try {
      if (target.dataset.action === "delete-row") {
        await deleteExistingRow(Number(target.dataset.idx));
        stayDirtySet.clear();
        await loadStayCertifiedTable();
        updateStaySaveAllBtnState(saveAllBtn);
        return;
      }
      if (target.id === "cancelNewRowBtn") {
        newRowDraft = null;
        updateStaySaveAllBtnState(saveAllBtn);
        renderStayTable();
      }
    } catch (err) {
      console.error(err);
      await _modal.alert("Ocorreu um erro ao gravar os dados. Tenta novamente.", "Erro");
    }
  });

  document.querySelectorAll("th[data-sort]").forEach((h) => {
    h.addEventListener("click", () => {
      const key = h.dataset.sort;
      if (!key) return;
      if (sortState.key === key) sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      else sortState = { key, direction: "asc" };
      renderStayTable();
    });
  });

  document.querySelectorAll(".filter-row input[data-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.filter;
      if (!key) return;
      filterState[key] = input.value;
      renderStayTable();
    });
  });
}

function setupLayoutExtras() {
  // Hamburger toggle
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("navLinks");
  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      hamburger.classList.toggle("open");
      navLinks.classList.toggle("open");
    });
  }

  // Navbar scroll effect
  const navbar = document.getElementById("navbar");
  const scrollProgress = document.getElementById("scrollProgress");
  if (navbar || scrollProgress) {
    window.addEventListener("scroll", () => {
      if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 40);
      if (scrollProgress) {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress.style.width = total > 0 ? `${(window.scrollY / total) * 100}%` : "0";
      }
    }, { passive: true });
  }

  // Particles
  const particlesEl = document.getElementById("particles");
  if (particlesEl) {
    const count = 40;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.cssText = [
        `left:${Math.random() * 100}%`,
        `top:${Math.random() * 100}%`,
        `width:${2 + Math.random() * 3}px`,
        `height:${2 + Math.random() * 3}px`,
        `animation-duration:${8 + Math.random() * 16}s`,
        `animation-delay:${Math.random() * 10}s`,
        `opacity:${0.05 + Math.random() * 0.2}`
      ].join(";");
      frag.appendChild(p);
    }
    particlesEl.appendChild(frag);
  }

  // Reveal on scroll
  const reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    reveals.forEach((el) => obs.observe(el));
  }

  // Back button — inject on all pages except home
  const isHome = !!document.querySelector(".hero-tall");
  if (!isHome) {
    const heroContent = document.querySelector(".hero-content");
    if (heroContent) {
      const btn = document.createElement("button");
      btn.className = "back-btn";
      btn.innerHTML = "&#8592; Voltar";
      btn.addEventListener("click", () => history.back());
      heroContent.insertBefore(btn, heroContent.firstChild);
    }
  }

  // Home: scroll to drilldown origin section on return
  if (isHome) {
    const scrollTo = sessionStorage.getItem("drillScrollTo");
    if (scrollTo) {
      sessionStorage.removeItem("drillScrollTo");
      requestAnimationFrame(() => {
        const el = document.getElementById(scrollTo);
        if (el) el.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
}

setupLayoutExtras();
setupColumnMenu();
applyColumnVisibility();
setupStayCertifiedEdition();

// Apply drilldown filters from URL query params (e.g. ?filter_email=x&filter_site=y)
(function applyUrlFilters() {
  const params = new URLSearchParams(_initSearch);
  params.forEach((value, key) => {
    if (!key.startsWith("filter_")) return;
    const field = key.slice(7); // strip "filter_"
    if (!(field in filterState)) return;
    filterState[field] = value;
    const input = document.querySelector(`.filter-row [data-filter="${field}"]`);
    if (input) input.value = value;
  });
})();

loadStayCertifiedTable();

// ── PLANEAMENTO ──────────────────────────────────────────────────────────────

const MES_OPTIONS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const STATUS_OPTIONS = ["Planeado", "Cancelado"];

// quarter é coluna gerada no Supabase (calculada a partir de mes_certificacao)
const PLAN_COLUMN_KEYS = ["equipa", "quarter", "mes_certificacao", "email", "codigo_certificacao", "nome_certificacao", "site", "status", "notas", "acoes"];
const PLAN_COLUMN_LABELS = {
  equipa: "Equipa", quarter: "Quarter", mes_certificacao: "Mês Certif.", email: "Email",
  codigo_certificacao: "Código", nome_certificacao: "Certificação",
  site: "Site", status: "Status", notas: "Notas", acoes: "Ações"
};

let planRows = [];
let planDisplayedRows = [];
let planNotes = [];
let planEditMode = false;
let planNewRowDraft = null;
let planSortState = { key: "mes_certificacao", direction: "asc" };
const PLAN_HIDDEN_BY_DEFAULT = new Set(["site", "acoes"]);
let planVisibleColumns = Object.fromEntries(PLAN_COLUMN_KEYS.map((k) => [k, !PLAN_HIDDEN_BY_DEFAULT.has(k)]));
let planFilterState = { equipa: "", quarter: "", mes_certificacao: "", email: "", codigo_certificacao: "", nome_certificacao: "", site: "", status: "" };
let planDirtySet = new Set(); // "email::codigo_certificacao" keys of rows with unsaved edits
let _savedPlanVisibleColumns = null;

function applyPlanFilters(rows) {
  return rows.filter((row) =>
    Object.entries(planFilterState).every(([key, val]) => {
      const needle = String(val || "").trim().toLowerCase();
      return !needle || String(row[key] ?? "").toLowerCase().includes(needle);
    })
  );
}

const MES_ORDER = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function getPlanViewRows() {
  const rows = applyPlanFilters([...planRows]);
  const { key, direction } = planSortState;
  const sign = direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (key === "mes_certificacao") {
      const ia = MES_ORDER.indexOf(a.mes_certificacao ?? "");
      const ib = MES_ORDER.indexOf(b.mes_certificacao ?? "");
      const ai = ia === -1 ? 99 : ia;
      const bi = ib === -1 ? 99 : ib;
      return (ai - bi) * sign;
    }
    const va = String(a[key] ?? "").toLowerCase();
    const vb = String(b[key] ?? "").toLowerCase();
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return 0;
  });
  return rows;
}

function buildPlanDataLists(rows) {
  Object.keys(planFilterState).forEach(field => {
    const unique = [...new Set(rows.map(r => String(r[field] ?? "")).filter(Boolean))].sort();
    const input = document.querySelector(`#planPanel .filter-row [data-pfilter="${field}"]`);
    if (input) attachAutocomplete(input, unique);
  });
}

function renderPlanTable() {
  const tbody = document.getElementById("planTableBody");
  if (!tbody) return;
  planDisplayedRows = getPlanViewRows();

  if (!planDisplayedRows.length && !planNewRowDraft) {
    tbody.innerHTML = "<tr><td colspan=\"9\">Sem registos.</td></tr>";
    updatePlanTotals();
    return;
  }

  const siteSelect = (field, idx, val) =>
    `<select data-pfield="${field}" data-pidx="${idx}">${SITE_OPTIONS.map((s) =>
      `<option value="${s}" ${val === s ? "selected" : ""}>${s}</option>`).join("")}</select>`;

  const mesSelect = (field, idx, val) =>
    `<select data-pfield="${field}" data-pidx="${idx}">${MES_OPTIONS.map((m) =>
      `<option value="${m}" ${val === m ? "selected" : ""}>${m || "—"}</option>`).join("")}</select>`;

  const statusBadge = (s) => {
    const cls = s === "Cancelado" ? "danger" : "ok";
    return `<span class="badge ${cls}">${escapeHtml(s || "Planeado")}</span>`;
  };

  const rowsHtml = planDisplayedRows.map((r, idx) => {
    const rowNotes = planNotes.filter(n => n.equipa === r.equipa && n.email === r.email && n.codigo_certificacao === r.codigo_certificacao);
    const notesBtnHtml = `<button class="notes-trigger${rowNotes.length > 0 ? ' has-notes' : ''}"
      data-notes-equipa="${escapeHtml(r.equipa ?? '')}"
      data-notes-email="${escapeHtml(r.email)}"
      data-notes-codigo="${escapeHtml(r.codigo_certificacao)}"
      title="${rowNotes.length} nota(s)">${rowNotes.length > 0 ? `<span class="notes-badge">${rowNotes.length}</span>` : '+'}</button>`;
    if (!planEditMode) {
      return `<tr>
        <td class="col-equipa">${escapeHtml(r.equipa ?? "")}</td>
        <td class="col-quarter">${escapeHtml(r.quarter ?? "")}</td>
        <td class="col-mes_certificacao">${escapeHtml(r.mes_certificacao)}</td>
        <td class="col-email">${escapeHtml(r.email)}</td>
        <td class="col-codigo_certificacao">${escapeHtml(r.codigo_certificacao)}</td>
        <td class="col-nome_certificacao">${escapeHtml(r.nome_certificacao)}</td>
        <td class="col-site">${escapeHtml(r.site)}</td>
        <td class="col-status">${statusBadge(r.status)}</td>
        <td class="col-notas">${notesBtnHtml}</td>
        <td class="col-acoes">-</td>
      </tr>`;
    }
    const statusSel = `<select data-pfield="status" data-pidx="${idx}">${STATUS_OPTIONS.map((s) =>
      `<option value="${s}" ${(r.status || "Planeado") === s ? "selected" : ""}>${s}</option>`).join("")}</select>`;
    const isDirty = planDirtySet.has(`${r.email}::${r.codigo_certificacao}`);
    return `<tr${isDirty ? ' class="row-dirty"' : ''}>
      <td class="col-equipa"><input data-pfield="equipa" data-pidx="${idx}" value="${escapeHtml(r.equipa ?? "")}" /></td>
      <td class="col-quarter">${escapeHtml(r.quarter ?? "")}</td>
      <td class="col-mes_certificacao">${mesSelect("mes_certificacao", idx, r.mes_certificacao)}</td>
      <td class="col-email">${escapeHtml(r.email)}</td>
      <td class="col-codigo_certificacao">${escapeHtml(r.codigo_certificacao)}</td>
      <td class="col-nome_certificacao"><input data-pfield="nome_certificacao" data-pidx="${idx}" value="${escapeHtml(r.nome_certificacao)}" /></td>
      <td class="col-site">${siteSelect("site", idx, r.site)}</td>
      <td class="col-status">${statusSel}</td>
      <td class="col-notas">${notesBtnHtml}</td>
      <td class="col-acoes"><div class="row-actions">
        <button class="mini-btn cancel" data-paction="delete-row" data-pidx="${idx}" title="Eliminar">🗑</button>
      </div></td>
    </tr>`;
  }).join("");

  const newSiteOpts   = SITE_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join("");
  const newMesOpts    = MES_OPTIONS.map((m) => `<option value="${m}">${m || "—"}</option>`).join("");
  const newStatusOpts = STATUS_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join("");

  const newRowHtml = planEditMode && planNewRowDraft ? `<tr>
    <td class="col-equipa"><input data-pnew="equipa" /></td>
    <td class="col-quarter">—</td>
    <td class="col-mes_certificacao"><select data-pnew="mes_certificacao">${newMesOpts}</select></td>
    <td class="col-email"><input data-pnew="email" type="email" /></td>
    <td class="col-codigo_certificacao"><input data-pnew="codigo_certificacao" /></td>
    <td class="col-nome_certificacao"><input data-pnew="nome_certificacao" /></td>
    <td class="col-site"><select data-pnew="site">${newSiteOpts}</select></td>
    <td class="col-status"><select data-pnew="status">${newStatusOpts}</select></td>
    <td class="col-notas">—</td>
    <td class="col-acoes"><div class="row-actions">
      <button class="mini-btn cancel" id="cancelPlanNewRowBtn" title="Cancelar">✕</button>
    </div></td>
  </tr>` : "";

  tbody.innerHTML = rowsHtml + newRowHtml;
  updatePlanSortHeaderUI();
  applyPlanColumnVisibility();
  updatePlanTotals();
  fitPlanTableColumns();
}

function updatePlanSortHeaderUI() {
  document.querySelectorAll("#planTable th[data-psort]").forEach((h) => {
    h.classList.remove("sorted-asc", "sorted-desc");
    if (h.dataset.psort === planSortState.key)
      h.classList.add(planSortState.direction === "asc" ? "sorted-asc" : "sorted-desc");
  });
}

function updatePlanTotals() {
  const c = document.getElementById("planFilteredCount");
  if (c) c.textContent = `${planDisplayedRows.length} / ${planRows.length}`;
}

function syncPlanColToggleButtons() {
  document.querySelectorAll("#planColToggles [data-plan-col]").forEach(btn => {
    btn.classList.toggle("active", !!planVisibleColumns[btn.dataset.planCol]);
  });
}

function applyPlanColumnVisibility() {
  PLAN_COLUMN_KEYS.forEach((k) => {
    const show = planVisibleColumns[k];
    document.querySelectorAll(`#planTable .col-${k}`).forEach((el) => { el.style.display = show ? "" : "none"; });
    const fi = document.querySelector(`#planPanel [data-pfilter="${k}"]`);
    if (fi) fi.parentElement.style.display = show ? "" : "none";
  });
}

function fitPlanTableColumns() {
  const table = document.getElementById("planTable");
  if (!table) return;
  const headerCells = table.querySelectorAll("thead tr:first-child th");
  headerCells.forEach((th) => { th.style.width = ""; th.style.minWidth = ""; });
  table.style.width = "max-content";
  headerCells.forEach((th, i) => {
    const col = i + 1;
    let max = th.scrollWidth;
    table.querySelectorAll(`tr td:nth-child(${col}), thead tr th:nth-child(${col})`).forEach((cell) => {
      if (cell.scrollWidth > max) max = cell.scrollWidth;
    });
    th.style.width = `${max}px`;
    th.style.minWidth = `${max}px`;
  });
}

function getPlanFieldValue(field, idx) {
  return document.querySelector(`[data-pfield="${field}"][data-pidx="${idx}"]`)?.value?.trim() ?? "";
}

async function savePlanRow(idx) {
  const row = planDisplayedRows[idx];
  const payload = {
    equipa: getPlanFieldValue("equipa", idx),
    nome_certificacao: getPlanFieldValue("nome_certificacao", idx),
    site: getPlanFieldValue("site", idx),
    mes_certificacao: getPlanFieldValue("mes_certificacao", idx),
    status: getPlanFieldValue("status", idx),
    updated_at: new Date().toISOString()
  };
  const query = `email=eq.${encodeURIComponent(row.email)}&codigo_certificacao=eq.${encodeURIComponent(row.codigo_certificacao)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planeamento?${query}`,
    { method: "PATCH", headers: supabaseHeaders({ Prefer: "return=representation" }), body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`PATCH failed ${res.status}`);
}

async function deletePlanRow(idx) {
  const row = planDisplayedRows[idx];
  if (!await _modal.confirm(`Eliminar o registo ${row.email} / ${row.codigo_certificacao}?`, "Confirmar eliminação")) return;
  const query = `email=eq.${encodeURIComponent(row.email)}&codigo_certificacao=eq.${encodeURIComponent(row.codigo_certificacao)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planeamento?${query}`,
    { method: "DELETE", headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`DELETE failed ${res.status}`);
}

async function insertPlanRow() {
  const getV = (f) => document.querySelector(`[data-pnew="${f}"]`)?.value?.trim() ?? "";
  const payload = {
    equipa: getV("equipa"),
    email: getV("email"),
    codigo_certificacao: getV("codigo_certificacao"),
    nome_certificacao: getV("nome_certificacao"),
    site: getV("site"),
    mes_certificacao: getV("mes_certificacao"),
    status: getV("status") || "Planeado",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  if (!payload.email || !payload.codigo_certificacao || !payload.nome_certificacao) {
    await _modal.alert("Preenche todos os campos obrigatórios: email, código e certificação.");
    return;
  }
  if (planRows.some((r) => r.email === payload.email && r.codigo_certificacao === payload.codigo_certificacao)) {
    await _modal.alert("Já existe um registo com esta combinação de email e código.", "Registo duplicado");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planeamento`,
    { method: "POST", headers: supabaseHeaders({ Prefer: "return=representation" }), body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`POST failed ${res.status}`);
  planNewRowDraft = null;
}

async function loadPlaneamentoTable() {
  const tbody = document.getElementById("planTableBody");
  if (!tbody) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/planeamento` +
      `?select=equipa,quarter,email,codigo_certificacao,nome_certificacao,site,mes_certificacao,status` +
      `&order=email.asc&limit=1000`;
    const res = await fetch(url, { headers: supabaseHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    planRows = await res.json();
    const nr = await fetch(`${SUPABASE_URL}/rest/v1/planeamento_notas?select=*&order=created_at.asc`, { headers: supabaseHeaders() });
    planNotes = nr.ok ? await nr.json() : [];
    buildPlanDataLists(planRows);
    renderPlanTeamTiles(planRows);
    renderPlanTable();
  } catch (err) {
    document.getElementById("planTableBody").innerHTML =
      "<tr><td colspan=\"8\">Erro a carregar dados do Supabase.</td></tr>";
    console.error(err);
  }
}

function renderPlanTeamTiles(rows) {
  const container = document.getElementById("planTeamTiles");
  if (!container) return;
  const counts = {};
  rows.forEach((r) => {
    const eq = (r.equipa || "").trim() || "—";
    counts[eq] = (counts[eq] || 0) + 1;
  });
  const teams = Object.keys(counts).sort();
  container.innerHTML = teams.map((t) =>
    `<button type="button" class="team-tile${planFilterState.equipa === t ? " active" : ""}" data-plan-team="${escapeHtml(t)}">
      <span class="team-tile-name">${escapeHtml(t)}</span>
      <span class="team-tile-count">${counts[t]} cert.</span>
    </button>`
  ).join("");
  container.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-plan-team]");
    if (!tile) return;
    const team = tile.dataset.planTeam;
    const isActive = planFilterState.equipa === team;
    planFilterState.equipa = isActive ? "" : team;
    const equipaInput = document.querySelector("#planPanel .filter-row [data-pfilter='equipa']");
    if (equipaInput) equipaInput.value = planFilterState.equipa;
    renderPlanTable();
    renderPlanTeamTiles(planRows);
    if (!isActive) {
      document.getElementById("planPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, { once: true });
}

function setupPlanColumnMenu() {
  const container = document.getElementById("planColToggles");
  if (!container) return;
  container.innerHTML = PLAN_COLUMN_KEYS.filter((k) => k !== "acoes").map((k) =>
    `<button type="button" class="col-toggle-btn${planVisibleColumns[k] ? " active" : ""}" data-plan-col="${k}">${PLAN_COLUMN_LABELS[k]}</button>`
  ).join("");
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-plan-col]");
    if (!btn) return;
    const key = btn.dataset.planCol;
    planVisibleColumns[key] = !planVisibleColumns[key];
    btn.classList.toggle("active", planVisibleColumns[key]);
    applyPlanColumnVisibility();
  });
}

async function savePlanDirtyRows() {
  if (planNewRowDraft !== null) await insertPlanRow();
  for (const key of planDirtySet) {
    const [email, codigo] = key.split("::");
    const idx = planDisplayedRows.findIndex(r => r.email === email && r.codigo_certificacao === codigo);
    if (idx >= 0) await savePlanRow(idx);
  }
  planDirtySet.clear();
}

function updateSaveAllBtnState(saveAllBtn) {
  if (!saveAllBtn) return;
  const hasPending = planDirtySet.size > 0 || planNewRowDraft !== null;
  saveAllBtn.classList.toggle("has-changes", hasPending);
}

// ── NOTES POPOVER ─────────────────────────────────────────────────────────────

function formatNoteDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd   = String(d.getDate()).padStart(2, "0");
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, "0");
  const min  = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

let _notesPopover = null;
let _notesAnchorBtn = null;

function _notesOutsideClick(e) {
  if (_notesPopover && !_notesPopover.contains(e.target) &&
      e.target !== _notesAnchorBtn && !_notesAnchorBtn?.contains(e.target)) {
    closeNotesPopover();
  }
}

function closeNotesPopover() {
  if (_notesPopover) { _notesPopover.remove(); _notesPopover = null; }
  _notesAnchorBtn = null;
  document.removeEventListener("click", _notesOutsideClick, true);
}

function openNotesPopover(equipa, email, codigo, anchorEl) {
  closeNotesPopover();
  _notesAnchorBtn = anchorEl;
  const notes = planNotes.filter(n => n.equipa === equipa && n.email === email && n.codigo_certificacao === codigo);

  const pop = document.createElement("div");
  pop.className = "notes-popover";
  pop.innerHTML = `
    <div class="notes-popover-header">
      <span>Notas</span>
      <button class="notes-popover-close" title="Fechar">✕</button>
    </div>
    <div class="notes-list">
      ${notes.length
        ? notes.map(n => `<div class="note-item" data-note-id="${escapeHtml(n.id_nota)}">
            <div class="note-meta">${formatNoteDate(n.created_at)}</div>
            <div class="note-text">${escapeHtml(n.nota)}</div>
            <button class="note-delete" data-note-id="${escapeHtml(n.id_nota)}" title="Eliminar">🗑</button>
          </div>`).join("")
        : '<p class="notes-empty">Sem notas.</p>'}
    </div>
    <div class="notes-add-row">
      <textarea class="notes-input" placeholder="Nova nota..." rows="2"></textarea>
      <button class="notes-add-btn">Adicionar</button>
    </div>`;

  document.body.appendChild(pop);
  _notesPopover = pop;

  const rect = anchorEl.getBoundingClientRect();
  const popW = 320;
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 6;
  if (left + popW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popW - 8);
  pop.style.left = `${left}px`;
  pop.style.top  = `${top}px`;

  pop.querySelector(".notes-popover-close").addEventListener("click", closeNotesPopover);

  const addBtn  = pop.querySelector(".notes-add-btn");
  const textarea = pop.querySelector(".notes-input");
  addBtn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) return;
    addBtn.disabled = true;
    try {
      await addNote(equipa, email, codigo, text);
      textarea.value = "";
    } catch (err) { console.error(err); }
    finally { addBtn.disabled = false; }
  });

  pop.querySelector(".notes-list").addEventListener("click", async e => {
    const btn = e.target.closest(".note-delete");
    if (!btn) return;
    btn.disabled = true;
    try { await deleteNote(btn.dataset.noteId, equipa, email, codigo); }
    catch (err) { console.error(err); btn.disabled = false; }
  });

  setTimeout(() => document.addEventListener("click", _notesOutsideClick, true), 0);
}

async function addNote(equipa, email, codigo, nota) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planeamento_notas`,
    { method: "POST", headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ equipa, email, codigo_certificacao: codigo, nota }) });
  if (!res.ok) throw new Error(`POST note failed ${res.status}`);
  const [newNote] = await res.json();
  planNotes.push(newNote);
  if (_notesPopover) {
    const list = _notesPopover.querySelector(".notes-list");
    const empty = list.querySelector(".notes-empty");
    if (empty) empty.remove();
    const item = document.createElement("div");
    item.className = "note-item";
    item.dataset.noteId = newNote.id_nota;
    item.innerHTML = `<div class="note-meta">${formatNoteDate(newNote.created_at)}</div>
      <div class="note-text">${escapeHtml(newNote.nota)}</div>
      <button class="note-delete" data-note-id="${escapeHtml(newNote.id_nota)}" title="Eliminar">🗑</button>`;
    list.appendChild(item);
  }
  _updateNotesTrigger(equipa, email, codigo);
}

async function deleteNote(id_nota, equipa, email, codigo) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planeamento_notas?id_nota=eq.${encodeURIComponent(id_nota)}`,
    { method: "DELETE", headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`DELETE note failed ${res.status}`);
  planNotes = planNotes.filter(n => n.id_nota !== id_nota);
  if (_notesPopover) {
    _notesPopover.querySelector(`[data-note-id="${CSS.escape(id_nota)}"].note-item`)?.remove();
    const list = _notesPopover.querySelector(".notes-list");
    if (list && !list.querySelector(".note-item"))
      list.innerHTML = '<p class="notes-empty">Sem notas.</p>';
  }
  _updateNotesTrigger(equipa, email, codigo);
}

function _updateNotesTrigger(equipa, email, codigo) {
  const btn = document.querySelector(
    `.notes-trigger[data-notes-equipa="${CSS.escape(equipa)}"][data-notes-email="${CSS.escape(email)}"][data-notes-codigo="${CSS.escape(codigo)}"]`
  );
  if (!btn) return;
  const count = planNotes.filter(n => n.equipa === equipa && n.email === email && n.codigo_certificacao === codigo).length;
  btn.classList.toggle("has-notes", count > 0);
  btn.title = `${count} nota(s)`;
  btn.innerHTML = count > 0 ? `<span class="notes-badge">${count}</span>` : "+";
}

function setupPlaneamentoEdition() {
  const toggleBtn  = document.getElementById("planToggleEditBtn");
  const addRowBtn  = document.getElementById("planAddRowBtn");
  const saveAllBtn  = document.getElementById("planSaveAllBtn");
  const exportBtn   = document.getElementById("planExportBtn");
  const tbody       = document.getElementById("planTableBody");
  if (!toggleBtn || !addRowBtn || !tbody) return;

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const exportCols   = PLAN_COLUMN_KEYS.filter(k => k !== "acoes" && k !== "notas");
      const exportLabels = exportCols.map(k => PLAN_COLUMN_LABELS[k]);
      const today = new Date().toISOString().slice(0, 10);
      exportToExcel(planDisplayedRows, exportCols, exportLabels, `planeamento_${today}.xlsx`);
    });
  }

  const exitEditMode = async (reload) => {
    planEditMode = false;
    planNewRowDraft = null;
    planDirtySet.clear();
    toggleBtn.classList.remove("active");
    addRowBtn.classList.add("hidden");
    if (saveAllBtn) { saveAllBtn.classList.add("hidden"); saveAllBtn.classList.remove("has-changes"); }
    if (exportBtn)  exportBtn.classList.remove("hidden");
    if (_savedPlanVisibleColumns) {
      Object.assign(planVisibleColumns, _savedPlanVisibleColumns);
      _savedPlanVisibleColumns = null;
    }
    planVisibleColumns.acoes = false;
    applyPlanColumnVisibility();
    syncPlanColToggleButtons();
    if (reload) await loadPlaneamentoTable();
    else renderPlanTable();
  };

  toggleBtn.addEventListener("click", async () => {
    if (!planEditMode) {
      planEditMode = true;
      toggleBtn.classList.add("active");
      addRowBtn.classList.remove("hidden");
      if (saveAllBtn) saveAllBtn.classList.remove("hidden");
      if (exportBtn)  exportBtn.classList.add("hidden");
      planVisibleColumns.acoes = true;
      applyPlanColumnVisibility();
      renderPlanTable();
      return;
    }
    const hasPending = planDirtySet.size > 0 || planNewRowDraft !== null;
    if (hasPending) {
      const save = await _modal.confirm(
        "Existem alterações não guardadas. Guardar antes de sair do modo de edição?",
        "Alterações pendentes",
        "Guardar",
        "Descartar"
      );
      if (save) {
        try {
          await savePlanDirtyRows();
          await exitEditMode(true);
        } catch (err) {
          console.error(err);
          await _modal.alert("Erro ao guardar os dados. Tenta novamente.", "Erro");
        }
      } else {
        await exitEditMode(false);
      }
    } else {
      await exitEditMode(false);
    }
  });

  if (saveAllBtn) {
    saveAllBtn.addEventListener("click", async () => {
      if (!planDirtySet.size && planNewRowDraft === null) return;
      saveAllBtn.disabled = true;
      try {
        await savePlanDirtyRows();
        await loadPlaneamentoTable();
        updateSaveAllBtnState(saveAllBtn);
      } catch (err) {
        console.error(err);
        await _modal.alert("Erro ao guardar os dados. Tenta novamente.", "Erro");
      } finally {
        saveAllBtn.disabled = false;
      }
    });
  }

  addRowBtn.addEventListener("click", () => {
    planNewRowDraft = {};
    if (!_savedPlanVisibleColumns) {
      _savedPlanVisibleColumns = { ...planVisibleColumns };
      PLAN_COLUMN_KEYS.forEach(k => { if (k !== "acoes") planVisibleColumns[k] = true; });
      applyPlanColumnVisibility();
      syncPlanColToggleButtons();
    }
    renderPlanTable();
    updateSaveAllBtnState(saveAllBtn);
    const first = [...document.querySelectorAll("[data-pnew]")]
      .find((el) => el.closest("td")?.style.display !== "none");
    first?.focus();
  });

  tbody.addEventListener("change", (e) => {
    const field = e.target.dataset.pfield;
    if (!field) return;
    const idx = Number(e.target.dataset.pidx);
    const row = planDisplayedRows[idx];
    if (row) {
      planDirtySet.add(`${row.email}::${row.codigo_certificacao}`);
      e.target.closest("tr")?.classList.add("row-dirty");
      updateSaveAllBtnState(saveAllBtn);
    }
  });

  tbody.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    try {
      const notesBtn = t.closest(".notes-trigger");
      if (notesBtn) {
        if (_notesPopover && _notesAnchorBtn === notesBtn) { closeNotesPopover(); return; }
        openNotesPopover(notesBtn.dataset.notesEquipa, notesBtn.dataset.notesEmail, notesBtn.dataset.notesCodigo, notesBtn);
        return;
      }
      if (t.dataset.paction === "delete-row") {
        await deletePlanRow(Number(t.dataset.pidx));
        planDirtySet.clear();
        await loadPlaneamentoTable();
        updateSaveAllBtnState(saveAllBtn);
        return;
      }
      if (t.id === "cancelPlanNewRowBtn") {
        planNewRowDraft = null;
        updateSaveAllBtnState(saveAllBtn);
        renderPlanTable();
      }
    } catch (err) {
      console.error(err);
      await _modal.alert("Ocorreu um erro ao gravar os dados. Tenta novamente.", "Erro");
    }
  });

  document.querySelectorAll("#planTable th[data-psort]").forEach((h) => {
    h.addEventListener("click", () => {
      const key = h.dataset.psort;
      if (!key) return;
      if (planSortState.key === key) planSortState.direction = planSortState.direction === "asc" ? "desc" : "asc";
      else planSortState = { key, direction: "asc" };
      renderPlanTable();
    });
  });

  document.querySelectorAll("#planPanel .filter-row input[data-pfilter]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.pfilter;
      if (key) { planFilterState[key] = input.value; renderPlanTable(); }
    });
  });
}

setupPlanColumnMenu();
applyPlanColumnVisibility();
setupPlaneamentoEdition();

// Apply drilldown filters from URL query params (e.g. ?filter_email=x&filter_mes_certificacao=y)
(function applyPlanUrlFilters() {
  const params = new URLSearchParams(_initSearch);
  params.forEach((value, key) => {
    if (!key.startsWith("filter_")) return;
    const field = key.slice("filter_".length);
    if (!(field in planFilterState)) return;
    planFilterState[field] = value;
    const input = document.querySelector(`#planPanel .filter-row [data-pfilter="${field}"]`);
    if (input) input.value = value;
  });
})();

loadPlaneamentoTable();

// ── NAVBAR ALERT BADGE ────────────────────────────────────────────────────────

function setNavAlertBadge(red, orange) {
  const link = document.querySelector('.navbar-links a[href*="alertas"]');
  if (!link) return;
  const existing = link.querySelector(".nav-alert-badge");
  if (existing) existing.remove();
  if (!red && !orange) return;
  const badge = document.createElement("span");
  badge.className = "nav-alert-badge";
  if (red > 0)    badge.classList.add("nav-alert-badge--red");
  else if (orange > 0) badge.classList.add("nav-alert-badge--orange");
  badge.title = `${red} crítico(s), ${orange} urgente(s)`;
  link.appendChild(badge);
}

// ── HOME TOTALS ───────────────────────────────────────────────────────────────

async function loadHomeTotals() {
  if (!document.getElementById("homeTotalCerts")) return;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  try {
    const headers = supabaseHeaders({ Prefer: "count=exact" });

    const today = new Date().toISOString().slice(0, 10);
    const in15  = new Date(Date.now() + 15*24*60*60*1000).toISOString().slice(0, 10);
    const in30  = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 10);
    const valid = `expirado=not.is.true`;
    const [resCerts, resPlan, resAlert15, resAlert30, resRanking, resCodigos, resSites] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=email&${valid}&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/planeamento?select=email&status=eq.Planeado&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=email&${valid}&data_expiracao=gte.${today}&data_expiracao=lte.${in15}&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=email&${valid}&data_expiracao=gt.${in15}&data_expiracao=lte.${in30}&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=email&${valid}&limit=2000`, { headers: supabaseHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=codigo_certificacao,nome_certificacao&${valid}&limit=2000`, { headers: supabaseHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=site&${valid}&limit=2000`, { headers: supabaseHeaders() })
    ]);

    const parseCR = (res) => {
      const cr = res.headers.get("content-range") || "";
      const match = cr.match(/\/(\d+)$/);
      return match ? Number(match[1]) : "?";
    };

    const totalCerts  = parseCR(resCerts);
    const totalPlan   = parseCR(resPlan);
    const alertRed    = parseCR(resAlert15);
    const alertOrange = parseCR(resAlert30);

    setText("homeTotalCerts",    totalCerts);
    setText("homeTotalPlan",     totalPlan);
    setText("homeTotalKpi",      totalCerts);
    setText("homeAlertRed",      alertRed);
    setText("homeAlertOrange",   alertOrange);

    // Navbar alert badge (all pages)
    setNavAlertBadge(alertRed, alertOrange);

    // Ranking top 5
    const rankingEl = document.getElementById("homeRanking");
    if (rankingEl && resRanking.ok) {
      const allRows = await resRanking.json();
      const counts = {};
      allRows.forEach(r => { const e = (r.email || "").trim(); if (e) counts[e] = (counts[e] || 0) + 1; });
      const top5 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const medalClass = ["gold", "silver", "bronze"];
      rankingEl.innerHTML = top5.map(([email, n], i) =>
        `<li style="cursor:pointer" data-drill-email="${escapeHtml(email)}">
          <span class="ranking-pos ${medalClass[i] || ""}">${i + 1}</span>
          <span class="ranking-email">${escapeHtml(email)}</span>
          <span class="ranking-count">${n}</span>
        </li>`
      ).join("") || "<li class='ranking-loading'>Sem dados.</li>";
      rankingEl.addEventListener("click", e => {
        const li = e.target.closest("[data-drill-email]");
        if (li) {
          sessionStorage.setItem("drillScrollTo", "homeRanking");
          window.location.href = `/Portal/certificacoes?filter_email=${encodeURIComponent(li.dataset.drillEmail)}`;
        }
      });
    }

    // Gráfico distribuição por código
    const chartCanvas = document.getElementById("homeCertChart");
    if (chartCanvas && resCodigos.ok) {
      const codRows = await resCodigos.json();

      // Build code→name map (first occurrence wins) and count by code
      const codCounts = {};
      const codNames  = {};
      codRows.forEach(r => {
        const c = (r.codigo_certificacao || "").trim();
        const n = (r.nome_certificacao   || "").trim();
        if (c) {
          codCounts[c] = (codCounts[c] || 0) + 1;
          if (!codNames[c] && n) codNames[c] = n;
        }
      });

      // Sort descending
      const sorted = Object.entries(codCounts).sort((a, b) => b[1] - a[1]);
      const total = sorted.reduce((s, [, n]) => s + n, 0);

      // Aggregate into "Outros" codes with < 2% of total or outside top 15
      const threshold = Math.max(2, Math.round(total * 0.02));
      const main = sorted.filter(([, n]) => n >= threshold).slice(0, 15);
      const outrosTotal = sorted.filter(([, n]) => n < threshold).reduce((s, [, n]) => s + n, 0)
        + sorted.slice(15).reduce((s, [, n]) => s + n, 0);
      if (outrosTotal > 0) main.push(["Outros", outrosTotal]);

      // Use "Nome (CODIGO)" as label; fallback to code if name missing
      const certCodes = main.map(([c]) => c);  // original codes for drilldown
      const labels = main.map(([c]) => codNames[c] ? `${codNames[c]} (${c})` : c);
      const values = main.map(([, n]) => n);

      // Gradient colours: interpolate pink→blue across bars
      const pink = [233, 30, 140], blue = [0, 212, 255];
      const barColors = labels.map((_, i) => {
        const t = labels.length > 1 ? i / (labels.length - 1) : 0;
        const r = Math.round(pink[0] + (blue[0] - pink[0]) * t);
        const g = Math.round(pink[1] + (blue[1] - pink[1]) * t);
        const b2 = Math.round(pink[2] + (blue[2] - pink[2]) * t);
        return `rgba(${r},${g},${b2},0.85)`;
      });

      const barHeight = 32;
      chartCanvas.style.height = `${Math.max(200, labels.length * (barHeight + 8))}px`;

      chartCanvas.style.cursor = "pointer";
      new Chart(chartCanvas, {
        type: "bar",
        data: { labels, datasets: [{ data: values, backgroundColor: barColors, borderRadius: 6, borderSkipped: false }] },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: ctx => ctx[0]?.label || "",
                label: ctx => ` ${ctx.parsed.x} certificações`
              }
            }
          },
          onClick: (_, elements) => {
            if (!elements.length) return;
            const code = certCodes[elements[0].index];
            if (code && code !== "Outros") {
              sessionStorage.setItem("drillScrollTo", "homeCertChart");
              window.location.href = `/Portal/certificacoes?filter_codigo_certificacao=${encodeURIComponent(code)}`;
            }
          },
          scales: {
            x: {
              grid: { color: "rgba(255,255,255,0.06)" },
              ticks: { color: "#8899aa", font: { family: "Inter", size: 11 } }
            },
            y: {
              grid: { display: false },
              ticks: { color: "#c8d8e8", font: { family: "Inter", size: 12 } }
            }
          }
        }
      });
    }

    // Gráfico distribuição por site
    const siteCanvas = document.getElementById("homeSiteChart");
    if (siteCanvas && resSites.ok) {
      const siteRows = await resSites.json();
      const siteCounts = {};
      siteRows.forEach(r => { const s = (r.site || "").trim(); if (s) siteCounts[s] = (siteCounts[s] || 0) + 1; });

      const sorted = Object.entries(siteCounts).sort((a, b) => b[1] - a[1]);
      const siteLabels = sorted.map(([s]) => s);
      const siteValues = sorted.map(([, n]) => n);

      const pink = [233, 30, 140], blue = [0, 212, 255];
      const siteColors = siteLabels.map((_, i) => {
        const t = siteLabels.length > 1 ? i / (siteLabels.length - 1) : 0;
        const r = Math.round(pink[0] + (blue[0] - pink[0]) * t);
        const g = Math.round(pink[1] + (blue[1] - pink[1]) * t);
        const b2 = Math.round(pink[2] + (blue[2] - pink[2]) * t);
        return `rgba(${r},${g},${b2},0.85)`;
      });

      siteCanvas.style.height = "280px";
      siteCanvas.style.cursor = "pointer";

      new Chart(siteCanvas, {
        type: "bar",
        data: { labels: siteLabels, datasets: [{ data: siteValues, backgroundColor: siteColors, borderRadius: 8, borderSkipped: "bottom" }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} certificações` } }
          },
          onClick: (_, elements) => {
            if (!elements.length) return;
            const site = siteLabels[elements[0].index];
            if (site) {
              sessionStorage.setItem("drillScrollTo", "homeSiteChart");
              window.location.href = `/Portal/certificacoes?filter_site=${encodeURIComponent(site)}`;
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#c8d8e8", font: { family: "Inter", size: 13, weight: "600" } }
            },
            y: {
              grid: { color: "rgba(255,255,255,0.06)" },
              ticks: { color: "#8899aa", font: { family: "Inter", size: 11 } },
              beginAtZero: true
            }
          }
        }
      });
    }
  } catch (err) {
    console.error("Erro ao carregar totais home:", err);
  }
}

loadHomeTotals();

// ── ALERT COUNTERS ────────────────────────────────────────────────────────────

let alertTeamFilter = "";

async function loadAlertCounters(teamFilter = "") {
  const el15   = document.getElementById("alertCount15");
  const el30   = document.getElementById("alertCount30");
  const el60   = document.getElementById("alertCount60");
  const listEl = document.getElementById("alertCardList");
  if (!el15 && !el30 && !el60 && !listEl) return;

  const today = new Date().toISOString().slice(0, 10);
  const in15  = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in30  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in60  = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const hdCount = supabaseHeaders({ Prefer: "count=exact" });
  const hdData  = supabaseHeaders();
  const baseUrl = `${SUPABASE_URL}/rest/v1/stay_certified`;
  const valid   = `expirado=not.is.true`;
  const team    = teamFilter ? `&equipa=eq.${encodeURIComponent(teamFilter)}` : "";

  const parseCR = (res) => {
    const m = (res.headers.get("content-range") || "").match(/\/(\d+)$/);
    return m ? Number(m[1]) : "?";
  };

  try {
    const [res15, res30, res60, resList] = await Promise.all([
      fetch(`${baseUrl}?select=email&${valid}${team}&data_expiracao=gte.${today}&data_expiracao=lte.${in15}&limit=1`, { headers: hdCount }),
      fetch(`${baseUrl}?select=email&${valid}${team}&data_expiracao=gt.${in15}&data_expiracao=lte.${in30}&limit=1`, { headers: hdCount }),
      fetch(`${baseUrl}?select=email&${valid}${team}&data_expiracao=gt.${in30}&data_expiracao=lte.${in60}&limit=1`, { headers: hdCount }),
      fetch(`${baseUrl}?select=equipa,email,codigo_certificacao,data_expiracao&${valid}${team}&data_expiracao=gte.${today}&data_expiracao=lte.${in60}&order=data_expiracao.asc&limit=500`, { headers: hdData })
    ]);

    if (el15) el15.textContent = parseCR(res15);
    if (el30) el30.textContent = parseCR(res30);
    if (el60) el60.textContent = parseCR(res60);

    if (listEl && resList.ok) {
      const rows = await resList.json();
      if (!rows.length) {
        listEl.innerHTML = `<p class="alert-list-empty">Sem certificações a expirar nos próximos 60 dias.</p>`;
        return;
      }
      listEl.innerHTML = rows.map(r => {
        let cls, label;
        if (r.data_expiracao <= in15)      { cls = "danger";  label = "15 dias"; }
        else if (r.data_expiracao <= in30) { cls = "warning"; label = "30 dias"; }
        else                               { cls = "green";   label = "60 dias"; }
        const href = `/Portal/certificacoes?filter_email=${encodeURIComponent(r.email)}&filter_codigo_certificacao=${encodeURIComponent(r.codigo_certificacao)}`;
        return `<div class="alert-card alert-card--${cls}" data-href="${escapeHtml(href)}" role="button" tabindex="0">
          <span class="alert-card-badge alert-card-badge--${cls}">${label}</span>
          <span class="alert-card-equipa">${escapeHtml(r.equipa || '—')}</span>
          <span class="alert-card-email">${escapeHtml(r.email)}</span>
          <span class="alert-card-codigo">${escapeHtml(r.codigo_certificacao)}</span>
          <span class="alert-card-data">${escapeHtml(r.data_expiracao || '—')}</span>
        </div>`;
      }).join('');

      listEl.addEventListener("click", e => {
        const card = e.target.closest("[data-href]");
        if (card) window.location.href = card.dataset.href;
      });
      listEl.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          const card = e.target.closest("[data-href]");
          if (card) window.location.href = card.dataset.href;
        }
      });
    }
  } catch (err) {
    console.error("Erro ao carregar alertas:", err);
  }
}

// ── PLAN ALERTS ───────────────────────────────────────────────────────────────

async function loadPlanAlerts(teamFilter = "") {
  const elOverdue  = document.getElementById("planCountOverdue");
  const elCurrent  = document.getElementById("planCountCurrent");
  const elNext     = document.getElementById("planCountNext");
  const labelCur   = document.getElementById("planCurrentMonthLabel");
  const labelNext  = document.getElementById("planNextMonthLabel");
  const listEl     = document.getElementById("planCardList");
  if (!elOverdue && !elCurrent && !elNext && !listEl) return;

  const now          = new Date();
  const curMonthIdx  = now.getMonth();
  const nextMonthIdx = (curMonthIdx + 1) % 12;
  const curName      = MES_ORDER[curMonthIdx];
  const nextName     = MES_ORDER[nextMonthIdx];
  const pastMonths   = new Set(MES_ORDER.slice(0, curMonthIdx));

  if (labelCur)  labelCur.textContent  = curName;
  if (labelNext) labelNext.textContent = nextName;

  const team = teamFilter ? `&equipa=eq.${encodeURIComponent(teamFilter)}` : "";

  try {
    const rows = await fetch(
      `${SUPABASE_URL}/rest/v1/planeamento?select=equipa,email,codigo_certificacao,mes_certificacao,quarter&status=eq.Planeado${team}&limit=2000`,
      { headers: supabaseHeaders() }
    ).then(r => r.json());

    let overdue = 0, current = 0, next = 0;
    const overdueRows = [], currentRows = [], nextRows = [];

    rows.forEach(r => {
      const mes = (r.mes_certificacao || "").trim();
      if (mes === curName)          { current++;  currentRows.push(r); }
      else if (mes === nextName)    { next++;     nextRows.push(r); }
      else if (pastMonths.has(mes)) { overdue++;  overdueRows.push(r); }
    });

    if (elOverdue) elOverdue.textContent = overdue;
    if (elCurrent) elCurrent.textContent = current;
    if (elNext)    elNext.textContent    = next;

    if (listEl) {
      const allCards = [
        ...overdueRows.map(r => ({ r, cls: "danger",  label: "Overdue" })),
        ...currentRows.map(r => ({ r, cls: "warning", label: curName })),
        ...nextRows.map(r =>    ({ r, cls: "green",   label: nextName })),
      ];
      if (!allCards.length) {
        listEl.innerHTML = `<p class="alert-list-empty">Sem certificações planeadas pendentes.</p>`;
        return;
      }
      listEl.innerHTML = allCards.map(({ r, cls, label }) => {
        const href = `/Portal/planeamento?filter_email=${encodeURIComponent(r.email)}&filter_codigo_certificacao=${encodeURIComponent(r.codigo_certificacao)}`;
        return `<div class="alert-card alert-card--${cls}" data-href="${escapeHtml(href)}" role="button" tabindex="0">
          <span class="alert-card-badge alert-card-badge--${cls}">${escapeHtml(label)}</span>
          <span class="alert-card-equipa">${escapeHtml(r.equipa || '—')}</span>
          <span class="alert-card-email">${escapeHtml(r.email)}</span>
          <span class="alert-card-codigo">${escapeHtml(r.codigo_certificacao)}</span>
          <span class="alert-card-data">${escapeHtml(r.mes_certificacao || '—')}</span>
        </div>`;
      }).join('');

      listEl.addEventListener("click", e => {
        const card = e.target.closest("[data-href]");
        if (card) window.location.href = card.dataset.href;
      });
      listEl.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          const card = e.target.closest("[data-href]");
          if (card) window.location.href = card.dataset.href;
        }
      });
    }
  } catch (err) {
    console.error("Erro ao carregar alertas de planeamento:", err);
  }
}

// ── ALERT TEAM TILES ─────────────────────────────────────────────────────────

async function loadAlertTeams() {
  const container = document.getElementById("alertTeamTiles");
  if (!container) return;

  try {
    const [resCert, resPlan] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=equipa&expirado=not.is.true&limit=2000`, { headers: supabaseHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/planeamento?select=equipa&status=neq.Cancelado&limit=2000`, { headers: supabaseHeaders() })
    ]);

    const certRows = resCert.ok ? await resCert.json() : [];
    const planRows = resPlan.ok ? await resPlan.json() : [];

    const teamSet = new Set();
    [...certRows, ...planRows].forEach(r => {
      const t = (r.equipa || "").trim();
      if (t) teamSet.add(t);
    });
    const teams = [...teamSet].sort();

    const render = () => {
      container.innerHTML = teams.map(t =>
        `<button type="button" class="team-tile${alertTeamFilter === t ? " active" : ""}" data-alert-team="${escapeHtml(t)}">
          <span class="team-tile-name">${escapeHtml(t)}</span>
        </button>`
      ).join("");
    };
    render();

    container.addEventListener("click", e => {
      const tile = e.target.closest("[data-alert-team]");
      if (!tile) return;
      const team = tile.dataset.alertTeam;
      alertTeamFilter = alertTeamFilter === team ? "" : team;
      render();
      loadAlertCounters(alertTeamFilter);
      loadPlanAlerts(alertTeamFilter);
    });
  } catch (err) {
    console.error("Erro ao carregar equipas de alertas:", err);
  }
}

loadAlertTeams();
loadAlertCounters();
loadPlanAlerts();

// Navbar badge runs on every page (home page re-sets it inside loadHomeTotals)
(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const in15  = new Date(Date.now() + 15*24*60*60*1000).toISOString().slice(0, 10);
    const in30  = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 10);
    const valid = `expirado=not.is.true`;
    const hd = supabaseHeaders({ Prefer: "count=exact" });
    const parseCR = r => { const m = (r.headers.get("content-range")||"").match(/\/(\d+)$/); return m ? Number(m[1]) : 0; };
    const [r15, r30] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=email&${valid}&data_expiracao=gte.${today}&data_expiracao=lte.${in15}&limit=1`, { headers: hd }),
      fetch(`${SUPABASE_URL}/rest/v1/stay_certified?select=email&${valid}&data_expiracao=gt.${in15}&data_expiracao=lte.${in30}&limit=1`, { headers: hd })
    ]);
    setNavAlertBadge(parseCR(r15), parseCR(r30));
  } catch(e) { /* silently fail */ }
})();
