# Deploying Keepsake on an Ubuntu Server

This guide provides step-by-step instructions to deploy Keepsake on an Ubuntu server (20.04, 22.04, or 24.04 LTS).

---

## Method 1: Docker & Docker Compose (Recommended)

Docker provides an isolated, reliable environment with zero dependency issues.

### 1. Install Docker & Docker Compose on Ubuntu

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker engine & compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

---

### 2. Clone Keepsake & Configure Environment

```bash
# Clone the repository
git clone https://github.com/your-username/keepsake.git /home/ubuntu/keepsake
cd /home/ubuntu/keepsake

# Copy environment template
cp .env.example .env

# Edit .env with your Google OAuth credentials and domain
nano .env
```

Set your configuration:
```env
PORT=3000
NODE_ENV=production
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://keepsake.yourdomain.com/api/auth/google/callback
# Google accounts allowed to sign in (comma-separated). Required.
KEEPSAKE_ALLOWED_EMAILS=you@gmail.com
```

---

### 3. Launch Keepsake

Run Compose from the repository root, so the same `.env` configures both the container and the compose file:

```bash
cd /home/ubuntu/keepsake

# Build and start the container in the background
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

Check logs to verify startup:
```bash
docker compose --env-file .env -f deploy/docker-compose.yml logs -f
```

Your server is now listening on port 3000 of the server (bound to `127.0.0.1`, so it is reached through a reverse proxy). Google sign-in needs HTTPS, so continue with the next section before signing in.

---

## Automated HTTPS Setup with Caddy or Nginx

### Option A: Automatic SSL via Caddy (Easiest)

Caddy automatically obtains and renews free SSL certificates from Let's Encrypt with 0 manual steps.

1. Point a DNS record for your domain at this server, and make sure ports 80 and 443 are reachable.
2. Add the domain to `.env` (Docker only), and set the matching Google redirect URI:
```env
KEEPSAKE_DOMAIN=keepsake.yourdomain.com
GOOGLE_REDIRECT_URI=https://keepsake.yourdomain.com/api/auth/google/callback
```
3. Start with the bundled Caddy service (it is a compose profile, so nothing to uncomment):
```bash
docker compose --env-file .env -f deploy/docker-compose.yml --profile caddy up -d --build
```

---

### Option B: Nginx Reverse Proxy with Certbot

If you already use Nginx on your Ubuntu server:

```bash
# Copy Nginx configuration
sudo cp deploy/nginx.conf /etc/nginx/sites-available/keepsake

# Edit server_name to match your domain
sudo nano /etc/nginx/sites-available/keepsake

# Enable site
sudo ln -s /etc/nginx/sites-available/keepsake /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain free SSL with Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d keepsake.yourdomain.com
```

---

## Method 2: Native Node.js Deployment with Systemd

If you prefer running without Docker:

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# Clone and build
git clone https://github.com/your-username/keepsake.git /home/ubuntu/keepsake
cd /home/ubuntu/keepsake
npm install
npm run build

# Configure systemd service
sudo cp deploy/keepsake.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable keepsake
sudo systemctl start keepsake

# Check status
sudo systemctl status keepsake
```

---

## Firewall (UFW) Configuration

Allow SSH, HTTP, and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp # (Optional: for direct port access)
sudo ufw enable
```

---

## Updating Keepsake

On the server, run the deploy script from the repository root. It pulls the latest code, installs dependencies if they changed, restarts the `keepsake` systemd unit (or Docker Compose when no unit exists) and waits for `/api/health`:

```bash
cd /home/ubuntu/keepsake
./deploy.sh            # add --build to rebuild dist/ on the server
```

To update a Docker deployment by hand:

```bash
cd /home/ubuntu/keepsake
git pull
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

### Troubleshooting a Docker deployment

- **`permission denied ... docker.sock`**: your user is not allowed to use Docker. Run `sudo usermod -aG docker $USER`, then `newgrp docker` (or log out and in). Do not run `./deploy.sh` with `sudo`; that would run `git pull` as root.
- **"Authentication error" after choosing a Google account**: the server could not save the new session. The container runs as an unprivileged user, and a data volume created by an older (root) image must be handed over to it. The image's entrypoint does this automatically; to do it once by hand: `docker exec -u root keepsake chown -R node:node /app/data`. Then check `docker logs keepsake --tail 30` for the exact error.
- **Your data is kept** across updates: Compose names the project after the `deploy` folder, so the same `keepsake_data` volume is reused.
