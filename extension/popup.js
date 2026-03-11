const STATUS_DURATION_MS = 3000;

async function loadCookies() {
  const stored = await chrome.storage.local.get("importedCookies");
  if (stored.importedCookies) {
    return stored.importedCookies;
  }
  const url = chrome.runtime.getURL("cookies.json");
  const response = await fetch(url);
  return response.json();
}

function validateCookies(data) {
  if (!Array.isArray(data)) throw new Error("JSON must be an array.");
  if (data.length === 0) throw new Error("Cookie array is empty.");
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (typeof c !== "object" || c === null || Array.isArray(c))
      throw new Error(`Item ${i} is not an object.`);
    if (typeof c.name !== "string" || !c.name.trim())
      throw new Error(`Item ${i} missing required string field "name".`);
    if (typeof c.value !== "string")
      throw new Error(`Item ${i} missing required string field "value".`);
    if (typeof c.domain !== "string" || !c.domain.trim())
      throw new Error(`Item ${i} missing required string field "domain".`);
  }
}

function exportCookies(cookies) {
  const json = JSON.stringify(cookies, null, 2);
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
      validateCookies(data);
      await chrome.storage.local.set({ importedCookies: data });
      onSuccess(data);
    } catch (err) {
      showStatus("Import failed: " + err.message, "error");
    }
  };
  fileInput.click();
}

function buildUrl(cookie) {
  const scheme = cookie.secure ? "https" : "http";
  return `${scheme}://${cookie.domain}${cookie.path || "/"}`;
}

function showStatus(message, type) {
  const el = document.getElementById("status");
  const msg = document.getElementById("status-message");
  el.className = `status ${type}`;
  msg.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.hidden = true;
  }, STATUS_DURATION_MS);
}

function renderTable(cookies) {
  const tbody = document.getElementById("cookie-tbody");
  tbody.innerHTML = "";
  for (const c of cookies) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="name" title="${c.name}">${c.name}</td>
      <td title="${c.value}">${truncate(c.value, 22)}</td>
      <td title="${c.domain}">${c.domain}</td>
      <td class="${c.secure ? "secure-yes" : "secure-no"}">${c.secure ? "Yes" : "No"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function showErrors(errors) {
  const section = document.getElementById("error-details");
  const list = document.getElementById("error-list");
  list.innerHTML = "";
  if (errors.length === 0) {
    section.hidden = true;
    return;
  }
  for (const { name, url, reason } of errors) {
    const li = document.createElement("li");
    li.textContent = `${name} (${url}): ${reason}`;
    list.appendChild(li);
  }
  section.hidden = false;
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
    const details = {
      url: buildUrl(cookie),
      name: cookie.name,
    };
    try {
      const result = await chrome.cookies.remove(details);
      if (result) {
        ok++;
      } else {
        fail++;
      }
    } catch (err) {
      fail++;
      console.error("Error removing cookie:", cookie.name, err);
    }
  }
  return { ok, fail };
}

function setButtonsDisabled(disabled) {
  document.getElementById("btn-populate").disabled = disabled;
  document.getElementById("btn-clear").disabled = disabled;
  document.getElementById("btn-export").disabled = disabled;
  document.getElementById("btn-import").disabled = disabled;
}

async function init() {
  let cookies;
  try {
    cookies = await loadCookies();  // let (not const) so import can reassign
  } catch (err) {
    showStatus("Failed to load cookies.json: " + err.message, "error");
    return;
  }

  renderTable(cookies);

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

  document.getElementById("btn-export").addEventListener("click", () => {
    exportCookies(cookies);
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    importCookies((newCookies) => {
      cookies = newCookies;
      renderTable(cookies);
      showErrors([]);
      showStatus(`Imported ${cookies.length} cookie${cookies.length !== 1 ? "s" : ""}.`, "success");
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
