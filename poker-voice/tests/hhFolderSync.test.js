import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { listFilesRecursive, moveTreeFiles } from '../src/hhFolderSync.js';

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('moveTreeFiles moves nested files preserving relative tree and prunes source dirs', async () => {
  const sourceRoot = await makeTempDir('pv-hh-sync-src-');
  const targetRoot = await makeTempDir('pv-hh-sync-dst-');

  const nestedA = path.join(sourceRoot, '2026', '02', '21');
  const nestedB = path.join(sourceRoot, '2026', '02', '22');

  await fs.mkdir(nestedA, { recursive: true });
  await fs.mkdir(nestedB, { recursive: true });

  await fs.writeFile(path.join(nestedA, 'a.txt'), 'A');
  await fs.writeFile(path.join(nestedB, 'b.log'), 'B');
  await fs.writeFile(path.join(nestedB, '.DS_Store'), 'ignored');

  const result = await moveTreeFiles({ fromDir: sourceRoot, toDir: targetRoot });

  assert.equal(result.filesFound, 2);
  assert.equal(result.filesMoved, 2);

  const targetA = path.join(targetRoot, '2026', '02', '21', 'a.txt');
  const targetB = path.join(targetRoot, '2026', '02', '22', 'b.log');

  assert.equal(await fs.readFile(targetA, 'utf8'), 'A');
  assert.equal(await fs.readFile(targetB, 'utf8'), 'B');

  const remainingSourceFiles = await listFilesRecursive(sourceRoot);
  assert.equal(remainingSourceFiles.length, 0);

  const sourceEntries = await fs.readdir(sourceRoot);
  assert.equal(sourceEntries.length, 0);
});

test('moveTreeFiles throws if source directory does not exist', async () => {
  const sourceRoot = path.join(os.tmpdir(), 'pv-hh-sync-missing-source-does-not-exist');
  const targetRoot = await makeTempDir('pv-hh-sync-dst-');

  await assert.rejects(
    moveTreeFiles({ fromDir: sourceRoot, toDir: targetRoot }),
    /Папка source не найдена/
  );
});
