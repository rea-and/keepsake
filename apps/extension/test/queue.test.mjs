import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

test('popup captures survive storage and retry after the server returns', async () => {
  const code = await readFile(new URL('../dist/chrome/background.js', import.meta.url), 'utf8');
  const handlers = {};
  const data = {};
  let online = false;
  let posts = 0;
  const listener = (name) => ({ addListener: (callback) => { handlers[name] = callback; } });
  const chrome = {
    runtime: { onInstalled: listener('installed'), onStartup: listener('startup'), onMessage: listener('message') },
    contextMenus: { onClicked: listener('click'), create: () => {} },
    commands: { onCommand: listener('command') },
    alarms: { onAlarm: listener('alarm'), create: async () => {}, clear: async () => true },
    storage: { local: {
      set: async (values) => Object.assign(data, values),
      get: async (key) => key === null ? { ...data } : { [key]: data[key] },
      remove: async (key) => { delete data[key]; }
    } },
    tabs: { query: async () => [], sendMessage: async () => {} },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} }
  };
  vm.runInNewContext(code, { chrome, URL, URLSearchParams, crypto: webcrypto, console, setTimeout, clearTimeout,
    fetch: async () => { posts++; if (!online) throw new Error('offline'); return { ok: true }; } });
  const bookmark = { id: 'one', url: 'https://example.com', title: 'Example' };
  const result = await new Promise((resolve) => handlers.message({ action: 'QUEUE_POPUP_CAPTURE', serverUrl: 'https://keepsake.test', bookmark }, {}, resolve));
  assert.equal(result.success, true);
  assert.ok(data.keepsake_pending_capture_one);
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(data.keepsake_pending_capture_one);
  online = true;
  handlers.alarm({ name: 'keepsake_retry_captures' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(data.keepsake_pending_capture_one, undefined);
  assert.equal(posts, 2);
});
