# Keepsake - Setup & Deployment Master Guide 🛠️

This guide provides the complete set of instructions to:
1. **[Build all targets](#1-building-all-targets)** (Shared library, Web app, Backend server, Chrome extension, Firefox extension, and Android mobile app).
2. **[Configure Google OAuth 2.0 & Google Drive](#2-configuring-google-oauth-20--google-drive)**.
3. **[Deploy on an Ubuntu Server](#3-setting-up-on-an-ubuntu-server)** (via Docker Compose with automated SSL or native systemd).
4. **[Completely uninstall from Ubuntu Server](#4-uninstalling-from-ubuntu-server)**.

---

## Prerequisites Overview

| Requirement | Recommended Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `v20.x LTS` (or `v18+`, `v25+`) | Building and running Web, Server, and Extensions |
| **npm** | `v9+` / `v10+` | Monorepo package management |
| **Docker & Compose** | Docker `24+`, Compose `v2+` | Production containerized deployment on Ubuntu |
| **Java JDK** | OpenJDK `17` | Building the Android APK |
| **Android SDK** | API 34 (Android 14) | Compiling the Android client |
| **Git** | Latest | Cloning and repository management |

---

## 1. Building All Targets

Keepsake is organized as an npm workspaces monorepo:
```
keepsake/
├── packages/shared     # Shared types, CRDT sync, search engine, utils
├── apps/web            # React SPA (4 views, reader mode, dark/light theme)
├── apps/server         # Node.js/Express backend & persistent store
├── apps/extension      # Chrome (MV3) and Firefox (WebExt) extensions
└── apps/android        # Native Android app with system Share Target
```

### 1.1 One-Command Monorepo Build (Web, Server, Extensions)

From the root of the repository:
```bash
# 1. Install all dependencies across all workspaces
npm install

# 2. Build all web/extension/server packages in sequence
npm run build
```
This builds:
- `@keepsake/shared` ➔ `packages/shared/dist/`
- `@keepsake/server` ➔ `apps/server/dist/`
- `@keepsake/web` ➔ `apps/web/dist/`
- `@keepsake/extension` ➔ `apps/extension/dist/chrome/` & `apps/extension/dist/firefox/`

---

### 1.2 Target-by-Target Builds

#### Target 1: Shared Core Package (`@keepsake/shared`)
Contains data models, search parser, OpenGraph helpers, and CRDT Last-Write-Wins (LWW) sync algorithms.
```bash
cd packages/shared
npm install
npm run build
```
*Output: `packages/shared/dist/`*

#### Target 2: Web Application (`@keepsake/web`)
The full-featured Raindrop-style frontend React application.
```bash
cd apps/web
npm install
npm run build
```
*Output: `apps/web/dist/` (static HTML, CSS, JavaScript bundles ready for production serving).*

#### Target 3: Backend API Server (`@keepsake/server`)
Express server providing metadata scraping, REST API, Google OAuth, and file-based atomic store persistence.
```bash
cd apps/server
npm install
npm run build
```
*Output: `apps/server/dist/` (`dist/index.js` and `dist/store.js`).*

#### Target 4: Google Chrome Extension (Manifest V3)
Compatible with Google Chrome, Brave, Microsoft Edge, Arc, and Opera.
```bash
cd apps/extension
npm install
npm run build:chrome
```
*Output: `apps/extension/dist/chrome/` containing `manifest.json`, background service worker, popup UI, and content script.*

**To Load in Chrome:**
1. Open Chrome and go to `chrome://extensions/`.
2. Toggle on **Developer mode** (top-right).
3. Click **Load unpacked** (top-left).
4. Select `keepsake/apps/extension/dist/chrome`.

#### Target 5: Mozilla Firefox Extension (WebExtension)
Compatible with Mozilla Firefox and Firefox Developer Edition.
```bash
cd apps/extension
npm install
npm run build:firefox
```
*Output: `apps/extension/dist/firefox/`.*

**To Load in Firefox:**
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `keepsake/apps/extension/dist/firefox/manifest.json`.

---

### 1.3 Target 6: Mobile Client (Android APK)

The Android app provides full bookmark browsing and a system-wide **Share Sheet target (`ACTION_SEND`)** so you can save links from Twitter/X, Reddit, Chrome, YouTube, or any Android app with one tap.

#### Prerequisites for Android Build:
1. **Install Java 17**:
   - **Ubuntu/Debian**:
     ```bash
     sudo apt update
     sudo apt install -y openjdk-17-jdk
     ```
   - **macOS**:
     ```bash
     brew install openjdk@17
     sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
     ```
   - **Windows**: Install OpenJDK 17 via [Adoptium Temurin](https://adoptium.net/).

2. **Android SDK Command Line Tools**:
   Ensure `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set in your environment:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS default
   # or export ANDROID_HOME=$HOME/Android/Sdk    # Linux default
   export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
   ```

#### Building the APK via Command Line (Gradle)
```bash
cd apps/android

# Make sure Gradle wrapper is executable
chmod +x gradlew

# Build Debug APK
./gradlew assembleDebug
```
*Output: `apps/android/app/build/outputs/apk/debug/app-debug.apk`*

#### Building via Android Studio:
1. Open Android Studio.
2. Select **Open an Existing Project** and navigate to `keepsake/apps/android`.
3. Wait for Gradle sync to complete.
4. Select **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

#### Installing on an Android Device:
Connect your phone with **USB Debugging** enabled, or run:
```bash
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
```
Or transfer the `app-debug.apk` directly to your phone via Google Drive, Telegram, email, or USB and open it with your device's Files app to install.

---

## 2. Configuring Google OAuth 2.0 & Google Drive

Keepsake uses Google Sign-In for authentication and syncs all bookmarks to the user's private Google Drive `appDataFolder`. This gives you complete data ownership with zero third-party cloud lock-in.

### Step 1: Create a Google Cloud Project
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account.
3. Click the project dropdown in the top navigation bar and select **New Project**.
4. Name your project (e.g., `Keepsake Self-Hosted`) and click **Create**.

### Step 2: Enable the Google Drive API
1. In the navigation sidebar, navigate to **APIs & Services > Library**.
2. Search for `Google Drive API`.
3. Select **Google Drive API** and click **Enable**.

### Step 3: Configure the OAuth Consent Screen
1. In the sidebar, navigate to **APIs & Services > OAuth consent screen**.
2. Under **User Type**, choose **External** (or **Internal** if you have a Google Workspace domain) and click **Create**.
3. Fill in the required fields:
   - **App name**: `Keepsake`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue**.
5. Under **Scopes**, click **Add or Remove Scopes**:
   - Filter and check the following scopes:
     - `.../auth/userinfo.profile` (Read user's name and picture)
     - `.../auth/userinfo.email` (Read user's email address)
     - `openid` (Authenticate user identity)
     - `https://www.googleapis.com/auth/drive.appdata` (*Required*: allows Keepsake to save the encrypted sync store to the user's private application data folder)
     - `https://www.googleapis.com/auth/drive.file` (*Optional*: allows manual HTML/JSON backup export to a visible Google Drive folder)
   - Click **Update** and then **Save and Continue**.
6. Under **Test Users**:
   - While your app is in "Testing" status, Google only allows explicit test accounts to log in.
   - Click **+ Add Users** and enter your Google account email address (and any family members' emails who will use your instance).
   - Click **Save and Continue**.

### Step 4: Create OAuth 2.0 Web Client Credentials
1. In the sidebar, navigate to **APIs & Services > Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Set **Name** to `Keepsake Web & Sync Client`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local development and testing)
   - `https://keepsake.yourdomain.com` (or `http://YOUR_SERVER_IP:3000` for your server)
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://keepsake.yourdomain.com/api/auth/google/callback` (or `http://YOUR_SERVER_IP:3000/api/auth/google/callback`)
7. Click **Create**.
8. A modal will display your **Client ID** and **Client Secret**. Keep this window open.

---

## 3. Setting Up on an Ubuntu Server

### Server Prerequisites
- Clean Ubuntu Server installation (20.04, 22.04, or 24.04 LTS).
- A domain or subdomain pointing to your server's public IP address (e.g. `keepsake.yourdomain.com`).
- Open ports: `80` (HTTP), `443` (HTTPS), and optional `3000` (Direct access).

```bash
# Update Ubuntu packages
sudo apt update && sudo apt upgrade -y

# Configure UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable
```

---

### Method A: Docker & Docker Compose (Recommended)

Docker provides an isolated, production-ready environment with automatic data persistence and automated SSL.

#### 1. Install Docker & Docker Compose Plugin
```bash
# Install Docker repository dependencies
sudo apt install -y ca-certificates curl gnupg

# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker apt repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker engine and compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable non-root docker execution
sudo usermod -aG docker $USER
newgrp docker
```

#### 2. Clone the Repository
```bash
git clone https://github.com/your-username/keepsake.git /home/ubuntu/keepsake
cd /home/ubuntu/keepsake
```

#### 3. Create Environment File (`.env`)
```bash
cp .env.example .env
nano .env
```
Fill in your Google OAuth credentials and server details:
```env
PORT=3000
NODE_ENV=production
DATA_DIR=/app/data

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=https://keepsake.yourdomain.com/api/auth/google/callback

# Allowed CORS origins
CORS_ORIGIN=*
```

#### 4. Configure Automated SSL (Let's Encrypt via Caddy)
Keepsake includes a pre-configured Caddy configuration.

Edit `deploy/Caddyfile`:
```caddy
keepsake.yourdomain.com {
    reverse_proxy keepsake:3000
}
```

In `deploy/docker-compose.yml`, uncomment the `caddy` service:
```yaml
  caddy:
    image: caddy:2-alpine
    container_name: keepsake_caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - keepsake
```

#### 5. Build and Start Keepsake
```bash
cd /home/ubuntu/keepsake/deploy

# Launch containers in the background
docker compose up -d --build
```

#### 6. Verify Deployment
Check the status of the containers:
```bash
docker compose ps
```
View server startup logs:
```bash
docker compose logs -f keepsake
```
Test health endpoint:
```bash
curl http://localhost:3000/api/health
# Returns: {"status":"ok","app":"Keepsake Server","version":"1.0.0",...}
```

Visit `https://keepsake.yourdomain.com` in your browser. Keepsake is live!

---

### Method B: Native Systemd Deployment (Without Docker)

If you prefer running directly on Ubuntu with Node.js:

#### 1. Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
```

#### 2. Clone & Build Keepsake
```bash
git clone https://github.com/your-username/keepsake.git /home/ubuntu/keepsake
cd /home/ubuntu/keepsake

# Install dependencies and build all targets
npm install
npm run build
```

#### 3. Configure `.env`
```bash
cp .env.example .env
nano .env
```
Ensure `DATA_DIR` is set to a persistent path:
```env
PORT=3000
NODE_ENV=production
DATA_DIR=/home/ubuntu/keepsake/data
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=https://keepsake.yourdomain.com/api/auth/google/callback
```

#### 4. Setup Systemd Service
```bash
sudo cp deploy/keepsake.service /etc/systemd/system/keepsake.service
sudo systemctl daemon-reload
sudo systemctl enable keepsake
sudo systemctl start keepsake
```

Check service status:
```bash
sudo systemctl status keepsake
```

#### 5. Setup Nginx Reverse Proxy with Certbot
```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Configure Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/keepsake
sudo nano /etc/nginx/sites-available/keepsake # Replace with your domain name
sudo ln -s /etc/nginx/sites-available/keepsake /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Request automated free SSL certificate
sudo certbot --nginx -d keepsake.yourdomain.com
```

---

## 4. Uninstalling from Ubuntu Server

If you ever wish to remove Keepsake from your Ubuntu server, follow the clean uninstall instructions below for your installation method.

> [!CAUTION]
> Uninstalling and removing the data directory or Docker volumes permanently deletes locally cached bookmarks and store files. Ensure you have exported a backup via the Keepsake web UI (**Settings > Backup > Export JSON/HTML**) or verified that your Google Drive sync is up to date before proceeding.

### 4.1 Uninstalling Docker-Based Deployment

#### Step 1: Stop and Remove Containers, Networks, and Volumes
Navigate to your deployment directory:
```bash
cd /home/ubuntu/keepsake/deploy

# Stop and remove containers and networks
docker compose down

# To also remove all persistent data (store.json, uploaded covers, Caddy SSL certs):
docker compose down -v
```

#### Step 2: Remove Keepsake Docker Images
```bash
# Remove Keepsake server image
docker rmi deploy-keepsake keepsake:latest 2>/dev/null || true

# Optional: clean up unused dangling images
docker image prune -f
```

#### Step 3: Remove Application Files
```bash
# Delete the repository and environment configurations
sudo rm -rf /home/ubuntu/keepsake
```

#### Step 4: Remove Reverse Proxy Configurations (if using standalone Nginx)
If you configured external Nginx:
```bash
sudo rm -f /etc/nginx/sites-enabled/keepsake
sudo rm -f /etc/nginx/sites-available/keepsake
sudo systemctl reload nginx

# Delete SSL certificates if no longer needed
sudo certbot delete --cert-name keepsake.yourdomain.com
```

#### Step 5 (Optional): Uninstall Docker
If Docker is no longer needed for any other applications on your server:
```bash
sudo apt purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
sudo rm -f /etc/apt/sources.list.d/docker.list
sudo rm -f /etc/apt/keyrings/docker.gpg
```

---

### 4.2 Uninstalling Systemd Native Deployment

#### Step 1: Stop and Disable the Systemd Service
```bash
# Stop running service
sudo systemctl stop keepsake

# Disable automatic start on boot
sudo systemctl disable keepsake
```

#### Step 2: Delete the Service File
```bash
# Remove service definition
sudo rm -f /etc/systemd/system/keepsake.service

# Reload systemd daemon
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

#### Step 3: Remove Nginx Site and SSL Certificate
```bash
sudo rm -f /etc/nginx/sites-enabled/keepsake
sudo rm -f /etc/nginx/sites-available/keepsake
sudo systemctl reload nginx

# Remove Let's Encrypt certificates
sudo certbot delete --cert-name keepsake.yourdomain.com
```

#### Step 4: Remove Keepsake Files & Data
```bash
# Remove project directory, source code, and data store
sudo rm -rf /home/ubuntu/keepsake
```

#### Step 5: Clean Up Firewall Rules (Optional)
If you opened port 3000 exclusively for Keepsake:
```bash
sudo ufw delete allow 3000/tcp
sudo ufw status
```

---

## 5. Client Connection Quick Reference

Once your server is running at `https://keepsake.yourdomain.com`:

### Web App
Navigate directly to `https://keepsake.yourdomain.com` in any modern browser.

### Chrome & Firefox Extensions
1. Click the Keepsake extension icon in your browser toolbar.
2. Click **⚙ Server Settings** at the bottom of the popup.
3. Set Server URL: `https://keepsake.yourdomain.com`.
4. Click **Save Settings**.
5. The extension will automatically sync with your collections.

### Android Client
1. Launch the **Keepsake** app on your phone.
2. In the connection prompt, enter: `https://keepsake.yourdomain.com`.
3. Tap **Connect** and **Sign in with Google**.
4. Test link ingestion: Open Chrome or Twitter on your phone, tap **Share**, and select **Keepsake**!
