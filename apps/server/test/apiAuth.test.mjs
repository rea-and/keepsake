import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiAuth } from '../dist/apiAuth.js';

test('API authentication fails closed without a sufficiently long token', () => {
  assert.throws(() => createApiAuth(''), /at least 32/);
  assert.throws(() => createApiAuth('short'), /at least 32/);
  assert.equal(typeof createApiAuth('x'.repeat(32)), 'function');
});
