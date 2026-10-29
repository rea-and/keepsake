import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('offline navigation uses the cached shell and API calls bypass the worker', async () => {
  const source = await readFile(new URL('../dist/service-worker.js', import.meta.url), 'utf8');
  const handlers = {};
  let installed = [];
  const shell = new Response('<html>offline shell</html>');
  const caches = {
    open: async () => ({ addAll: async (items) => { installed = items; } }),
    match: async (key) => key === '/index.html' ? shell : undefined,
    keys: async () => [], delete: async () => true
  };
  const self = { location: { origin: 'https://keepsake.test' }, clients: { claim: async () => {} }, addEventListener: (type, handler) => { handlers[type] = handler; } };
  vm.runInNewContext(source, { self, caches, URL, Response, fetch: async () => { throw new Error('offline'); } });
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.ok(installed.includes('/index.html'));
  assert.ok(installed.some((item) => item.endsWith('.js')));
  assert.ok(installed.some((item) => item.endsWith('.css')));
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://keepsake.test/collection/', mode: 'navigate' }, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), '<html>offline shell</html>');
  let handled = false;
  handlers.fetch({ request: { method: 'GET', url: 'https://keepsake.test/api/sync', mode: 'cors' }, respondWith: () => { handled = true; } });
  assert.equal(handled, false);
});
