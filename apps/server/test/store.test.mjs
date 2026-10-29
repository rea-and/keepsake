import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.resolve('dist/store.js')).href;
const run = (dataDir, code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8' });

test('an unreadable existing store is preserved rather than replaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-corrupt-'));
  try {
    const file = path.join(dir, 'store.json');
    fs.writeFileSync(file, '{broken json');
    const result = run(dir, `await import(${JSON.stringify(moduleUrl)})`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /file was not modified/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken json');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('failed atomic replacement throws and restores the last committed data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-write-'));
  try {
    const code = `
      import fs from 'node:fs';
      const { serverStore } = await import(${JSON.stringify(moduleUrl)});
      const original = fs.renameSync;
      fs.renameSync = () => { throw new Error('simulated disk failure'); };
      try { serverStore.addOrUpdateCollection({ title: 'Should not persist' }); process.exitCode = 1; }
      catch (error) { console.log(JSON.stringify({ message: error.message, collections: serverStore.getStore().collections.map(c => c.title) })); }
      finally { fs.renameSync = original; }
    `;
    const result = run(dir, code);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.match(output.message, /Could not save/);
    assert.deepEqual(output.collections, ['Unsorted']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')).collections.map((c) => c.title), ['Unsorted']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
