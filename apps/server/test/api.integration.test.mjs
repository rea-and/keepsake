import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

test('authenticated clients can capture and synchronize while unauthorized requests are rejected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-api-'));
  const token = 'test-token-' + 'x'.repeat(40);
  process.env.DATA_DIR = dir;
  process.env.KEEPSAKE_API_TOKEN = token;
  const { app } = await import('../dist/index.js');
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/bookmarks`)).status, 401);
    assert.equal((await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/api/bookmarks`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    const collectionRes = await fetch(`${base}/api/collections`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Saved from extension' }) });
    assert.equal(collectionRes.status, 201);
    const collection = (await collectionRes.json()).collection;
    const create = await fetch(`${base}/api/bookmarks`, { method: 'POST', headers: auth, body: JSON.stringify({ url: 'https://example.com/article', title: 'Article', description: 'Saved', cover: 'https://example.com/cover.png', collectionId: collection.id, tags: ['test'] }) });
    assert.equal(create.status, 201);
    const bookmark = (await create.json()).bookmark;
    const updated = await fetch(`${base}/api/bookmarks/${bookmark.id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ isDone: true }) });
    assert.equal(updated.status, 200);
    const sync = await fetch(`${base}/api/sync`, { headers: auth });
    const store = (await sync.json()).store;
    assert.equal(store.bookmarks.find((item) => item.id === bookmark.id).isDone, true);
    const merged = await fetch(`${base}/api/sync`, { method: 'POST', headers: auth, body: JSON.stringify({ store }) });
    assert.equal(merged.status, 200);
    assert.equal((await merged.json()).store.bookmarks[0].collectionId, collection.id);

    // Run the built extension background script with simulated extension APIs
    // against the real authenticated server.
    const handlers = {};
    const storage = { serverUrl: base, apiToken: token };
    const listener = (name) => ({ addListener: (callback) => { handlers[name] = callback; } });
    const chrome = {
      runtime: { onInstalled: listener('installed'), onStartup: listener('startup'), onMessage: listener('message') },
      contextMenus: { onClicked: listener('click'), create() {} }, commands: { onCommand: listener('command') },
      alarms: { onAlarm: listener('alarm'), create: async () => {}, clear: async () => true },
      storage: { local: {
        get: async (key) => key === null ? { ...storage } : Array.isArray(key) ? Object.fromEntries(key.map((item) => [item, storage[item]])) : { [key]: storage[key] },
        set: async (values) => Object.assign(storage, values), remove: async (key) => { delete storage[key]; }
      } },
      tabs: { query: async () => [], sendMessage: async () => {} },
      action: { setBadgeText() {}, setBadgeBackgroundColor() {} }
    };
    const script = fs.readFileSync(path.resolve('../extension/dist/chrome/background.js'), 'utf8');
    vm.runInNewContext(script, { chrome, URL, URLSearchParams, Headers, crypto: webcrypto, fetch, console, setTimeout, clearTimeout });
    const queued = { id: 'extension-test', url: 'https://example.org/extension', title: 'Extension capture', description: 'Saved', domain: 'example.org', cover: 'https://example.org/cover.png', tags: [], collectionId: collection.id, isFavorite: false, isTrash: false, type: 'link', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const queuedResult = await new Promise((resolve) => handlers.message({ action: 'QUEUE_POPUP_CAPTURE', serverUrl: base, bookmark: queued }, {}, resolve));
    assert.equal(queuedResult.success, true);
    handlers.alarm({ name: 'keepsake_retry_captures' });
    for (let i = 0; i < 100 && storage['keepsake_pending_capture_extension-test']; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(storage['keepsake_pending_capture_extension-test'], undefined);
    const list = await (await fetch(`${base}/api/bookmarks`, { headers: auth })).json();
    assert.ok(list.bookmarks.some((item) => item.id === 'extension-test'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
