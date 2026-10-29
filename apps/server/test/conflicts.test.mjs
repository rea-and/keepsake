import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasBookmarkConflict } from '../dist/conflicts.js';

test('only retry a queued edit when the original server version is unchanged', () => {
  const bookmark = { updatedAt: '2025-01-01T00:00:00.000Z' };
  assert.equal(hasBookmarkConflict(bookmark, bookmark.updatedAt), false);
  assert.equal(hasBookmarkConflict(bookmark, '2024-01-01T00:00:00.000Z'), true);
  assert.equal(hasBookmarkConflict(undefined, bookmark.updatedAt), true);
  assert.equal(hasBookmarkConflict(bookmark, null), true);
  assert.equal(hasBookmarkConflict(undefined, null), false);
});
