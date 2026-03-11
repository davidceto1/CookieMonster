# CookieMonster — Cookie Populator

## Goal

A one-click tool that injects a predefined set of cookies into Chrome for testing purposes.

---

## Chosen Approach: Chrome Extension

A Chrome Extension is the best fit because:
- It can set cookies for **any domain** (not just the current page's origin)
- Cookies appear immediately in DevTools → Application → Cookies
- No server or backend required — runs entirely in the browser
- Works on Windows, Mac, and Linux wherever Chrome is installed

A plain web app (`document.cookie`) is limited to cookies on its own origin, making it less useful for cross-domain testing scenarios.

---

## Architecture

```
CookieMonster/
├── plan.md
├── extension/
│   ├── manifest.json        # Chrome Extension v3 manifest
│   ├── popup.html           # Button UI shown when the extension icon is clicked
│   ├── popup.js             # Reads cookie config, calls chrome.cookies.set()
│   ├── popup.css            # Minimal styling
│   └── cookies.json         # Editable list of cookies (name, value, domain, path)
└── README.md                # How to load and use the extension
```

---

## Cookie Configuration (`cookies.json`)

Users edit this file to define which cookies to inject:

```json
[
  {
    "name": "session_id",
    "value": "abc123",
    "domain": "example.com",
    "path": "/",
    "secure": false,
    "httpOnly": false
  },
  {
    "name": "auth_token",
    "value": "eyJhbGciOiJIUzI1NiJ9",
    "domain": "example.com",
    "path": "/",
    "secure": true,
    "httpOnly": false
  }
]
```

---

## Features

- **Populate All** button — sets every cookie in `cookies.json` at once
- **Clear All** button — removes all cookies listed in `cookies.json`
- Status feedback — shows success/failure counts after each operation
- Cookie table — displays the configured cookies in the popup before injecting
- Editable config — just modify `cookies.json` and reload the extension

---

## How to Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. The CookieMonster icon appears in the toolbar — click it to open the popup

---

## Implementation Steps

1. [x] Write `plan.md`
2. [ ] Create `manifest.json` (Manifest V3, `cookies` permission)
3. [ ] Create `cookies.json` with sample test cookies
4. [ ] Build `popup.html` + `popup.css` (button, table, status area)
5. [ ] Build `popup.js` (load config, set/clear cookies via `chrome.cookies` API)
6. [ ] Write `README.md` with installation and usage instructions
7. [ ] Test the extension end-to-end in Chrome
8. [ ] Commit and push

---

## Permissions Required

```json
{
  "permissions": ["cookies"],
  "host_permissions": ["<all_urls>"]
}
```

`<all_urls>` is needed so the extension can set cookies for any domain the user configures.
