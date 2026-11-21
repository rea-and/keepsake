import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeClient } from '../dist/clientLabel.js';

test('device labels name the client, browser and system', () => {
  assert.equal(describeClient('android', 'Dalvik/2.1.0'), 'Android app');
  assert.equal(describeClient('web', 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'), 'Web app (Firefox on Linux)');
  assert.equal(describeClient('extension', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'), 'Browser extension (Chrome on macOS)');
  assert.equal(describeClient('web', 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124.0 Safari/537.36 Edg/124.0'), 'Web app (Edge on Windows)');
  assert.equal(describeClient('web', undefined), 'Web app (Browser)');
});
