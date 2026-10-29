const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSearchQuery, matchesSearch } = require('../dist/search.js');

const bookmark = {
  title: 'Machine learning for everyone', description: 'A practical guide', domain: 'example.com',
  url: 'https://example.com', tags: ['science'], collectionId: 'unsorted', type: 'article',
  isFavorite: false, isDone: false, note: '', readerContent: { textContent: 'Neural networks explained' }
};

test('quoted phrases, exclusions and operators combine', () => {
  assert.equal(matchesSearch(bookmark, parseSearchQuery('"machine learning" #science -video')), true);
  assert.equal(matchesSearch(bookmark, parseSearchQuery('"learning machine"')), false);
  assert.equal(matchesSearch(bookmark, parseSearchQuery('"machine learning" -"practical guide"')), false);
  assert.equal(matchesSearch(bookmark, parseSearchQuery('networks type:article')), true);
  assert.equal(matchesSearch(bookmark, parseSearchQuery('networks type:video')), false);
});
