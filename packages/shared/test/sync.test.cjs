const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeStores, createDefaultStore } = require('../dist/sync.js');

test('old deletion survives repeated sync and prevents an offline device resurrecting a bookmark', () => {
  const local = createDefaultStore('local');
  const remote = createDefaultStore('remote');
  local.tombstones = [{ id: 'old', type: 'bookmark', deletedAt: '2024-03-01T00:00:00.000Z' }];
  remote.bookmarks = [{ id: 'old', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-02-01T00:00:00.000Z' }];
  const first = mergeStores(local, remote, 'local').mergedStore;
  assert.equal(first.bookmarks.length, 0);
  assert.equal(first.tombstones.length, 1);
  const second = mergeStores(first, remote, 'local').mergedStore;
  assert.equal(second.bookmarks.length, 0);
  assert.equal(second.tombstones.length, 1);
});

test('newer edits win over an older version', () => {
  const local = createDefaultStore('local');
  const remote = createDefaultStore('remote');
  local.bookmarks = [{ id: 'one', title: 'new', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-02-01T00:00:00.000Z' }];
  remote.bookmarks = [{ ...local.bookmarks[0], title: 'old', updatedAt: '2024-01-02T00:00:00.000Z' }];
  assert.equal(mergeStores(local, remote, 'local').mergedStore.bookmarks[0].title, 'new');
});

test('saved searches sync and deleted searches stay deleted on an old device', () => {
  const local = createDefaultStore('local');
  const remote = createDefaultStore('remote');
  remote.savedSearches = [{ id: 'search1', name: 'Reading', query: 'is:pending', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const synced = mergeStores(local, remote, 'local').mergedStore;
  assert.equal(synced.savedSearches[0].query, 'is:pending');
  synced.savedSearches[0] = { ...synced.savedSearches[0], updatedAt: '2024-02-01T00:00:00.000Z', deletedAt: '2024-02-01T00:00:00.000Z' };
  assert.equal(mergeStores(synced, remote, 'local').mergedStore.savedSearches[0].deletedAt, '2024-02-01T00:00:00.000Z');
});
