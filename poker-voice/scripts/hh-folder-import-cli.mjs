#!/usr/bin/env node
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const APP_CWD = path.resolve(path.dirname(__filename), '..');

function parseArgs(argv) {
  const out = {
    input: '',
    imported: '',
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 8787),
    opponent: '',
    maxHands: 0,
    noStart: false,
    json: false,
    startupTimeoutMs: 20000,
    requestTimeoutMs: Number(process.env.HH_IMPORT_REQUEST_TIMEOUT_MS || 0)
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    const next = () => String(argv[i + 1] || '').trim();

    if (arg === '--input' || arg === '-i') {
      out.input = next();
      i += 1;
      continue;
    }
    if (arg === '--imported' || arg === '-o') {
      out.imported = next();
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
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!out.input) {
    throw new Error('Нужно указать --input <папка>.');
  }
  if (!out.imported) {
    out.imported = path.join(out.input, 'imported');
  }

  return out;
}

function printHelp() {
  console.log(`HH folder import CLI

Usage:
  node scripts/hh-folder-import-cli.mjs --input <dir> [options]

Options:
  -i, --input <dir>          Папка с HH файлами (рекурсивно)
  -o, --imported <dir>       Папка для обработанных файлов (default: <input>/imported)
      --host <host>          Host API (default: 127.0.0.1)
      --port <port>          Port API (default: 8787)
      --opponent <name>      Опционально фиксирует target opponent
      --max-hands <n>        Лимит рук за прогон (0 = без лимита)
      --no-start             Не поднимать server.js автоматически
      --json                 Печатать результат как JSON
      --startup-timeout-ms   Таймаут старта server.js (default: 20000)
      --request-timeout-ms   Таймаут запроса импорта, 0 = без таймаута (default: 0)
  -h, --help                 Показать помощь
`);
}

function requestJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const timeoutMs = Number(options.timeoutMs || 0);
  const bodyText = typeof options.body === 'string' ? options.body : '';
  const headers = {
    ...(options.headers || {})
  };

  if (bodyText && !headers['Content-Length']) {
    headers['Content-Length'] = Buffer.byteLength(bodyText, 'utf8');
  }

  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const client = isHttps ? https : http;
  const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);

  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += String(chunk || '');
      });
      res.on('end', () => {
        let data = {};
        if (raw.trim()) {
          try {
            data = JSON.parse(raw);
          } catch {
            reject(new Error(`Некорректный JSON ответ: ${raw.slice(0, 240)}`));
            return;
          }
        }

        const statusCode = Number(res.statusCode || 0);
        if (statusCode >= 400) {
          reject(new Error(data?.error || `HTTP ${statusCode}`));
          return;
        }
        resolve(data);
      });
    });

    if (timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`HTTP timeout ${timeoutMs}ms`));
      });
    }

    req.on('error', (error) => reject(error));

    if (bodyText) req.write(bodyText);
    req.end();
  });
}

async function pingHealth(baseUrl) {
  try {
    const data = await requestJson(`${baseUrl}/api/health`, {
      method: 'GET',
      timeoutMs: 5000
    });
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

function waitForServerReady(child, host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const baseUrl = `http://${host}:${port}`;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.removeListener('data', onData);
      child.stderr?.removeListener('data', onData);
      child.removeListener('exit', onExit);
    };

    const done = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(baseUrl);
    };

    const onData = (chunk) => {
      const text = String(chunk || '');
      if (text.includes('Poker Voice Logger:') || text.includes(`${host}:${port}`)) {
        done();
      }
    };

    const onExit = (code) => {
      done(new Error(`server.js завершился до готовности (code=${code})`));
    };

    const timer = setTimeout(async () => {
      const alive = await pingHealth(baseUrl);
      if (alive) {
        done();
      } else {
        done(new Error(`Таймаут запуска server.js (${timeoutMs}ms)`));
      }
    }, timeoutMs);

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', onExit);
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = `http://${args.host}:${args.port}`;

  let startedByCli = false;
  let child = null;

  try {
    let online = await pingHealth(baseUrl);

    if (!online) {
      if (args.noStart) {
        throw new Error(`Сервер недоступен по ${baseUrl} и указан --no-start.`);
      }

      child = spawn(process.execPath, ['server.js'], {
        cwd: APP_CWD,
        env: {
          ...process.env,
          HOST: args.host,
          PORT: String(args.port)
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      startedByCli = true;

      await waitForServerReady(child, args.host, args.port, args.startupTimeoutMs);
      online = true;
    }

    if (!online) {
      throw new Error(`Не удалось подключиться к серверу ${baseUrl}`);
    }

    const result = await requestJson(`${baseUrl}/api/hh-folder-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputDir: args.input,
        importedDir: args.imported,
        opponent: args.opponent,
        maxHands: args.maxHands
      }),
      timeoutMs: args.requestTimeoutMs
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('HH import done:');
      console.log(`- filesFound: ${result.filesFound}`);
      console.log(`- filesMoved: ${result.filesMoved}`);
      console.log(`- totalHands: ${result.totalHands}`);
      console.log(`- savedHands: ${result.savedHands}`);
      console.log(`- duplicateHands: ${result.duplicateHands}`);
      console.log(`- skippedEmptyHands: ${result.skippedEmptyHands || 0}`);
      console.log(`- failedHands: ${result.failedHands}`);
      if (Array.isArray(result.errors) && result.errors.length) {
        console.log(`- errors: ${result.errors.length} (показаны первые 10)`);
        result.errors.slice(0, 10).forEach((item) => {
          console.log(`  * ${item.file || '-'}#${item.handIndex || 0}: ${item.error || 'error'}`);
        });
      }
    }
  } finally {
    if (startedByCli && child) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }
}

run().catch((error) => {
  const message = String(error?.message || error || '');
  if (message.includes('operation was aborted') || message.includes('timeout')) {
    console.error('Импорт прерван по таймауту HTTP запроса. Увеличь --request-timeout-ms или поставь 0 (без таймаута).');
  }
  console.error(message);
  process.exit(1);
});
