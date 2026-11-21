import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApiAuth } from '../dist/apiAuth.js';
import { SessionStore, isEmailAllowed, parseAllowedEmails } from '../dist/sessions.js';

const run = (middleware, { method = 'GET', path: reqPath = '/bookmarks', authorization } = {}) => {
  const result = { status: null, nexted: false };
  const req = { method, path: reqPath, get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined) };
  const res = { status(code) { result.status = code; return this; }, json() { return this; } };
  middleware(req, res, () => { result.nexted = true; });
  return { ...result, req };
};

const tempSessions = (now) => new SessionStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-sessions-')), 'sessions.json'), now);

test('API authentication fails closed without any credential method', () => {
  assert.throws(() => createApiAuth({}), /session verifier/);
  assert.throws(() => createApiAuth({ legacyToken: 'short' }), /at least 32/);
  assert.equal(typeof createApiAuth({ legacyToken: 'x'.repeat(32) }), 'function');
});

test('allowed emails are case-insensitive and require a verified address', () => {
  const allowed = parseAllowedEmails(' Owner@Example.com, ,friend@example.com ');
  assert.deepEqual(allowed, ['owner@example.com', 'friend@example.com']);
  assert.equal(isEmailAllowed(allowed, 'OWNER@example.com', true), true);
  assert.equal(isEmailAllowed(allowed, 'owner@example.com', false), false);
  assert.equal(isEmailAllowed(allowed, 'owner@example.com', undefined), false);
  assert.equal(isEmailAllowed(allowed, 'stranger@example.com', true), false);
  assert.equal(isEmailAllowed([], 'owner@example.com', true), false);
});

test('session tokens authorize requests and can be revoked', () => {
  const sessions = tempSessions();
  const middleware = createApiAuth({ sessions });
  const token = sessions.create('owner@example.com');
  assert.match(token, /^ks_/);
  assert.equal(run(middleware, { authorization: `Bearer ${token}` }).nexted, true);
  assert.equal(run(middleware, { authorization: `Bearer ${token}` }).req.apiBearer, token);
  assert.equal(run(middleware, { authorization: 'Bearer ks_unknown' }).status, 401);
  assert.equal(run(middleware).status, 401);
  assert.equal(run(middleware, { method: 'OPTIONS' }).nexted, true);
  assert.equal(run(middleware, { path: '/health' }).nexted, true);
  assert.equal(sessions.revoke(token), true);
  assert.equal(run(middleware, { authorization: `Bearer ${token}` }).status, 401);
});

test('sessions persist hashed, expire when idle, and end when an email is removed', () => {
  let now = 1_000_000;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-sessions-'));
  const file = path.join(dir, 'sessions.json');
  const sessions = new SessionStore(file, () => now);
  const kept = sessions.create('owner@example.com');
  const removed = sessions.create('former@example.com');
  assert.equal(fs.readFileSync(file, 'utf8').includes(kept), false, 'raw tokens must never be written to disk');

  const reloaded = new SessionStore(file, () => now);
  assert.equal(reloaded.verify(kept)?.email, 'owner@example.com');
  reloaded.revokeWhere((email) => email === 'owner@example.com');
  assert.equal(reloaded.verify(removed), null);
  assert.equal(reloaded.verify(kept)?.email, 'owner@example.com');

  now += 91 * 24 * 60 * 60 * 1000;
  assert.equal(reloaded.verify(kept), null);
});

test('the optional static token still works for scripts', () => {
  const legacy = 'l'.repeat(40);
  const middleware = createApiAuth({ sessions: tempSessions(), legacyToken: legacy });
  assert.equal(run(middleware, { authorization: `Bearer ${legacy}` }).nexted, true);
  assert.equal(run(middleware, { authorization: `Bearer ${'m'.repeat(40)}` }).status, 401);
});

test('an unreadable sessions file is moved aside instead of overwritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-sessions-'));
  const file = path.join(dir, 'sessions.json');
  fs.writeFileSync(file, '{not json');
  const sessions = new SessionStore(file, () => 5_000);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(dir, 'sessions.json.corrupt-5000'), 'utf8'), '{not json');
  const token = sessions.create('owner@example.com');
  assert.equal(sessions.verify(token)?.email, 'owner@example.com');
});
