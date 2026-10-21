# Keepsake Browser Extensions Guide (Chrome & Firefox)

Keepsake includes browser extensions for Google Chrome (and Chromium-based browsers: Brave, Edge, Arc, Opera) and Mozilla Firefox.

---

## 1. Features
- **One-Click Saving**: Click the extension icon to view a live preview, choose collection, add tags, and add notes.
- **Already-Saved Detection**: Detects if the current tab is already in Keepsake, showing a green checkmark and allowing instant editing or deletion.
- **Auto-Quote Notes**: Highlight any text on a webpage before opening the popup, and it is automatically added as a blockquote in your personal note!
- **Context Menus**:
  - Right-click any page: **"Save Page to Keepsake"**
  - Right-click any hyperlink: **"Save Link to Keepsake"**
  - Right-click highlighted text: **"Save Selection as Note in Keepsake"**
- **Keyboard Shortcut**: Press `Alt+Shift+S` (or customize in `chrome://extensions/shortcuts`) to save instantly without moving your hands from the keyboard.

---

## 2. Installing in Google Chrome / Brave / Edge

1. Build the extension if not already built:
   ```bash
   cd apps/extension
   npm run build:chrome
   ```
2. Open your browser and navigate to:
   - Chrome / Brave: `chrome://extensions`
   - Edge: `edge://extensions`
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left.
5. Select the directory:
   `/path/to/keepsake/apps/extension/dist/chrome`
6. Pin the Keepsake extension icon to your toolbar!

---

## 3. Installing in Mozilla Firefox

1. Build the Firefox bundle:
   ```bash
   cd apps/extension
   npm run build:firefox
   ```
2. Open Firefox and navigate to: `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file inside:
   `/path/to/keepsake/apps/extension/dist/firefox/manifest.json`.
5. The extension is now active in Firefox!

---

## 4. Configuration

1. Click the Keepsake extension icon.
2. Click **⚙ Server Settings** at the bottom of the popup.
3. Enter your Keepsake server URL (e.g. `https://keepsake.yourdomain.com` or `http://localhost:3000`).
4. Click **Save Settings**.
