import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReaderHtml, cleanReaderContent } from '../dist/sanitize.js';

const attacks = [
  '<a href="javascript:alert(1)">x</a>',
  '<a href="java&#9;script:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href=" JaVaScRiPt:alert(1)">x</a>',
  '<img src=x onerror=alert(1)>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
  '<math><a href="javascript:alert(1)">x</a></math>',
  '<style>body{background:url(javascript:alert(1))}</style>',
  '<iframe src="https://evil.example"></iframe>',
  '<form action="https://evil.example"><input name="password"></form>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<script>alert(1)</script>',
  '<object data="data:text/html,<script>alert(1)</script>"></object>'
];

test('reader HTML is cleaned of scripts, handlers and unsafe schemes however they are written', () => {
  for (const attack of attacks) {
    const clean = sanitizeReaderHtml(`<p>kept</p>${attack}`);
    assert.match(clean, /<p>kept<\/p>/, attack);
    assert.doesNotMatch(clean, /javascript:|onerror|<script|<iframe|<form|<input|<style|<object|xlink:href|<animate|<svg|<math|style=/i, `${attack} -> ${clean}`);
  }
});

test('ordinary article markup survives and links are made safe to open', () => {
  const clean = sanitizeReaderHtml('<h2>Title</h2><p>Hello <a href="https://example.com/a">link</a> <strong>bold</strong></p><img src="https://example.com/i.png" alt="i"><blockquote>q</blockquote>');
  assert.match(clean, /<h2>Title<\/h2>/);
  assert.match(clean, /<a href="https:\/\/example.com\/a" target="_blank" rel="noopener noreferrer">link<\/a>/);
  assert.match(clean, /<img src="https:\/\/example.com\/i.png" alt="i">/);
  assert.match(clean, /<blockquote>q<\/blockquote>/);
});

test('reader content from clients is cleaned unless it matches what is already stored', () => {
  const dirty = { content: '<p>x</p><script>alert(1)</script>', title: 'T' };
  assert.equal(cleanReaderContent(dirty).content, '<p>x</p>');
  const stored = { content: '<p>already clean</p>' };
  assert.equal(cleanReaderContent({ content: '<p>already clean</p>' }, stored).content, '<p>already clean</p>');
  assert.equal(cleanReaderContent(undefined), undefined);
});
