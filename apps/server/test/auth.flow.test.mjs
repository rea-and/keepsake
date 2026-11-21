import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { LoginFlowStore, isValidChallenge, parseFlow } from '../dist/loginFlow.js';
import { createRateLimiter } from '../dist/rateLimit.js';
import { createAuthRouter } from '../dist/auth.js';
import { createApiAuth } from '../dist/apiAuth.js';
import { SessionStore } from '../dist/sessions.js';

const challengeFor = (verifier) => createHash('sha256').update(verifier).digest('base64url');
const verifier = 'v'.repeat(43);

test('flow names are strict and PKCE challenges must look like SHA-256 digests', () => {
  assert.equal(parseFlow('android'), 'android');
  assert.equal(parseFlow('extension'), 'extension');
  assert.equal(parseFlow('android.evil'), 'web');
  assert.equal(parseFlow(undefined), 'web');
  assert.equal(isValidChallenge(challengeFor(verifier)), true);
  assert.equal(isValidChallenge('short'), false);
  assert.equal(isValidChallenge(5), false);
});

test('a login nonce works once and expires', () => {
  let now = 1000;
  const flows = new LoginFlowStore(() => now);
  const nonce = flows.begin('android', challengeFor(verifier));
  assert.deepEqual(flows.consume(nonce), { flow: 'android', challenge: challengeFor(verifier) });
  assert.equal(flows.consume(nonce), null, 'replay is refused');
  const late = flows.begin('web');
  now += 11 * 60 * 1000;
  assert.equal(flows.consume(late), null, 'expired nonce is refused');
  assert.equal(flows.consume('unknown'), null);
});

test('a one-time code needs the matching verifier, works once and expires', () => {
  let now = 1000;
  const flows = new LoginFlowStore(() => now);
  const code = flows.issueCode({ who: 'owner' }, challengeFor(verifier));
  assert.equal(flows.redeemCode(code, 'x'.repeat(43)), null, 'wrong verifier');
  assert.equal(flows.redeemCode(code, verifier), null, 'a failed attempt burns the code');
  const second = flows.issueCode({ who: 'owner' }, challengeFor(verifier));
  assert.deepEqual(flows.redeemCode(second, verifier), { who: 'owner' });
  assert.equal(flows.redeemCode(second, verifier), null, 'single use');
  const third = flows.issueCode({ who: 'owner' }, challengeFor(verifier));
  now += 61 * 1000;
  assert.equal(flows.redeemCode(third, verifier), null, 'expired');
});

test('the rate limiter blocks bursts and recovers after the window', () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => now });
  const hit = () => { const out = { status: null }; limiter({ ip: '1.2.3.4' }, { setHeader() {}, status(code) { out.status = code; return this; }, json() { return this; } }, () => { out.status = 200; }); return out.status; };
  assert.deepEqual([hit(), hit(), hit()], [200, 200, 429]);
  now += 1001;
  assert.equal(hit(), 200);
});

test('the Android exchange and the Google refresh route', async () => {
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-flow-'));
  const sessions = new SessionStore(path.join(dir, 'sessions.json'));
  const flows = new LoginFlowStore();
  const app = express();
  app.use(express.json());
  app.use('/api', createApiAuth({ sessions }));
  app.use('/api/auth', createAuthRouter({ sessions, allowedEmails: ['owner@example.com'], flows }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, headers = {}) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    // /google/url: android needs a challenge, and every flow gets a nonce cookie plus a flow-bound state.
    assert.equal((await fetch(`${base}/api/auth/google/url?state=android&format=json`)).status, 400);
    const started = await fetch(`${base}/api/auth/google/url?state=android&challenge=${challengeFor(verifier)}&format=json`);
    assert.equal(started.status, 200);
    assert.match(started.headers.get('set-cookie'), /keepsake_oauth_state=[0-9a-f]{32}; .*HttpOnly/i);
    const authUrl = new URL((await started.json()).url);
    assert.match(authUrl.searchParams.get('state'), /^android\.[0-9a-f]{32}$/);
    assert.equal(authUrl.searchParams.get('redirect_uri'), `${base}/api/auth/google/callback`, 'a client cannot choose the redirect');

    // The callback refuses a state that was not started by this browser.
    const forged = await fetch(`${base}/api/auth/google/callback?code=x&state=web.${'0'.repeat(32)}`, { headers: { cookie: `keepsake_oauth_state=${'0'.repeat(32)}` } });
    assert.equal(forged.status, 400);
    assert.match(forged.headers.get('content-type'), /text\/plain/);
    const nonce = authUrl.searchParams.get('state').split('.')[1];
    const mismatch = await fetch(`${base}/api/auth/google/callback?code=x&state=android.${nonce}`);
    assert.equal(mismatch.status, 400, 'no cookie, no sign-in');

    // The exchange hands out a session only for the matching verifier, once.
    const user = { id: '1', email: 'owner@example.com', name: 'Owner' };
    const code = flows.issueCode({ user, googleRefreshToken: 'google-refresh' }, challengeFor(verifier));
    assert.equal((await post('/api/auth/exchange', { code, verifier: 'y'.repeat(43) })).status, 400);
    const code2 = flows.issueCode({ user, googleRefreshToken: 'google-refresh' }, challengeFor(verifier));
    const exchanged = await post('/api/auth/exchange', { code: code2, verifier });
    assert.equal(exchanged.status, 200);
    const session = await exchanged.json();
    assert.match(session.apiToken, /^ks_/);
    assert.equal(session.user.email, 'owner@example.com');
    assert.ok(!JSON.stringify(session).includes('google-refresh'), 'no Google credential reaches the app');
    assert.equal((await post('/api/auth/exchange', { code: code2, verifier })).status, 400, 'single use');
    assert.equal(sessions.verify(session.apiToken)?.email, 'owner@example.com');
    assert.equal(sessions.getGoogleRefreshToken(session.apiToken), 'google-refresh');

    // /refresh is no longer an open proxy: it needs a session, and a refresh token in the body is ignored.
    assert.equal((await post('/api/auth/refresh', { refreshToken: 'attacker-supplied' })).status, 401);
    const plain = sessions.create('owner@example.com');
    assert.equal((await post('/api/auth/refresh', {}, { Authorization: `Bearer ${plain}` })).status, 409, 'a session without a stored Google token must sign in again');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('devices: sessions are listed per account, labelled, and can be revoked remotely', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-devices-'));
  const sessions = new SessionStore(path.join(dir, 'sessions.json'));
  const app = express();
  app.use(express.json());
  app.use('/api', createApiAuth({ sessions }));
  app.use('/api/auth', createAuthRouter({ sessions, allowedEmails: ['owner@example.com', 'other@example.com'] }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const laptop = sessions.create('owner@example.com', { label: 'Web app (Firefox on Linux)' });
  const phone = sessions.create('owner@example.com', { label: 'Android app' });
  const stranger = sessions.create('other@example.com', { label: 'Web app (Chrome on macOS)' });
  const api = (method, route, token) => fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${token}` } });
  try {
    const listed = (await (await api('GET', '/api/auth/sessions', laptop)).json()).sessions;
    assert.deepEqual(listed.map((s) => s.label).sort(), ['Android app', 'Web app (Firefox on Linux)']);
    assert.equal(listed.filter((s) => s.current).length, 1);
    assert.equal(listed.find((s) => s.current).label, 'Web app (Firefox on Linux)');
    assert.ok(listed.every((s) => !('email' in s) && !('token' in s)));

    const phoneId = listed.find((s) => s.label === 'Android app').id;
    const strangerId = sessions.idOf(stranger);
    assert.equal((await api('DELETE', `/api/auth/sessions/${strangerId}`, laptop)).status, 404, 'another account\'s device cannot be revoked');
    assert.equal(sessions.verify(stranger)?.email, 'other@example.com');
    assert.equal((await api('DELETE', `/api/auth/sessions/${phoneId}`, laptop)).status, 200);
    assert.equal((await api('GET', '/api/auth/sessions', phone)).status, 401, 'the revoked device is signed out');
    assert.equal((await api('GET', '/api/auth/sessions', laptop)).status, 200);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
