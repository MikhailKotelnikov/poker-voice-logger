import fs from 'node:fs/promises';
import path from 'node:path';

const IGNORABLE_FILE_NAMES = new Set(['.ds_store', 'thumbs.db']);

function isIgnorableFileName(name = '') {
  return IGNORABLE_FILE_NAMES.has(String(name || '').trim().toLowerCase());
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesRecursive(rootDir) {
  const normalizedRoot = path.resolve(String(rootDir || ''));
  if (!normalizedRoot) return [];

  const exists = await pathExists(normalizedRoot);
  if (!exists) return [];

  const out = [];
  const stack = [normalizedRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        out.push(entryPath);
      }
    }
  }

  return out;
}

export async function safeMoveFile(sourcePath, destinationPath) {
  const from = path.resolve(sourcePath);
  const to = path.resolve(destinationPath);

  await fs.mkdir(path.dirname(to), { recursive: true });

  try {
    await fs.rename(from, to);
    return;
  } catch (error) {
    const code = String(error?.code || '');
    if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EACCES'].includes(code)) {
      throw error;
    }
  }

  await fs.copyFile(from, to);
  await fs.unlink(from);
}

export async function pruneEmptyDirectories(rootDir) {
  const normalizedRoot = path.resolve(String(rootDir || ''));
  if (!normalizedRoot) return;

  const exists = await pathExists(normalizedRoot);
  if (!exists) return;

  async function recurse(currentDir, isRoot = false) {
    let entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await recurse(entryPath, false);
        continue;
      }
      if (entry.isFile() && isIgnorableFileName(entry.name)) {
        await fs.unlink(entryPath).catch(() => {});
      }
    }

    entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);

    if (!isRoot && entries.length === 0) {
      await fs.rmdir(currentDir).catch(() => {});
    }
  }

  await recurse(normalizedRoot, true);
}

export async function moveTreeFiles({ fromDir, toDir }) {
  const sourceRoot = path.resolve(String(fromDir || ''));
  const targetRoot = path.resolve(String(toDir || ''));

  if (!sourceRoot || !targetRoot) {
    throw new Error('fromDir и toDir обязательны для moveTreeFiles.');
  }

  const sourceExists = await pathExists(sourceRoot);
  if (!sourceExists) {
    throw new Error(`Папка source не найдена: ${sourceRoot}`);
  }

  await fs.mkdir(targetRoot, { recursive: true });

  const allFiles = await listFilesRecursive(sourceRoot);
  const sourceFiles = allFiles.filter((filePath) => !isIgnorableFileName(path.basename(filePath)));

  let moved = 0;

  for (const sourcePath of sourceFiles) {
    const relative = path.relative(sourceRoot, sourcePath);
    if (!relative || relative.startsWith('..')) continue;

    const destinationPath = path.join(targetRoot, relative);
    await safeMoveFile(sourcePath, destinationPath);
    moved += 1;
  }

  await pruneEmptyDirectories(sourceRoot);

  return {
    filesFound: sourceFiles.length,
    filesMoved: moved,
    sourceRoot,
    targetRoot
  };
}
