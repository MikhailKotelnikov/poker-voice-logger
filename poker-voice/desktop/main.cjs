const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const APP_FOLDER = 'runtime';
const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
const CONFIG_NAME = 'launcher-config.json';
const DB_NAME = 'hh.db';

let mainWindow = null;
let serverProcess = null;
let serverReady = false;

const runtimeState = {
  logs: [],
  lastError: '',
  pid: null,
  startedAt: null,
  url: '',
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  serverReady: false,
  config: null,
  paths: null
};

function nowIso() {
  return new Date().toISOString();
}

function appendLog(line) {
  const text = String(line || '').trim();
  if (!text) return;
  runtimeState.logs.push({ ts: nowIso(), line: text });
  if (runtimeState.logs.length > 500) {
    runtimeState.logs.splice(0, runtimeState.logs.length - 500);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launcher:state', snapshotState());
  }
}

function getRuntimePaths() {
  const root = path.join(app.getPath('userData'), APP_FOLDER);
  return {
    root,
    configPath: path.join(root, CONFIG_NAME),
    dbPath: path.join(root, DB_NAME)
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function defaultConfig() {
  return {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    autoImportInboxDir: '',
    autoImportImportedDir: '',
    autoImportEnabled: false
  };
}

function readConfig(paths) {
  const fallback = defaultConfig();
  if (!fs.existsSync(paths.configPath)) return fallback;

  const raw = fs.readFileSync(paths.configPath, 'utf8');
  const parsed = safeJsonParse(raw, fallback);

  const host = String(parsed.host || fallback.host).trim() || fallback.host;
  const parsedPort = Number(parsed.port);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? Math.round(parsedPort) : fallback.port;
  const autoImportInboxDir = String(parsed.autoImportInboxDir || '').trim();
  const importedDefault = autoImportInboxDir ? path.join(autoImportInboxDir, 'imported') : '';
  const autoImportImportedDir = String(parsed.autoImportImportedDir || importedDefault).trim();
  const autoImportEnabled = Boolean(parsed.autoImportEnabled && autoImportInboxDir && autoImportImportedDir);

  return {
    host,
    port,
    autoImportInboxDir,
    autoImportImportedDir,
    autoImportEnabled
  };
}

function writeConfig(paths, config) {
  ensureDir(paths.root);
  fs.writeFileSync(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function resolveTemplateDbCandidates() {
  return [
    path.join(process.resourcesPath || '', 'data', DB_NAME),
    path.join(app.getAppPath(), 'data', DB_NAME),
    path.join(__dirname, '..', 'data', DB_NAME)
  ];
}

function bootstrapDb(paths) {
  if (fs.existsSync(paths.dbPath)) return;

  ensureDir(paths.root);
  const template = resolveTemplateDbCandidates().find((item) => item && fs.existsSync(item));
  if (!template) {
    appendLog('DB template not found; empty DB will be created by server bootstrap.');
    return;
  }

  fs.copyFileSync(template, paths.dbPath);
  appendLog(`DB template copied: ${template}`);
}

function snapshotState() {
  return {
    ...runtimeState,
    logs: runtimeState.logs.slice(-120),
    config: runtimeState.config ? { ...runtimeState.config } : null,
    paths: runtimeState.paths ? { ...runtimeState.paths } : null
  };
}

function stopServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  serverReady = false;
  runtimeState.serverReady = false;
  runtimeState.pid = null;

  try {
    proc.kill('SIGTERM');
  } catch (error) {
    appendLog(`Failed to stop server: ${error.message || error}`);
  }
}

function startServer() {
  const paths = runtimeState.paths;
  const cfg = runtimeState.config;
  if (!paths || !cfg) return;

  stopServer();

  const serverEntry = path.join(app.getAppPath(), 'server.js');
  const port = Number(cfg.port || DEFAULT_PORT);
  const host = String(cfg.host || DEFAULT_HOST).trim() || DEFAULT_HOST;
  const url = `http://${host}:${port}`;

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    HOST: host,
    PORT: String(port),
    HH_STORAGE: 'db',
    HH_DB_PATH: paths.dbPath,
    HH_IMPORT_ENABLED: cfg.autoImportEnabled ? '1' : '0',
    HH_IMPORT_INBOX_DIR: cfg.autoImportInboxDir || '',
    HH_IMPORT_IMPORTED_DIR: cfg.autoImportImportedDir || ''
  };

  runtimeState.url = url;
  runtimeState.host = host;
  runtimeState.port = port;
  runtimeState.startedAt = nowIso();
  runtimeState.lastError = '';

  const child = spawn(process.execPath, [serverEntry], {
    cwd: app.getAppPath(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess = child;
  runtimeState.pid = child.pid;

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    const lines = String(chunk || '').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      appendLog(line);
      if (line.includes('Poker Voice Logger:') || line.includes(`http://${host}:${port}`)) {
        serverReady = true;
        runtimeState.serverReady = true;
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const lines = String(chunk || '').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      appendLog(line);
    }
  });

  child.on('exit', (code, signal) => {
    if (serverProcess && serverProcess.pid === child.pid) {
      serverProcess = null;
      serverReady = false;
      runtimeState.serverReady = false;
      runtimeState.pid = null;
      const reason = `Server exited (code=${String(code)} signal=${String(signal)})`;
      runtimeState.lastError = reason;
      appendLog(reason);
    }
  });

  appendLog(`Server starting at ${url}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 780,
    minHeight: 620,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initRuntime() {
  const paths = getRuntimePaths();
  ensureDir(paths.root);
  const config = readConfig(paths);
  writeConfig(paths, config);
  bootstrapDb(paths);

  runtimeState.paths = paths;
  runtimeState.config = config;
}

ipcMain.handle('launcher:get-state', async () => {
  return snapshotState();
});

ipcMain.handle('launcher:choose-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true };
  }
  return { canceled: false, folder: result.filePaths[0] };
});

ipcMain.handle('launcher:save-config', async (_event, payload = {}) => {
  const paths = runtimeState.paths;
  if (!paths) throw new Error('Runtime not initialized.');

  const current = runtimeState.config || defaultConfig();
  const next = {
    host: String(payload.host || current.host || DEFAULT_HOST).trim() || DEFAULT_HOST,
    port: Number(payload.port) > 0 ? Math.round(Number(payload.port)) : current.port || DEFAULT_PORT,
    autoImportInboxDir: String(payload.autoImportInboxDir || '').trim(),
    autoImportImportedDir: String(payload.autoImportImportedDir || '').trim(),
    autoImportEnabled: Boolean(payload.autoImportEnabled)
  };

  if (next.autoImportInboxDir && !next.autoImportImportedDir) {
    next.autoImportImportedDir = path.join(next.autoImportInboxDir, 'imported');
  }

  if (!next.autoImportInboxDir || !next.autoImportImportedDir) {
    next.autoImportEnabled = false;
  }

  runtimeState.config = next;
  writeConfig(paths, next);

  startServer();
  return snapshotState();
});

ipcMain.handle('launcher:open-web', async () => {
  const url = runtimeState.url || `http://${runtimeState.host}:${runtimeState.port}`;
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.handle('launcher:open-folder', async (_event, folderPath) => {
  const target = String(folderPath || '').trim();
  if (!target) return { ok: false };
  await shell.openPath(target);
  return { ok: true };
});

app.whenReady().then(() => {
  initRuntime();
  createWindow();
  startServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
