const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canSetCollectionParent, flattenCollections } = require('../dist/collections.js');
const { getCollectionPath, findCollectionBySlug } = require('../dist/utils.js');

const col = (id, parentId, sortOrder) => ({ id, title: 'Same name', parentId, sortOrder, createdAt: '2024-01-01', updatedAt: '2024-01-01' });
test('hierarchy displays parents before children and disallows cycles', () => {
  const collections = [col('child', 'root', 0), col('root', null, 1), col('grandchild', 'child', 2)];
  assert.deepEqual(flattenCollections(collections).map(({ collection, depth }) => [collection.id, depth]), [['root', 0], ['child', 1], ['grandchild', 2]]);
  assert.equal(canSetCollectionParent(collections, 'root', 'grandchild'), false);
  assert.equal(canSetCollectionParent(collections, 'child', 'root'), true);
  assert.equal(canSetCollectionParent(collections, 'child', 'missing'), false);
});
test('nested collections with the same name have distinct navigable paths', () => {
  const collections = [col('root', null, 0), col('one', 'root', 1), col('two', 'root', 2)];
  assert.notEqual(getCollectionPath(collections[1]), getCollectionPath(collections[2]));
  assert.equal(findCollectionBySlug(collections, getCollectionPath(collections[2])).id, 'two');
});
test('orphaned and cyclic entries remain visible', () => {
  const collections = [col('orphan', 'missing', 0), col('a', 'b', 1), col('b', 'a', 2)];
  assert.deepEqual(new Set(flattenCollections(collections).map(({ collection }) => collection.id)), new Set(['orphan', 'a', 'b']));
});
