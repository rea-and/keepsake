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

test('malformed records in an existing store are dropped after a copy is kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepsake-repair-'));
  try {
    const now = new Date().toISOString();
    const good = { id: 'a', url: 'https://example.com', title: 'A', description: '', domain: 'example.com', tags: [], collectionId: 'unsorted', isFavorite: false, isTrash: false, type: 'link', createdAt: now, updatedAt: now };
    const original = JSON.stringify({ version: 1, schemaVersion: 1, lastModified: now, deviceId: 'x', collections: [{ id: 'unsorted', title: 'Unsorted', sortOrder: 0, createdAt: now, updatedAt: now }], bookmarks: [good, { id: 'broken' }], tombstones: [] });
    fs.writeFileSync(path.join(dir, 'store.json'), original);
    const result = run(dir, `const { serverStore } = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(serverStore.getStore().bookmarks.map((b) => b.id)));`);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').pop()), ['a']);
    const copy = fs.readdirSync(dir).find((name) => name.startsWith('store.json.pre-repair-'));
    assert.ok(copy, 'the original file is kept');
    assert.equal(fs.readFileSync(path.join(dir, copy), 'utf8'), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
