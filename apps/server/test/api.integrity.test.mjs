import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-integrity-'));
const token = 'integrity-token-' + 'x'.repeat(40);
process.env.DATA_DIR = dir;
process.env.KEEPSAKE_API_TOKEN = token;
process.env.KEEPSAKE_ALLOWED_EMAILS = 'owner@example.com';
const { app } = await import('../dist/index.js');
const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const call = (method, route, body) => fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const list = async () => (await (await call('GET', '/api/bookmarks')).json()).bookmarks;

test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('re-saving an existing page never resets how it was organised', async () => {
  const col = (await (await call('POST', '/api/collections', { title: 'Reading' })).json()).collection;
  const created = await call('POST', '/api/bookmarks', { url: 'https://example.com/post', title: 'Post', note: 'my note', collectionId: col.id, tags: ['keep'], isFavorite: true });
  assert.equal(created.status, 201);
  const original = (await created.json()).bookmark;

  // Quick-save: what the extension sends from "Save Page" for a bookmark that already exists.
  const capture = await call('POST', '/api/bookmarks', { url: 'https://example.com/post', title: 'Post | Site', collectionId: 'unsorted', tags: [], note: '', isFavorite: false, cover: 'https://example.com/cover.png', mode: 'capture' });
  assert.equal(capture.status, 201);
  const afterCapture = (await capture.json()).bookmark;
  assert.equal(afterCapture.id, original.id);
  assert.equal(afterCapture.collectionId, col.id);
  assert.deepEqual(afterCapture.tags, ['keep']);
  assert.equal(afterCapture.note, 'my note');
  assert.equal(afterCapture.isFavorite, true);
  assert.equal(afterCapture.title, 'Post', 'an existing real title is kept');
  assert.equal(afterCapture.cover, 'https://example.com/cover.png', 'missing metadata is filled in');

  // A plain update that omits fields leaves them alone as well.
  const partial = (await (await call('POST', '/api/bookmarks', { url: 'https://example.com/post', title: 'Renamed' })).json()).bookmark;
  assert.equal(partial.title, 'Renamed');
  assert.equal(partial.note, 'my note');
  assert.equal(partial.collectionId, col.id);
  assert.equal(partial.isFavorite, true);
});

test('malformed input is refused with 400 and the server keeps running', async () => {
  for (const body of [{ url: 5 }, { url: 'javascript:alert(1)' }, { url: 'https://example.com', tags: 'x' }, { url: 'https://example.com', title: 7 }, []]) {
    assert.equal((await call('POST', '/api/bookmarks', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await call('POST', '/api/bookmarks', '{not json')).status, 400);
  const existing = (await list())[0];
  assert.equal((await call('PUT', `/api/bookmarks/${existing.id}`, { tags: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/collections', { title: 5 })).status, 400);
  assert.equal((await call('POST', '/api/sync', { bookmarks: 'nope' })).status, 400);
  assert.equal((await call('POST', '/api/import', { format: 'json', content: { nothing: true } })).status, 400);
  assert.equal((await fetch(`${base}/api/health`)).status, 200, 'the process survived every bad request');
  assert.equal((await (await call('GET', '/api/bookmarks?search=x')).json()).bookmarks.length >= 0, true);
});

test('sync and JSON import drop broken records instead of storing them', async () => {
  const now = new Date().toISOString();
  const good = { id: 'good', url: 'https://example.org/good', title: 'Good', description: '', domain: 'example.org', tags: [], collectionId: 'unsorted', isFavorite: false, isTrash: false, type: 'link', createdAt: now, updatedAt: now };
  const sync = await call('POST', '/api/sync', { store: { bookmarks: [good, { id: 'no-url', title: 'broken' }, { id: 'js', url: 'javascript:alert(1)', title: 'x' }], collections: [], tombstones: [{ id: 'unsorted', type: 'collection', deletedAt: now }] } });
  assert.equal(sync.status, 200);
  const store = (await sync.json()).store;
  assert.ok(store.bookmarks.some((b) => b.id === 'good'));
  assert.ok(!store.bookmarks.some((b) => b.id === 'no-url' || b.id === 'js'));
  assert.ok(store.collections.some((c) => c.id === 'unsorted'), 'system collections cannot be deleted through sync');
  // Searches and new saves still work afterwards.
  assert.equal((await call('GET', '/api/bookmarks?search=good')).status, 200);
  assert.equal((await call('POST', '/api/bookmarks', { url: 'https://example.net/new' })).status, 201);
  // A backup with only a bookmark list imports cleanly.
  assert.equal((await call('POST', '/api/import', { format: 'json', content: { bookmarks: [{ ...good, id: 'second', url: 'https://example.org/second' }] } })).status, 200);
});

test('deleting a collection through sync moves its bookmarks to Unsorted', async () => {
  const col = (await (await call('POST', '/api/collections', { title: 'Temporary' })).json()).collection;
  const bm = (await (await call('POST', '/api/bookmarks', { url: 'https://example.org/in-temp', collectionId: col.id })).json()).bookmark;
  const deletedAt = new Date(Date.now() + 1000).toISOString();
  const sync = await call('POST', '/api/sync', { store: { bookmarks: [], collections: [], tombstones: [{ id: col.id, type: 'collection', deletedAt }] } });
  const store = (await sync.json()).store;
  assert.ok(!store.collections.some((c) => c.id === col.id));
  assert.equal(store.bookmarks.find((b) => b.id === bm.id).collectionId, 'unsorted');
});

test('far-future timestamps from a skewed client clock cannot win every conflict', async () => {
  const bm = (await (await call('POST', '/api/bookmarks', { url: 'https://example.org/clock', title: 'Original' })).json()).bookmark;
  const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  await call('POST', '/api/sync', { store: { bookmarks: [{ ...bm, title: 'From the future', updatedAt: future }], collections: [] } });
  const stored = (await list()).find((b) => b.id === bm.id);
  assert.ok(Date.parse(stored.updatedAt) < Date.now() + 10 * 60 * 1000, 'timestamp was clamped');
});

test('re-importing a browser export does not reset favorites, tags or collections', async () => {
  const existing = (await (await call('POST', '/api/bookmarks', { url: 'https://example.org/imported', title: 'Imported', tags: ['mine'], isFavorite: true })).json()).bookmark;
  const html = '<DL><p><DT><H3>Other folder</H3><DL><p><DT><A HREF="https://example.org/imported?a=1&amp;b=2" TAGS="x">Imported</A><DT><A HREF="javascript:alert(1)">bad</A></DL><p></DL>';
  const first = await call('POST', '/api/import', { content: html, format: 'html' });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).importedCount, 1, 'non-web links are skipped');
  const again = await call('POST', '/api/import', { content: '<DL><p><DT><A HREF="https://example.org/imported" TAGS="other">Imported</A></DL><p>', format: 'html' });
  assert.equal(again.status, 200);
  const stored = (await list()).find((b) => b.id === existing.id);
  assert.equal(stored.isFavorite, true);
  assert.deepEqual(stored.tags, ['mine']);
});

test('the store is saved compactly with a daily backup', async () => {
  const raw = fs.readFileSync(path.join(dir, 'store.json'), 'utf8');
  assert.ok(!raw.includes('\n  '), 'no pretty printing');
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  assert.ok(backups.some((name) => /^store-\d{4}-\d{2}-\d{2}\.json$/.test(name)));
});

test('article HTML sent by a client is cleaned before it is stored', async () => {
  const res = await call('POST', '/api/bookmarks', { url: 'https://example.org/article', title: 'A', readerContent: { title: 'A', content: '<p>safe</p><img src=x onerror=alert(1)><a href="java&#9;script:alert(1)">x</a>' } });
  const stored = (await res.json()).bookmark.readerContent.content;
  assert.match(stored, /<p>safe<\/p>/);
  assert.doesNotMatch(stored, /onerror|javascript|java\s*script/i);
  const synced = await call('POST', '/api/sync', { store: { bookmarks: [{ ...(await list()).find((b) => b.url === 'https://example.org/article'), id: 'via-sync', url: 'https://example.org/via-sync', readerContent: { content: '<script>alert(1)</script><p>ok</p>' } }], collections: [] } });
  assert.equal((await synced.json()).store.bookmarks.find((b) => b.id === 'via-sync').readerContent.content, '<p>ok</p>');
});

test('sync supports conditional requests and leaving article text out', async () => {
  const created = (await (await call('POST', '/api/bookmarks', { url: 'https://example.org/long-read', title: 'Long read', readerContent: { title: 'Long read', content: '<p>the whole article</p>', textContent: 'the whole article' } })).json()).bookmark;

  const first = await call('GET', '/api/sync');
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.ok((await first.json()).store.bookmarks.find((b) => b.id === created.id).readerContent, 'full sync still carries article text by default');
  const unchanged = await fetch(`${base}/api/sync`, { headers: { ...headers, 'If-None-Match': etag } });
  assert.equal(unchanged.status, 304);

  const slim = await (await call('GET', '/api/sync?readers=0')).json();
  const slimBookmark = slim.store.bookmarks.find((b) => b.id === created.id);
  assert.equal(slimBookmark.readerContent, undefined);
  assert.equal(slimBookmark.hasReader, true);
  assert.notEqual((await call('GET', '/api/sync?readers=0')).headers.get('etag'), etag, 'slim and full responses never share a validator');

  const reader = await call('GET', `/api/bookmarks/${created.id}/reader`);
  assert.equal(reader.status, 200);
  assert.match((await reader.json()).readerContent.content, /the whole article/);
  assert.equal((await call('GET', '/api/bookmarks/does-not-exist/reader')).status, 404);

  // A client that syncs without article text (newer timestamp) must not erase it on the server.
  const later = new Date(Date.now() + 1000).toISOString();
  const { hasReader, ...withoutReader } = slimBookmark;
  const pushed = await call('POST', '/api/sync?readers=0', { store: { bookmarks: [{ ...withoutReader, title: 'Renamed offline', updatedAt: later }], collections: [] } });
  assert.equal(pushed.status, 200);
  const stored = (await list()).find((b) => b.id === created.id);
  assert.equal(stored.title, 'Renamed offline');
  assert.equal((await (await call('GET', `/api/bookmarks/${created.id}/reader`)).json()).readerContent.textContent, 'the whole article');
  assert.equal(stored.readerContent, undefined, 'bookmark lists leave article text out');
  assert.ok((await (await call('GET', '/api/bookmarks?include=reader')).json()).bookmarks.some((b) => b.readerContent));

  const changed = await fetch(`${base}/api/sync`, { headers: { ...headers, 'If-None-Match': etag } });
  assert.equal(changed.status, 200, 'a write invalidates the validator');
});

test('health reports the version and capabilities; tags are counted without the trash', async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.match(health.version, /^\d+\.\d+\.\d+/);
  assert.equal(health.capabilities.captureMode, true);
  await call('POST', '/api/bookmarks', { url: 'https://example.org/tagged-1', tags: ['zz-alpha', 'zz-beta'] });
  await call('POST', '/api/bookmarks', { url: 'https://example.org/tagged-2', tags: ['zz-alpha'] });
  const trashed = (await (await call('POST', '/api/bookmarks', { url: 'https://example.org/tagged-3', tags: ['zz-trashed'] })).json()).bookmark;
  await call('DELETE', `/api/bookmarks/${trashed.id}`);
  const tags = (await (await call('GET', '/api/tags')).json()).tags;
  assert.deepEqual(tags.filter((t) => t.name.startsWith('zz-')), [{ name: 'zz-alpha', count: 2 }, { name: 'zz-beta', count: 1 }]);
});
