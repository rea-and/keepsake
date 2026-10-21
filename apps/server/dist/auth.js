import { Router } from 'express';
export const authRouter = Router();
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SCOPES = [
    'openid',
    'profile',
    'email',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file'
].join(' ');
/**
 * Returns OAuth status and client ID
 */
authRouter.get('/config', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    res.json({
        configured: Boolean(clientId && process.env.GOOGLE_CLIENT_SECRET),
        clientId
    });
});
/**
 * Redirects or returns Google OAuth consent URL
 */
authRouter.get('/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        return res.status(500).json({
            error: 'Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
        });
    }
    // Allow client redirect_uri override, or fallback to server env
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const defaultRedirect = `${protocol}://${host}/api/auth/google/callback`;
    const redirectUri = req.query.redirect_uri || process.env.GOOGLE_REDIRECT_URI || defaultRedirect;
    const state = req.query.state || 'keepsake-auth';
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state
    });
    const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
    if (req.query.format === 'json') {
        return res.json({ url: authUrl });
    }
    return res.redirect(authUrl);
});
/**
 * Google OAuth Callback
 */
authRouter.get('/google/callback', async (req, res) => {
    const { code, error, state } = req.query;
    if (error) {
        return res.status(400).send(`Google Login Error: ${error}`);
    }
    if (!code || typeof code !== 'string') {
        return res.status(400).send('Authorization code missing');
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).send('Google OAuth credentials not configured on server');
    }
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const defaultRedirect = `${protocol}://${host}/api/auth/google/callback`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirect;
    try {
        const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });
        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            return res.status(400).send(`Failed to exchange token with Google: ${err}`);
        }
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresIn = tokenData.expires_in || 3600;
        // Fetch user profile
        const userRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!userRes.ok) {
            return res.status(400).send('Failed to fetch user profile from Google');
        }
        const userData = await userRes.json();
        const user = {
            id: userData.sub,
            email: userData.email,
            name: userData.name || userData.email,
            picture: userData.picture,
            givenName: userData.given_name,
            familyName: userData.family_name
        };
        const authPayload = {
            user,
            tokens: {
                accessToken,
                refreshToken,
                expiresAt: Date.now() + expiresIn * 1000
            }
        };
        // Render a clean HTML page that passes auth payload back to opener window via postMessage or stores in localStorage and redirects to /
        const html = `<!DOCTYPE html>
<html>
<head>
  <title>Keepsake - Authentication Successful</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
    .card { text-align: center; background: #1e293b; padding: 2rem 3rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .spinner { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #3b82f6; border-radius: 50%; width: 36px; height: 36px; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Connecting Keepsake to Google Drive...</h2>
    <p>Authentication complete. Redirecting you to your bookmarks.</p>
  </div>
  <script>
    const payload = ${JSON.stringify(authPayload)};
    try {
      if (window.opener && window.opener !== window) {
        window.opener.postMessage({ type: 'KEEPSAKE_AUTH_SUCCESS', payload }, '*');
        setTimeout(() => window.close(), 600);
      } else {
        localStorage.setItem('keepsake_auth_session', JSON.stringify(payload));
        window.location.href = '/';
      }
    } catch(e) {
      localStorage.setItem('keepsake_auth_session', JSON.stringify(payload));
      window.location.href = '/';
    }
  </script>
</body>
</html>`;
        return res.send(html);
    }
    catch (err) {
        return res.status(500).send(`Authentication error: ${err.message}`);
    }
});
/**
 * Refreshes an expired access token using the refresh token
 */
authRouter.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Google OAuth credentials not configured on server' });
    }
    try {
        const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });
        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            return res.status(tokenRes.status).json({ error: `Refresh failed: ${err}` });
        }
        const data = await tokenRes.json();
        return res.json({
            accessToken: data.access_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
