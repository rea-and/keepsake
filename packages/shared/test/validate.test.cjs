const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeBookmarkInput, sanitizeCollectionInput, sanitizeStoreInput, toSafeBookmarkUrl, isHttpUrl } = require('../dist/validate.js');
const { normalizeUrl, exportToNetscapeHtml, parseNetscapeHtml } = require('../dist/utils.js');
const { createDefaultStore } = require('../dist/sync.js');

test('normalizeUrl never throws on non-strings', () => {
  assert.equal(normalizeUrl(5), '');
  assert.equal(normalizeUrl(undefined), '');
  assert.equal(normalizeUrl(null), '');
});

test('only http(s) links are accepted as bookmark URLs', () => {
  assert.equal(toSafeBookmarkUrl('example.com/a?utm_source=x'), 'https://example.com/a');
  assert.equal(toSafeBookmarkUrl('javascript:alert(1)'), null);
  assert.equal(toSafeBookmarkUrl('data:text/html,<b>x</b>'), null);
  assert.equal(toSafeBookmarkUrl('file:///etc/passwd'), null);
  assert.equal(toSafeBookmarkUrl(5), null);
  assert.equal(isHttpUrl('https://example.com'), true);
});

test('bookmark input is type-checked and stripped of unknown or undefined fields', () => {
  const ok = sanitizeBookmarkInput({ url: 'https://example.com', title: 'T', tags: [' a ', 'a', 'b'], evil: true, note: undefined });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { url: 'https://example.com', title: 'T', tags: ['a', 'b'] });
  assert.equal(sanitizeBookmarkInput({ url: 5 }).ok, false);
  assert.equal(sanitizeBookmarkInput({}).ok, false);
  assert.equal(sanitizeBookmarkInput({ url: 'https://example.com', tags: 'x' }).ok, false);
  assert.equal(sanitizeBookmarkInput({ url: 'https://example.com', title: 1 }).ok, false);
  assert.equal(sanitizeBookmarkInput({ url: 'https://example.com', type: 'nope' }).ok, false);
  assert.equal(sanitizeBookmarkInput({ url: 'https://example.com', cover: 'javascript:1' }).ok, false);
  assert.equal(sanitizeBookmarkInput([]).ok, false);
  assert.equal(sanitizeBookmarkInput({ isDone: true }, { partial: true }).ok, true);
});

test('collection input requires a title unless partial', () => {
  assert.equal(sanitizeCollectionInput({}).ok, false);
  assert.equal(sanitizeCollectionInput({ title: 'Reads', parentId: null }).ok, true);
  assert.equal(sanitizeCollectionInput({ title: 'Reads', parentId: 5 }).ok, false);
  assert.equal(sanitizeCollectionInput({ color: '#fff' }, { partial: true }).ok, true);
});

test('store payloads drop malformed records, clamp clocks and ignore system tombstones', () => {
  const now = new Date('2025-01-01T00:00:00.000Z');
  const result = sanitizeStoreInput({
    bookmarks: [
      { id: 'ok', url: 'https://example.com', title: 'T', description: '', domain: 'example.com', tags: [], collectionId: 'unsorted', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2099-01-01T00:00:00.000Z' },
      { id: 'no-url' },
      { id: 'js', url: 'javascript:alert(1)' },
      'nonsense'
    ],
    collections: [{ id: 'c', title: 'C' }, { title: 'no id' }],
    tombstones: [{ id: 'unsorted', type: 'collection', deletedAt: '2024-01-01T00:00:00.000Z' }, { id: 'b', type: 'bookmark', deletedAt: '2024-01-01T00:00:00.000Z' }, { id: 'bad', type: 'x' }]
  }, { now });
  assert.deepEqual(result.store.bookmarks.map((b) => b.id), ['ok']);
  assert.equal(result.store.bookmarks[0].updatedAt, now.toISOString(), 'far-future timestamps are clamped');
  assert.deepEqual(result.store.collections.map((c) => c.id), ['c']);
  assert.deepEqual(result.store.tombstones.map((t) => t.id), ['b']);
  assert.equal(result.dropped.bookmarks, 3);
  assert.equal(sanitizeStoreInput({ nothing: true }), null);
  assert.equal(sanitizeStoreInput({ bookmarks: 'x' }), null);
});

test('HTML export and import round trip keeps ampersands, quotes and only web links', () => {
  const store = createDefaultStore('a');
  store.bookmarks.push({ id: 'a', url: 'https://example.com/?a=1&b=2', title: 'Tom & "Jerry" <3', description: 'x & y', domain: 'example.com', tags: ['a&b'], collectionId: 'unsorted', isFavorite: false, isTrash: false, type: 'link', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' });
  const html = exportToNetscapeHtml(store.bookmarks, store.collections) + '<DT><A HREF="javascript:alert(1)">bad</A>\n<DT><A HREF="place:sort=8">place</A>\n';
  const items = parseNetscapeHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/?a=1&b=2');
  assert.equal(items[0].title, 'Tom & "Jerry" <3');
  assert.deepEqual(items[0].tags, ['a&b']);
});
