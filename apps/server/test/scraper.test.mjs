import { test } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import { fetchSafeUrl, validateSafeUrl, readLimitedText, extractSocialPreview, extractRedditPreview } from '../dist/scraper.js';

test('blocks private IPv4, IPv6, mapped addresses, and credential URLs', async () => {
  for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://[::ffff:7f00:1]/', 'http://[fe90::1]/', 'http://user:pass@8.8.8.8/']) {
    assert.equal(await validateSafeUrl(url), false, url);
  }
  assert.equal(await validateSafeUrl('https://8.8.8.8/'), true);
});

test('limits response bodies even without a declared content length', async () => {
  assert.equal(await readLimitedText(new Response('small'), 10), 'small');
  await assert.rejects(readLimitedText(new Response('too large'), 3), /too large/);
  await assert.rejects(readLimitedText(new Response('x', { headers: { 'content-length': '100' } }), 3), /too large/);
});

test('extracts social images despite attribute order and resolves relative URLs', () => {
  assert.equal(extractSocialPreview('<meta content="../cover.png?x=1&amp;y=2" property="og:image">', 'https://example.com/a/page'), 'https://example.com/cover.png?x=1&y=2');
  assert.equal(extractSocialPreview('<meta property="twitter:image:src" content="https://example.com/image">', 'https://example.com/'), 'https://example.com/image');
  assert.equal(extractSocialPreview('', 'https://github.com/owner/repo/issues/3'), 'https://opengraph.githubassets.com/1/owner/repo');
  assert.equal(extractSocialPreview('', 'https://github.com/topics/testing'), undefined);
});

test('extracts Reddit galleries and previews while preserving CDN URLs', () => {
  const gallery = { data: { children: [{ data: { gallery_data: { items: [{ media_id: 'abc' }] }, media_metadata: { abc: { s: { u: 'https://preview.redd.it/abc.jpg?width=1024&amp;format=pjpg' } } } } }] } };
  assert.equal(extractRedditPreview(gallery), 'https://preview.redd.it/abc.jpg?width=1024&format=pjpg');
  assert.equal(extractRedditPreview({ preview: { images: [{ source: { url: 'https://i.redd.it/example.png' } }] } }), 'https://i.redd.it/example.png');
  assert.equal(extractRedditPreview({ thumbnail: 'https://www.redditstatic.com/icon.png' }), undefined);
});

test('rejects a private address returned by DNS at connection time', async () => {
  const originalLookup = dns.lookup;
  let calls = 0;
  dns.lookup = async () => {
    calls++;
    return [{ address: calls === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }];
  };
  try {
    await assert.rejects(fetchSafeUrl('http://rebind.example.test/'));
    assert.equal(calls, 2);
  } finally { dns.lookup = originalLookup; }
});

test('rejects redirects to private addresses before fetching them', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }); };
  try {
    await assert.rejects(fetchSafeUrl('https://8.8.8.8/'), /blocked/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
