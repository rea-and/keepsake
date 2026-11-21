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

test('tag filters match whole tags and -tag: excludes them', () => {
  const { parseSearchQuery, matchesSearch } = require('../dist/search.js');
  const make = (tags) => ({ id: tags.join('-'), url: 'https://example.com', title: 'T', description: '', domain: 'example.com', tags, collectionId: 'unsorted', isFavorite: false, isTrash: false, type: 'link', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' });
  const dev = make(['dev']);
  const devops = make(['devops']);
  assert.equal(matchesSearch(dev, parseSearchQuery('tag:dev')), true);
  assert.equal(matchesSearch(devops, parseSearchQuery('tag:dev')), false);
  assert.equal(matchesSearch(devops, parseSearchQuery('#dev')), false);
  assert.equal(matchesSearch(dev, parseSearchQuery('-tag:dev')), false);
  assert.equal(matchesSearch(devops, parseSearchQuery('-tag:dev')), true);
  assert.equal(matchesSearch(dev, parseSearchQuery('-#DEV')), false);
  assert.equal(matchesSearch(make(['a', 'b']), parseSearchQuery('tag:a tag:b')), true);
});
