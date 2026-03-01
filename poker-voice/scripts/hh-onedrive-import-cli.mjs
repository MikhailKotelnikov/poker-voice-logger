#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { moveTreeFiles } from '../src/hhFolderSync.js';

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(__filename);
const APP_CWD = path.resolve(SCRIPTS_DIR, '..');
const CODEX_CWD = path.resolve(APP_CWD, '..');

function parseArgs(argv) {
  const home = os.homedir();
  const out = {
    onedriveInput: process.env.HH_ONEDRIVE_IMPORT_DIR || path.join(home, 'Library', 'CloudStorage', 'OneDrive-Personal', 'import'),
    localInput: process.env.HH_LOCAL_IMPORT_DIR || path.join(CODEX_CWD, 'import'),
    localImported: process.env.HH_LOCAL_IMPORTED_DIR || path.join(CODEX_CWD, 'imported'),
    archiveImported: process.env.HH_ARCHIVE_IMPORTED_DIR || path.resolve(CODEX_CWD, '..', 'imported'),
    opponent: '',
    maxHands: 0,
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 8787),
    noStart: false,
    startupTimeoutMs: 20000,
    requestTimeoutMs: Number(process.env.HH_IMPORT_REQUEST_TIMEOUT_MS || 0),
    json: false,
    noMove: false,
    noArchive: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    const next = () => String(argv[i + 1] || '').trim();

    if (arg === '--onedrive-input' || arg === '--source' || arg === '-s') {
      out.onedriveInput = next();
      i += 1;
      continue;
    }
    if (arg === '--local-input' || arg === '--input' || arg === '-i') {
      out.localInput = next();
      i += 1;
      continue;
    }
    if (arg === '--local-imported' || arg === '--imported' || arg === '-o') {
      out.localImported = next();
      i += 1;
      continue;
    }
    if (arg === '--archive-imported' || arg === '--archive') {
      out.archiveImported = next();
      i += 1;
      continue;
    }
    if (arg === '--opponent') {
      out.opponent = next();
      i += 1;
      continue;
    }
    if (arg === '--max-hands') {
      const raw = Number(next());
      out.maxHands = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
      i += 1;
      continue;
    }
    if (arg === '--host') {
      out.host = next() || out.host;
      i += 1;
      continue;
    }
    if (arg === '--port') {
      const raw = Number(next());
      if (Number.isFinite(raw) && raw > 0) out.port = Math.trunc(raw);
      i += 1;
      continue;
    }
    if (arg === '--startup-timeout-ms') {
      const raw = Number(next());
      if (Number.isFinite(raw) && raw > 0) out.startupTimeoutMs = Math.trunc(raw);
      i += 1;
      continue;
    }
    if (arg === '--request-timeout-ms') {
      const raw = Number(next());
      if (Number.isFinite(raw) && raw >= 0) out.requestTimeoutMs = Math.trunc(raw);
      i += 1;
      continue;
    }
    if (arg === '--no-start') {
      out.noStart = true;
      continue;
    }
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--no-move') {
      out.noMove = true;
      continue;
    }
    if (arg === '--no-archive') {
      out.noArchive = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!out.localInput) {
    throw new Error('Нужно указать --local-input <папка>.');
  }
  if (!out.localImported) {
    throw new Error('Нужно указать --local-imported <папка>.');
  }
  if (!out.noArchive && !out.archiveImported) {
    throw new Error('Нужно указать --archive-imported <папка> или включить --no-archive.');
  }
  if (!out.noMove && !out.onedriveInput) {
    throw new Error('Нужно указать --onedrive-input <папка>.');
  }

  return out;
}

function printHelp() {
  console.log(`HH OneDrive -> local -> DB import

Usage:
  node scripts/hh-onedrive-import-cli.mjs [options]

Options:
  -s, --onedrive-input <dir>   Source папка OneDrive/import
  -i, --local-input <dir>      Локальная inbox папка (default: ../import)
  -o, --local-imported <dir>   Локальная imported папка (default: ../imported)
      --archive-imported <dir> Финальный архив imported вне проекта
      --opponent <name>        Передать target opponent в hh:import
      --max-hands <n>          Лимит рук за прогон (0 = без лимита)
      --host <host>            Host API (default: 127.0.0.1)
      --port <port>            Port API (default: 8787)
      --no-start               Не поднимать server.js автоматически
      --startup-timeout-ms     Таймаут старта server.js
      --request-timeout-ms     Таймаут запроса API импорта, 0 = без таймаута
      --json                   Отдать результат hh:import в JSON
      --no-move                Пропустить шаг move из OneDrive в local inbox
      --no-archive             Пропустить шаг переноса local imported во внешний архив
  -h, --help                   Показать помощь

Defaults:
  onedrive-input: ~/Library/CloudStorage/OneDrive-Personal/import
  local-input:    /Users/.../Documents/codex/import
  local-imported: /Users/.../Documents/codex/imported
  archive-imported: /Users/.../Documents/imported
`);
}

function runHhImport(args) {
  const cliScriptPath = path.join(SCRIPTS_DIR, 'hh-folder-import-cli.mjs');
  const childArgs = [
    cliScriptPath,
    '--input', path.resolve(args.localInput),
    '--imported', path.resolve(args.localImported),
    '--host', String(args.host),
    '--port', String(args.port),
    '--startup-timeout-ms', String(args.startupTimeoutMs),
    '--request-timeout-ms', String(args.requestTimeoutMs)
  ];

  if (args.opponent) {
    childArgs.push('--opponent', args.opponent);
  }
  if (args.maxHands > 0) {
    childArgs.push('--max-hands', String(args.maxHands));
  }
  if (args.noStart) {
    childArgs.push('--no-start');
  }
  if (args.json) {
    childArgs.push('--json');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: APP_CWD,
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`hh:import завершился с кодом ${code}`));
    });

    child.on('error', (error) => reject(error));
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.noMove) {
    const syncResult = await moveTreeFiles({
      fromDir: path.resolve(args.onedriveInput),
      toDir: path.resolve(args.localInput)
    });

    if (!args.json) {
      console.log('OneDrive sync done:');
      console.log(`- source: ${syncResult.sourceRoot}`);
      console.log(`- target: ${syncResult.targetRoot}`);
      console.log(`- filesFound: ${syncResult.filesFound}`);
      console.log(`- filesMoved: ${syncResult.filesMoved}`);
      console.log('---');
    }
  }

  await runHhImport(args);

  if (!args.noArchive) {
    const source = path.resolve(args.localImported);
    const target = path.resolve(args.archiveImported);

    if (source !== target) {
      try {
        await fs.access(source);
        const archiveResult = await moveTreeFiles({
          fromDir: source,
          toDir: target
        });

        if (!args.json) {
          console.log('Imported archive sync done:');
          console.log(`- source: ${archiveResult.sourceRoot}`);
          console.log(`- target: ${archiveResult.targetRoot}`);
          console.log(`- filesFound: ${archiveResult.filesFound}`);
          console.log(`- filesMoved: ${archiveResult.filesMoved}`);
        }
      } catch (error) {
        const code = String(error?.code || '');
        const message = String(error?.message || '');
        if (!['ENOENT', 'ENOTDIR'].includes(code) && !message.includes('Папка source не найдена')) {
          throw error;
        }
      }
    }
  }
}

run().catch((error) => {
  const message = String(error?.message || error || '');
  if (message.includes('hh:import завершился с кодом 1')) {
    console.error('Шаг hh:import завершился с ошибкой. Подробности смотри выше в выводе hh:import.');
    console.error('Если видишь "operation was aborted" — увеличь --request-timeout-ms или используй 0 (без таймаута).');
  }
  console.error(message);
  process.exit(1);
});
