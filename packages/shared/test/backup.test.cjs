const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseBackup } = require('../dist/backup.js');
const { createDefaultStore, mergeStores } = require('../dist/sync.js');

test('backup round trip preserves bookmarks and deletion records', () => {
  const original = createDefaultStore('a');
  original.bookmarks.push({ id: 'a', url: 'https://example.com', title: 'Example', description: '', domain: 'example.com', tags: [], collectionId: 'unsorted', isFavorite: false, isTrash: false, type: 'link', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' });
  original.tombstones.push({ id: 'deleted', type: 'bookmark', deletedAt: '2024-01-02T00:00:00.000Z' });
  original.savedSearches.push({ id: 'search', name: 'Reading', query: 'is:pending', updatedAt: '2024-01-02T00:00:00.000Z' });
  const parsed = parseBackup(JSON.stringify(original));
  const merged = mergeStores(createDefaultStore('b'), parsed, 'b').mergedStore;
  assert.equal(merged.bookmarks[0].title, 'Example');
  assert.equal(merged.tombstones[0].id, 'deleted');
  assert.equal(merged.savedSearches[0].query, 'is:pending');
});

test('legacy backups without deletion records remain importable', () => {
  const original = createDefaultStore('a');
  delete original.tombstones;
  delete original.schemaVersion;
  assert.deepEqual(parseBackup(JSON.stringify(original)).tombstones, []);
});

test('reject malformed and unsupported backups', () => {
  assert.throws(() => parseBackup('{"bookmarks":[]}'), /collection lists/);
  assert.throws(() => parseBackup('{"bookmarks":[{}],"collections":[]}'), /invalid bookmark/);
  assert.throws(() => parseBackup('{"bookmarks":[],"collections":[],"schemaVersion":2}'), /Unsupported/);
});
