# Google OAuth 2.0 & Google Drive Setup Guide for Keepsake

Keepsake uses Google OAuth 2.0 to authenticate users and synchronize bookmarks directly with their own Google Drive account (`appDataFolder` and optional backup folder).

Follow these quick steps to get your Google Client ID and Secret in 3 minutes.

---

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account.
3. Click the project dropdown in the top bar and select **New Project**.
4. Name your project (e.g. `Keepsake Bookmarks`) and click **Create**.

---

## 2. Enable Google Drive API

1. In the left navigation menu, go to **APIs & Services** > **Library**.
2. Search for `Google Drive API`.
3. Click **Google Drive API** and click the blue **Enable** button.

---

## 3. Configure the OAuth Consent Screen

1. In the left navigation menu, go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (or **Internal** if using Google Workspace) and click **Create**.
3. Fill in the App Information:
   - **App name**: `Keepsake`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue**.
5. Under **Scopes**, click **Add or Remove Scopes**:
   - Filter and select:
     - `.../auth/userinfo.profile`
     - `.../auth/userinfo.email`
     - `openid`
     - `https://www.googleapis.com/auth/drive.appdata` (Private application data sync)
     - `https://www.googleapis.com/auth/drive.file` (Optional backup export folder)
   - Click **Update** and then **Save and Continue**.
6. Under **Test Users**:
   - Click **Add Users** and add your Google email address.
   - Click **Save and Continue**.

---

## 4. Create OAuth 2.0 Client ID Credentials

1. In the left navigation menu, go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Name: `Keepsake Web & Sync Client`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local development)
   - `http://your-server-ip:3000` or `https://keepsake.yourdomain.com` (your Ubuntu server)
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/google/callback`
   - `http://your-server-ip:3000/api/auth/google/callback` or `https://keepsake.yourdomain.com/api/auth/google/callback`
7. Click **Create**.
8. A modal will pop up with your **Client ID** and **Client Secret**.

---

## 5. Configure Keepsake Environment Variables

Copy your credentials into your `.env` file on your Ubuntu server:

```env
PORT=3000
NODE_ENV=production

GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=https://keepsake.yourdomain.com/api/auth/google/callback
```

Restart your Keepsake container or service:
```bash
docker compose restart
```

You are now ready to log in with Google and have all your bookmarks sync to your private Google Drive!
