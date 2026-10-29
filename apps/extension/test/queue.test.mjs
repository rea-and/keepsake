import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

test('popup captures survive storage and retry after the server returns', async () => {
  const code = await readFile(new URL('../dist/chrome/background.js', import.meta.url), 'utf8');
  const handlers = {};
  const data = { serverUrl: 'https://keepsake.test', apiToken: 'example-token' };
  let online = false;
  let conflict = false;
  let compatible = true;
  let posts = 0;
  let lastPayload;
  let lastAuthorization;
  const listener = (name) => ({ addListener: (callback) => { handlers[name] = callback; } });
  const chrome = {
    runtime: { onInstalled: listener('installed'), onStartup: listener('startup'), onMessage: listener('message') },
    contextMenus: { onClicked: listener('click'), create: () => {} },
    commands: { onCommand: listener('command') },
    alarms: { onAlarm: listener('alarm'), create: async () => {}, clear: async () => true },
    storage: { local: {
      set: async (values) => Object.assign(data, values),
      get: async (key) => key === null ? { ...data } : Array.isArray(key) ? Object.fromEntries(key.map((item) => [item, data[item]])) : { [key]: data[key] },
      remove: async (key) => { delete data[key]; }
    } },
    tabs: { query: async () => [], sendMessage: async () => {} },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} }
  };
  vm.runInNewContext(code, { chrome, URL, URLSearchParams, Headers, crypto: webcrypto, console, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      if (!online) throw new Error('offline');
      if (url.endsWith('/api/health')) return { ok: true, json: async () => ({ capabilities: { conditionalBookmarkWrites: compatible } }) };
      posts++; lastPayload = JSON.parse(options.body); lastAuthorization = options.headers.get('Authorization'); return { ok: !conflict, status: conflict ? 409 : 200 };
    } });
  const bookmark = { id: 'one', url: 'https://example.com', title: 'Example' };
  const result = await new Promise((resolve) => handlers.message({ action: 'QUEUE_POPUP_CAPTURE', serverUrl: 'https://keepsake.test', bookmark }, {}, resolve));
  assert.equal(result.success, true);
  assert.ok(data.keepsake_pending_capture_one);
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(data.keepsake_pending_capture_one);
  online = true;
  compatible = false;
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(data.keepsake_pending_capture_one);
  assert.equal(posts, 0);
  compatible = true;
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(data.keepsake_pending_capture_one, undefined);
  assert.equal(posts, 1);
  assert.equal(lastPayload.ifUnmodifiedSince, null);
  assert.equal(lastAuthorization, 'Bearer example-token');
  conflict = true;
  await new Promise((resolve) => handlers.message({ action: 'QUEUE_POPUP_CAPTURE', serverUrl: 'https://keepsake.test', bookmark, baseUpdatedAt: '2024-01-01T00:00:00.000Z' }, {}, resolve));
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(data.keepsake_pending_capture_one.conflict, true);
  assert.equal(lastPayload.ifUnmodifiedSince, '2024-01-01T00:00:00.000Z');
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(posts, 2);
});
