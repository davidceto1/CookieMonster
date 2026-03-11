# CookieMonster

A Chrome Extension that populates a predefined set of cookies with one click — built for testing.

---

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository
5. The CookieMonster icon will appear in your Chrome toolbar

> If you don't see the icon, click the puzzle-piece Extensions menu and pin CookieMonster.

---

## Usage

1. Click the **CookieMonster** icon in the Chrome toolbar
2. The popup shows all cookies that are configured in `cookies.json`
3. Click **Populate All Cookies** to inject all cookies into Chrome
4. Click **Clear All Cookies** to remove them
5. Verify in DevTools → **Application** → **Cookies** → select the domain

---

## Configuring Your Test Cookies

Edit `extension/cookies.json` to define the cookies you want to inject:

```json
[
  {
    "name": "session_id",
    "value": "abc123",
    "domain": "example.com",
    "path": "/",
    "secure": false,
    "httpOnly": false,
    "sameSite": "Lax"
  }
]
```

| Field      | Type    | Description                                              |
|------------|---------|----------------------------------------------------------|
| `name`     | string  | Cookie name                                              |
| `value`    | string  | Cookie value                                             |
| `domain`   | string  | Domain to set the cookie on (e.g. `example.com`)        |
| `path`     | string  | Cookie path (default `/`)                                |
| `secure`   | boolean | If `true`, cookie is HTTPS-only                         |
| `httpOnly` | boolean | If `true`, cookie is not accessible via JavaScript      |
| `sameSite` | string  | `"Strict"`, `"Lax"`, or `"None"`                        |

After editing `cookies.json`, go to `chrome://extensions` and click the **reload** button on the CookieMonster card to pick up the changes.

---

## Notes

- Cookies are set for the domain specified in `cookies.json`, not the currently open tab
- `secure: true` cookies require the `https://` scheme — Chrome will silently ignore them on HTTP pages
- `sameSite: "None"` requires `secure: true`
- The extension requires the `cookies` permission and `<all_urls>` host permission to set cookies on any domain

---

## Project Structure

```
CookieMonster/
├── plan.md                  # Original design plan
├── README.md                # This file
└── extension/
    ├── manifest.json        # Chrome Extension v3 manifest
    ├── cookies.json         # Your test cookie definitions
    ├── popup.html           # Extension popup UI
    ├── popup.css            # Popup styles
    └── popup.js             # Cookie set/clear logic
```
