import { Router, Request, Response } from 'express';
import { SessionStore, isEmailAllowed } from './sessions.js';
import { LoginFlowStore, isValidChallenge, parseFlow } from './loginFlow.js';
import { describeClient } from './clientLabel.js';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const jsonForInlineScript = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

export interface AuthDeps {
  sessions: SessionStore;
  allowedEmails: string[];
  /** Overridable in tests. */
  flows?: LoginFlowStore<AndroidLogin>;
}

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  givenName?: string;
  familyName?: string;
}

interface AndroidLogin {
  user: GoogleUser;
  label?: string;
  googleRefreshToken?: string;
}

const STATE_COOKIE = 'keepsake_oauth_state';

const readCookie = (req: Request, name: string): string | undefined => {
  for (const part of (req.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
};

const isHttps = (req: Request) => req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';

const pageStyles = `body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
    .card { text-align: center; background: #1e293b; padding: 2rem 3rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 420px; }
    .btn { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #38bdf8; color: #000; font-weight: 600; text-decoration: none; border-radius: 0.75rem; font-size: 0.9rem; }`;

export function createAuthRouter({ sessions, allowedEmails, flows = new LoginFlowStore<AndroidLogin>() }: AuthDeps): Router {
  const authRouter = Router();

  const redirectUriFor = (req: Request) => {
    const defaultRedirect = `${isHttps(req) ? 'https' : 'http'}://${req.get('host')}/api/auth/google/callback`;
    return process.env.GOOGLE_REDIRECT_URI || defaultRedirect;
  };

  /**
   * Returns OAuth status and client ID
   */
  authRouter.get('/config', (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    res.json({
      configured: Boolean(clientId && process.env.GOOGLE_CLIENT_SECRET),
      clientId
    });
  });

  /**
   * Starts a Google sign-in. `state` names the client flow (web, extension, android).
   * The Android app also sends the PKCE `challenge` for the one-time code it will redeem.
   */
  authRouter.get('/google/url', (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({
        error: 'Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
      });
    }

    const flow = parseFlow(req.query.state);
    const challenge = req.query.challenge;
    if (flow === 'android' && !isValidChallenge(challenge)) {
      return res.status(400).json({ error: 'The Android sign-in needs a PKCE challenge' });
    }

    // The nonce is bound to this browser by an httpOnly cookie and checked in the callback.
    const nonce = flows.begin(flow, flow === 'android' ? (challenge as string) : undefined);
    res.cookie(STATE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax', secure: isHttps(req), maxAge: 10 * 60 * 1000, path: '/api/auth/google' });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUriFor(req),
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: `${flow}.${nonce}`
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
  authRouter.get('/google/callback', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });
    const fail = (status: number, message: string) => res.status(status).type('text/plain').send(message);
    const { code, error, state } = req.query;

    if (error) {
      return fail(400, 'Google sign-in was cancelled or failed. Start again from Keepsake.');
    }

    // The flow was started by this browser and has not been used before.
    const [, nonce = ''] = typeof state === 'string' ? state.split('.') : [];
    const pending = nonce ? flows.consume(nonce) : null;
    if (!pending || readCookie(req, STATE_COOKIE) !== nonce) {
      return fail(400, 'This sign-in could not be verified. Start again from Keepsake.');
    }
    const flow = pending.flow;

    if (!code || typeof code !== 'string') {
      return fail(400, 'Authorization code missing');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return fail(500, 'Google OAuth credentials not configured on server');
    }

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
          redirect_uri: redirectUriFor(req),
          grant_type: 'authorization_code'
        })
      });

      if (!tokenRes.ok) {
        return fail(400, 'Google did not accept the sign-in. Start again from Keepsake.');
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const googleRefreshToken: string | undefined = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;

      // Fetch user profile
      const userRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!userRes.ok) {
        return fail(400, 'Failed to fetch user profile from Google');
      }

      const userData = await userRes.json();

      // Only the accounts the server owner listed may sign in. The session token minted
      // below is what authorizes API calls; nothing is shared by hand.
      if (!isEmailAllowed(allowedEmails, userData.email, userData.email_verified)) {
        console.warn('[Server] Rejected Google sign-in from an account that is not in KEEPSAKE_ALLOWED_EMAILS');
        return fail(403, 'This Google account is not allowed to use this Keepsake server. Ask the server owner to add it to KEEPSAKE_ALLOWED_EMAILS.');
      }

      const user: GoogleUser = {
        id: userData.sub,
        email: userData.email,
        name: userData.name || userData.email,
        picture: userData.picture,
        givenName: userData.given_name,
        familyName: userData.family_name
      };
      const nonceAttr = res.locals.cspNonce ? ` nonce="${res.locals.cspNonce}"` : '';

      // Android: the keepsake:// link carries a one-time code only. The app redeems it
      // with its PKCE verifier at /api/auth/exchange; no credential travels in the link.
      if (flow === 'android') {
        const oneTimeCode = flows.issueCode({ user, googleRefreshToken, label: describeClient('android', undefined) }, pending.challenge!);
        const deepLink = `keepsake://auth?code=${encodeURIComponent(oneTimeCode)}`;
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Keepsake - Authentication Successful</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${pageStyles}</style>
</head>
<body>
  <div class="card">
    <h2>Signing in to Keepsake...</h2>
    <p>Authentication complete. Returning to the Keepsake app.</p>
    <a href="${deepLink}" class="btn">Open Keepsake App</a>
  </div>
  <script${nonceAttr}>window.location.href = ${jsonForInlineScript(deepLink)};</script>
</body>
</html>`);
      }

      const apiToken = sessions.create(user.email, { googleRefreshToken, label: describeClient(flow, req.get('user-agent')) });

      // Browser extension: hand the token to the extension's content script on this
      // page. It never travels in a URL, so it stays out of history and logs.
      if (flow === 'extension') {
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Keepsake - Signed in</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${pageStyles}</style>
</head>
<body>
  <div class="card">
    <h2>Signed in to Keepsake</h2>
    <p id="status">Connecting the browser extension...</p>
  </div>
  <script${nonceAttr}>
    const payload = ${jsonForInlineScript({ apiToken, email: user.email })};
    let attempts = 0;
    const timer = setInterval(() => {
      window.postMessage({ type: 'KEEPSAKE_EXTENSION_AUTH', payload }, window.location.origin);
      if (++attempts >= 20) {
        clearInterval(timer);
        document.getElementById('status').textContent = 'The extension did not respond. Make sure it is installed and enabled, then sign in again from its settings.';
      }
    }, 500);
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data) return;
      if (event.data.type === 'KEEPSAKE_EXTENSION_AUTH_ACK') {
        clearInterval(timer);
        document.getElementById('status').textContent = 'You can close this tab.';
      } else if (event.data.type === 'KEEPSAKE_EXTENSION_AUTH_NACK') {
        clearInterval(timer);
        document.getElementById('status').textContent = event.data.reason === 'wrong-server'
          ? 'The extension is set to a different server address. Open its Server Settings, set the URL to ' + window.location.origin + ', and sign in again.'
          : 'The extension could not accept this sign-in. Try again from its settings.';
      }
    });
  </script>
</body>
</html>`);
      }

      // Web app: the browser keeps the short-lived Google access token (for Drive sync) and the
      // Keepsake API token. The long-lived Google refresh token stays on the server.
      const authPayload = {
        user,
        apiToken,
        tokens: {
          accessToken,
          expiresAt: Date.now() + expiresIn * 1000
        }
      };

      return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Keepsake - Authentication Successful</title>
  <style>${pageStyles}
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
  <script${nonceAttr}>
    const payload = ${jsonForInlineScript(authPayload)};
    try {
      localStorage.setItem('keepsake_auth_session', JSON.stringify(payload));
      if (window.opener && window.opener !== window) {
        window.opener.postMessage({ type: 'KEEPSAKE_AUTH_SUCCESS', payload }, window.location.origin);
        setTimeout(() => window.close(), 600);
      } else {
        window.location.href = '/';
      }
    } catch(e) {
      window.location.href = '/';
    }
  </script>
</body>
</html>`);
    } catch (err: any) {
      console.error('[Server] Google sign-in failed:', err?.message || err);
      return fail(500, 'Authentication error');
    }
  });

  /**
   * The Android app redeems the one-time code from its keepsake:// link. Only the app that
   * generated the PKCE verifier can do this, and only once, within a minute.
   */
  authRouter.post('/exchange', (req: Request, res: Response) => {
    const { code, verifier } = req.body || {};
    if (typeof code !== 'string' || typeof verifier !== 'string' || !code || !verifier || verifier.length > 200) {
      return res.status(400).json({ error: 'Invalid sign-in exchange' });
    }
    const login = flows.redeemCode(code, verifier);
    if (!login) {
      return res.status(400).json({ error: 'This sign-in expired or was already used. Sign in again.' });
    }
    const apiToken = sessions.create(login.user.email, { googleRefreshToken: login.googleRefreshToken, label: login.label });
    // Same shape the app already stores, minus every Google credential.
    return res.json({ user: login.user, tokens: { accessToken: '', expiresAt: 0 }, apiToken });
  });

  /**
   * Refreshes the short-lived Google access token used for Drive sync. Requires a Keepsake
   * session; the refresh token itself is held on the server and never sent to clients.
   */
  authRouter.post('/refresh', async (req: Request, res: Response) => {
    const refreshToken = req.apiBearer ? sessions.getGoogleRefreshToken(req.apiBearer) : undefined;
    if (!refreshToken) {
      return res.status(409).json({ error: 'Sign in again to reconnect Google Drive' });
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
        return res.status(502).json({ error: 'Google did not refresh the access token. Sign in again to reconnect Google Drive.' });
      }

      const data = await tokenRes.json();
      return res.json({
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000
      });
    } catch (err: any) {
      console.error('[Server] Google token refresh failed:', err?.message || err);
      return res.status(502).json({ error: 'Could not reach Google' });
    }
  });

  /**
   * The signed-in devices of this account, and a way to sign one out remotely (a lost phone).
   * A script using KEEPSAKE_API_TOKEN has no account and sees every device.
   */
  authRouter.get('/sessions', (req: Request, res: Response) => {
    const own = req.apiBearer ? sessions.verify(req.apiBearer) : null;
    const currentId = req.apiBearer ? sessions.idOf(req.apiBearer) : null;
    res.json({ sessions: sessions.list(own?.email).map(({ email, ...session }) => ({ ...session, current: session.id === currentId })) });
  });

  authRouter.delete('/sessions/:id', (req: Request, res: Response) => {
    const own = req.apiBearer ? sessions.verify(req.apiBearer) : null;
    if (!sessions.revokeById(req.params.id, own?.email)) {
      return res.status(404).json({ error: 'No such device' });
    }
    return res.json({ success: true });
  });

  /**
   * Ends this device's session. The auth middleware already verified the bearer.
   */
  authRouter.post('/logout', (req: Request, res: Response) => {
    if (req.apiBearer) sessions.revoke(req.apiBearer);
    res.json({ success: true });
  });

  return authRouter;
}
