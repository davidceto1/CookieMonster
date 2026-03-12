const STATUS_DURATION_MS = 3000;

// ── State ─────────────────────────────────────────────────────────────────────
let state = { environments: {}, activeEnvironment: "" };

async function loadState() {
  const stored = await chrome.storage.local.get(["environments", "activeEnvironment", "importedCookies"]);
  if (stored.environments) {
    state = {
      environments: stored.environments,
      activeEnvironment: stored.activeEnvironment || Object.keys(stored.environments)[0],
    };
  } else {
    // Migration from old flat format or first run
    let defaultCookies;
    if (stored.importedCookies) {
      defaultCookies = stored.importedCookies;
      await chrome.storage.local.remove("importedCookies");
    } else {
      const url = chrome.runtime.getURL("cookies.json");
      const response = await fetch(url);
      defaultCookies = await response.json();
    }
    state = { environments: { Default: defaultCookies }, activeEnvironment: "Default" };
    await saveState();
  }
}

async function saveState() {
  await chrome.storage.local.set({
    environments: state.environments,
    activeEnvironment: state.activeEnvironment,
  });
}

function getActiveCookies() {
  return state.environments[state.activeEnvironment] || [];
}

function setActiveCookies(cookies) {
  state.environments[state.activeEnvironment] = cookies;
}

// ── Validation / IO ───────────────────────────────────────────────────────────
function validateCookieArray(data, label) {
  if (!Array.isArray(data)) throw new Error(`${label} must be an array.`);
  if (data.length === 0) throw new Error(`${label} is empty.`);
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (typeof c !== "object" || c === null || Array.isArray(c))
      throw new Error(`${label} item ${i} is not an object.`);
    if (typeof c.name !== "string" || !c.name.trim())
      throw new Error(`${label} item ${i} missing required string field "name".`);
    if (typeof c.value !== "string")
      throw new Error(`${label} item ${i} missing required string field "value".`);
    if (typeof c.domain !== "string" || !c.domain.trim())
      throw new Error(`${label} item ${i} missing required string field "domain".`);
  }
}

function validateImport(data) {
  if (Array.isArray(data)) {
    // Legacy flat array format — treat as single environment
    validateCookieArray(data, "Cookie array");
    return { type: "legacy", cookies: data };
  }
  if (typeof data === "object" && data !== null) {
    // Environments object format
    const envNames = Object.keys(data);
    if (envNames.length === 0) throw new Error("Environments object is empty.");
    for (const name of envNames) {
      validateCookieArray(data[name], `Environment "${name}"`);
    }
    return { type: "environments", environments: data };
  }
  throw new Error("JSON must be an environments object or a cookie array.");
}

function exportCookies() {
  const json = JSON.stringify(state.environments, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cookies.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importCookies(onSuccess) {
  const fileInput = document.getElementById("file-input");
  fileInput.value = "";
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = validateImport(data);
      onSuccess(result);
    } catch (err) {
      showStatus("Import failed: " + err.message, "error");
    }
  };
  fileInput.click();
}

async function readFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) throw new Error("No active tab found.");
  const chromeCookies = await chrome.cookies.getAll({ url: tab.url });
  if (chromeCookies.length === 0) throw new Error("No cookies found for this tab.");
  return chromeCookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith(".") ? c.domain.slice(1) : c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
  }));
}

// ── Cookie operations ─────────────────────────────────────────────────────────
function buildUrl(cookie) {
  const scheme = cookie.secure ? "https" : "http";
  return `${scheme}://${cookie.domain}${cookie.path || "/"}`;
}

async function populateCookies(cookies) {
  let ok = 0;
  let fail = 0;
  const errors = [];
  for (const cookie of cookies) {
    const url = buildUrl(cookie);
    const details = {
      url,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false,
      sameSite: (cookie.sameSite || "lax").toLowerCase(),
    };
    try {
      const result = await chrome.cookies.set(details);
      if (result) {
        ok++;
      } else {
        fail++;
        const reason = chrome.runtime.lastError?.message || "cookies.set returned null";
        errors.push({ name: cookie.name, url, reason });
      }
    } catch (err) {
      fail++;
      errors.push({ name: cookie.name, url, reason: err.message });
    }
  }
  showErrors(errors);
  return { ok, fail };
}

async function clearCookies(cookies) {
  let ok = 0;
  let fail = 0;
  for (const cookie of cookies) {
    const details = { url: buildUrl(cookie), name: cookie.name };
    try {
      const result = await chrome.cookies.remove(details);
      if (result) { ok++; } else { fail++; }
    } catch (err) {
      fail++;
      console.error("Error removing cookie:", cookie.name, err);
    }
  }
  return { ok, fail };
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showStatus(message, type) {
  const el = document.getElementById("status");
  const msg = document.getElementById("status-message");
  el.className = `status ${type}`;
  msg.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, STATUS_DURATION_MS);
}

function showErrors(errors) {
  const section = document.getElementById("error-details");
  const list = document.getElementById("error-list");
  list.innerHTML = "";
  if (errors.length === 0) { section.hidden = true; return; }
  for (const { name, url, reason } of errors) {
    const li = document.createElement("li");
    li.textContent = `${name} (${url}): ${reason}`;
    list.appendChild(li);
  }
  section.hidden = false;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function renderEnvBar() {
  const select = document.getElementById("env-select");
  select.innerHTML = "";
  for (const name of Object.keys(state.environments)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === state.activeEnvironment) option.selected = true;
    select.appendChild(option);
  }
  document.getElementById("btn-delete-env").disabled = Object.keys(state.environments).length <= 1;
}

function renderTable(cookies, onEdit) {
  const tbody = document.getElementById("cookie-tbody");
  tbody.innerHTML = "";
  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i];
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.className = "name editable";
    nameTd.contentEditable = "true";
    nameTd.textContent = c.name;
    nameTd.addEventListener("blur", () => {
      const val = nameTd.textContent.trim();
      if (!val) { nameTd.textContent = cookies[i].name; return; }
      cookies[i] = { ...cookies[i], name: val };
      onEdit?.();
    });
    nameTd.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameTd.blur(); }
    });

    const valueTd = document.createElement("td");
    valueTd.className = "editable";
    valueTd.contentEditable = "true";
    valueTd.title = c.value;
    valueTd.textContent = truncate(c.value, 22);
    valueTd.addEventListener("focus", () => { valueTd.textContent = cookies[i].value; });
    valueTd.addEventListener("blur", () => {
      const val = valueTd.textContent;
      cookies[i] = { ...cookies[i], value: val };
      valueTd.title = val;
      valueTd.textContent = truncate(val, 22);
      onEdit?.();
    });
    valueTd.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); valueTd.blur(); }
    });

    const domainTd = document.createElement("td");
    domainTd.title = c.domain;
    domainTd.textContent = c.domain;

    const secureTd = document.createElement("td");
    secureTd.className = c.secure ? "secure-yes" : "secure-no";
    secureTd.textContent = c.secure ? "Yes" : "No";

    tr.append(nameTd, valueTd, domainTd, secureTd);
    tbody.appendChild(tr);
  }
}

function setButtonsDisabled(disabled) {
  ["btn-populate", "btn-clear", "btn-read-tab", "btn-export", "btn-import",
   "btn-add-env", "btn-delete-env", "env-select"].forEach(id => {
    document.getElementById(id).disabled = disabled;
  });
  if (!disabled) {
    // Re-apply delete disabled state based on env count
    document.getElementById("btn-delete-env").disabled = Object.keys(state.environments).length <= 1;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    await loadState();
  } catch (err) {
    showStatus("Failed to load: " + err.message, "error");
    return;
  }

  let cookies = getActiveCookies();

  const saveCookies = () => {
    setActiveCookies(cookies);
    return saveState();
  };

  renderEnvBar();
  renderTable(cookies, saveCookies);

  // Environment selector
  document.getElementById("env-select").addEventListener("change", (e) => {
    state.activeEnvironment = e.target.value;
    saveState();
    cookies = getActiveCookies();
    renderTable(cookies, saveCookies);
    showErrors([]);
  });

  // Add environment
  document.getElementById("btn-add-env").addEventListener("click", () => {
    const name = prompt("New environment name:")?.trim();
    if (!name) return;
    if (state.environments[name]) {
      showStatus(`"${name}" already exists.`, "error");
      return;
    }
    state.environments[name] = JSON.parse(JSON.stringify(getActiveCookies()));
    state.activeEnvironment = name;
    saveState();
    cookies = getActiveCookies();
    renderEnvBar();
    renderTable(cookies, saveCookies);
    showStatus(`Environment "${name}" created (cloned from current).`, "success");
  });

  // Delete environment
  document.getElementById("btn-delete-env").addEventListener("click", () => {
    const envNames = Object.keys(state.environments);
    if (envNames.length <= 1) return;
    if (!confirm(`Delete environment "${state.activeEnvironment}"?`)) return;
    const deleted = state.activeEnvironment;
    state.activeEnvironment = envNames.find(n => n !== deleted);
    delete state.environments[deleted];
    saveState();
    cookies = getActiveCookies();
    renderEnvBar();
    renderTable(cookies, saveCookies);
    showErrors([]);
    showStatus(`Environment "${deleted}" deleted.`, "success");
  });

  // Populate
  document.getElementById("btn-populate").addEventListener("click", async () => {
    setButtonsDisabled(true);
    showStatus("Setting cookies…", "info");
    const { ok, fail } = await populateCookies(cookies);
    setButtonsDisabled(false);
    if (fail === 0) {
      showErrors([]);
      showStatus(`${ok} cookie${ok !== 1 ? "s" : ""} set successfully.`, "success");
    } else {
      showStatus(`${ok} set, ${fail} failed. See errors below.`, "error");
    }
  });

  // Clear
  document.getElementById("btn-clear").addEventListener("click", async () => {
    setButtonsDisabled(true);
    showStatus("Clearing cookies…", "info");
    const { ok, fail } = await clearCookies(cookies);
    setButtonsDisabled(false);
    if (fail === 0) {
      showStatus(`${ok} cookie${ok !== 1 ? "s" : ""} cleared.`, "success");
    } else {
      showStatus(`${ok} cleared, ${fail} failed. Check the console for details.`, "error");
    }
  });

  // Read from tab
  document.getElementById("btn-read-tab").addEventListener("click", async () => {
    setButtonsDisabled(true);
    try {
      const tabCookies = await readFromTab();
      cookies = tabCookies;
      await saveCookies();
      renderTable(cookies, saveCookies);
      showErrors([]);
      showStatus(`Read ${cookies.length} cookie${cookies.length !== 1 ? "s" : ""} from current tab.`, "success");
    } catch (err) {
      showStatus("Read failed: " + err.message, "error");
    }
    setButtonsDisabled(false);
  });

  // Export
  document.getElementById("btn-export").addEventListener("click", () => {
    exportCookies();
  });

  // Import
  document.getElementById("btn-import").addEventListener("click", () => {
    importCookies((result) => {
      if (result.type === "environments") {
        state.environments = result.environments;
        const envNames = Object.keys(result.environments);
        state.activeEnvironment = envNames[0];
        cookies = getActiveCookies();
        saveState();
        renderEnvBar();
        renderTable(cookies, saveCookies);
        showErrors([]);
        showStatus(`Imported ${envNames.length} environment${envNames.length !== 1 ? "s" : ""}.`, "success");
      } else {
        cookies = result.cookies;
        saveCookies();
        renderTable(cookies, saveCookies);
        showErrors([]);
        showStatus(`Imported ${cookies.length} cookie${cookies.length !== 1 ? "s" : ""}.`, "success");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
