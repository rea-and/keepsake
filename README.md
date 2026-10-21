# Keepsake 📑

> **A self-hosted, Google Drive-synced Raindrop.io alternative.**  
> Complete with a web app for Ubuntu servers, an Android client with system-wide link ingestion, and browser extensions for Chrome and Firefox.

---

## 📖 Complete Setup & Deployment Guide

For end-to-end instructions covering **all targets**, **Google configuration**, **Ubuntu deployment**, and **clean uninstallation**, see:

👉 **[SETUP.md](SETUP.md)**
- **[Building All Targets](SETUP.md#1-building-all-targets)** (Web, Server, Extensions, Android APK)
- **[Google OAuth 2.0 & Google Drive Configuration](SETUP.md#2-configuring-google-oauth-20--google-drive)**
- **[Ubuntu Server Setup (Docker & Systemd)](SETUP.md#3-setting-up-on-an-ubuntu-server)**
- **[Uninstalling from Ubuntu Server](SETUP.md#4-uninstalling-from-ubuntu-server)**
- **[Client Connection Quick Reference](SETUP.md#5-client-connection-quick-reference)**

---

## ✨ Features

- **Raindrop.io-Style Visual Hierarchy & Views:**
  - 🔲 **Cards View**: Rich preview cards with cover imagery, domain favicon, excerpt, and tag chips.
  - ☰ **List View**: High information density horizontal rows for fast skimming.
  - 📄 **Headlines View**: Clean, compact text view for rapid reading.
  - 🖼️ **Moodboard View**: Pinterest-style masonry grid prioritizing photography and visual covers.
- **Deep Organization:**
  - System collections: *All Bookmarks*, *Unsorted Inbox*, *Favorites*, and *Trash*.
  - Custom collections with custom color badges, icons, and per-collection default view modes.
  - Tag management with counts, multi-tag filtering, and autocomplete.
  - Bulk actions bar: multi-select bookmarks to move, tag, favorite, or delete.
- **Omnisearch with Operator Syntax:**
  - Fast instant search across titles, URLs, snippets, notes, and tags.
  - Advanced search syntax: `#tag`, `site:domain.com`, `is:favorite`, `type:article`, `has:note`.
- **Distraction-Free Reader Mode:**
  - Extracts clean article text and media using Readability.
  - Customizable reading typography: Font size (Small, Medium, Large, XL), font family (Sans, Serif, Mono), and reading theme (Light, Sepia, Dark).
- **Google Login & Google Drive Cloud Sync:**
  - Authenticate using Google OAuth 2.0.
  - Zero lock-in: All data is saved and synced directly to the user's private Google Drive `appDataFolder` using CRDT Last-Write-Wins conflict resolution with tombstone tracking.
  - Optional visible backup exports to a `Keepsake/` Google Drive folder.
- **Cross-Platform Clients:**
  - 🌐 **Web App**: Production React SPA with instant 0ms offline-first caching and neutral dark/light themes.
  - 🐧 **Ubuntu Server Deployable**: Ready-to-go Docker Compose and Caddy/Nginx reverse proxy setups with automated SSL.
  - 📱 **Android Client**: Native Android application with system Share Target (`ACTION_SEND`) to ingest links from any app (Chrome, Twitter/X, Reddit, YouTube).
  - 🧩 **Chrome Extension**: Manifest V3 extension with live card previews, tag autocomplete, notes, and context menus.
  - 🦊 **Firefox Extension**: Firefox WebExtension with full feature parity.
- **Import & Export:**
  - Netscape HTML format supported (Chrome, Safari, Firefox, Pocket, Raindrop).
  - Full JSON backup and restore.

---

## 🏛 Architecture

```mermaid
flowchart TD
    subgraph Clients["Clients"]
        Web["Web Client (React / Vite)"]
        Android["Android Client (Native Ingest + WebView)"]
        ChromeExt["Chrome Extension (MV3)"]
        FirefoxExt["Firefox Extension (WebExt)"]
    end

    subgraph Server["Keepsake Ubuntu Server (:3000)"]
        Express["Express API Server"]
        ServerStore["Persistent JSON Store (data/store.json)"]
        Scraper["OpenGraph & Readability Scraper"]
        AuthRouter["Google OAuth 2.0 Service"]
        StaticServe["SPA Static Delivery"]
    end

    subgraph GoogleCloud["Google Cloud & Drive"]
        GoogleOAuth["Google Identity Services"]
        GoogleDrive["User's Google Drive (appDataFolder)"]
    end

    Web -->|HTTP REST & Sync| Express
    Android -->|System Share Target / API| Express
    ChromeExt -->|Ingest & Sync| Express
    FirefoxExt -->|Ingest & Sync| Express

    Express --> ServerStore
    Express -->|Link Scraping| Scraper
    Express -->|Token Exchange| GoogleOAuth
    Clients -->|Direct Cloud Sync| GoogleDrive
```

---

## 📂 Repository Structure

```
keepsake/
├── SETUP.md                  # Comprehensive setup, build, deploy & uninstall guide
├── packages/
│   └── shared/               # Shared TypeScript models, CRDT sync, search parser, utils
├── apps/
│   ├── server/               # Node.js/Express backend (scraping, OAuth, persistent store, static host)
│   ├── web/                  # Raindrop-clone React SPA (4 views, reader mode, tags, instant search)
│   ├── android/              # Native Android project with Share Target intent filter
│   └── extension/            # Cross-browser extensions (dist/chrome and dist/firefox)
├── deploy/                   # Ubuntu deployment assets (Dockerfile, docker-compose.yml, Caddyfile, systemd)
├── docs/                     # Additional reference guides
│   ├── GOOGLE_OAUTH_SETUP.md # Google Cloud OAuth reference
│   ├── UBUNTU_DEPLOYMENT_GUIDE.md # Ubuntu deployment reference
│   ├── ANDROID_SETUP_GUIDE.md # Android client installation reference
│   └── EXTENSIONS_GUIDE.md   # Chrome and Firefox extensions installation reference
└── package.json              # Monorepo configuration
```

---

## 🚀 Quick Start (Local Development)

### 1. Build All Packages
```bash
git clone https://github.com/your-username/keepsake.git
cd keepsake

# Install and build all workspaces in one command
npm install
npm run build
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env
```
*(See [SETUP.md - Section 2](SETUP.md#2-configuring-google-oauth-20--google-drive) for details on generating credentials).*

### 3. Run Server
```bash
npm --workspace=@keepsake/server run start
```
Open [http://localhost:3000](http://localhost:3000) in your browser!

---

## 🐧 Ubuntu Server Deployment (Quick Summary)

See **[SETUP.md](SETUP.md#3-setting-up-on-an-ubuntu-server)** for complete instructions.

Quick launch with Docker Compose:
```bash
cd deploy
docker compose up -d --build
```

---

## 📱 Android Client (Quick Summary)

See **[SETUP.md](SETUP.md#13-target-6-mobile-client-android-apk)** for prerequisites and build instructions.

```bash
cd apps/android
./gradlew assembleDebug
```
The APK is generated at `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Install on your phone to share links directly from any app to Keepsake!

---

## 🧩 Browser Extensions (Chrome & Firefox)

See **[SETUP.md](SETUP.md#target-4-google-chrome-extension-manifest-v3)**.

- **Chrome / Brave / Edge**: Open `chrome://extensions`, enable *Developer Mode*, and click *Load unpacked* pointing to `apps/extension/dist/chrome`.
- **Firefox**: Open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on*, and select `apps/extension/dist/firefox/manifest.json`.

---

## 📄 License
MIT License. Created for the Keepsake project.
