const hostInput = document.getElementById('hostInput');
const portInput = document.getElementById('portInput');
const autoImportEnabledInput = document.getElementById('autoImportEnabledInput');
const inboxInput = document.getElementById('inboxInput');
const importedInput = document.getElementById('importedInput');
const statusBadge = document.getElementById('statusBadge');
const urlText = document.getElementById('urlText');
const logsNode = document.getElementById('logs');
const openWebBtn = document.getElementById('openWebBtn');
const chooseInboxBtn = document.getElementById('chooseInboxBtn');
const chooseImportedBtn = document.getElementById('chooseImportedBtn');
const saveBtn = document.getElementById('saveBtn');
const openRuntimeBtn = document.getElementById('openRuntimeBtn');

let latestState = null;

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = Boolean(busy);
}

function formatLogs(logs) {
  if (!Array.isArray(logs) || !logs.length) return 'Логи пока пустые.';
  return logs
    .map((item) => `[${item.ts || ''}] ${item.line || ''}`)
    .join('\n');
}

function applyState(state) {
  if (!state) return;
  latestState = state;

  const cfg = state.config || {};
  hostInput.value = cfg.host || '127.0.0.1';
  portInput.value = cfg.port || 8787;
  autoImportEnabledInput.checked = Boolean(cfg.autoImportEnabled);
  inboxInput.value = cfg.autoImportInboxDir || '';
  importedInput.value = cfg.autoImportImportedDir || '';

  const ready = Boolean(state.serverReady);
  statusBadge.textContent = ready ? 'сервер запущен' : 'сервер перезапускается';
  statusBadge.className = `badge ${ready ? 'ok' : 'warn'}`;

  const url = state.url || `http://${state.host || '127.0.0.1'}:${state.port || 8787}`;
  urlText.textContent = url;
  logsNode.textContent = formatLogs(state.logs);

  if (state.lastError) {
    logsNode.textContent = `${logsNode.textContent}\n\n[error] ${state.lastError}`;
  }
}

async function refreshState() {
  const state = await window.launcherApi.getState();
  applyState(state);
}

async function chooseFolder(targetInput) {
  const result = await window.launcherApi.chooseFolder();
  if (result?.canceled || !result?.folder) return;
  targetInput.value = result.folder;
}

async function saveConfig() {
  setBusy(saveBtn, true);
  try {
    const payload = {
      host: hostInput.value.trim(),
      port: Number(portInput.value || 8787),
      autoImportEnabled: autoImportEnabledInput.checked,
      autoImportInboxDir: inboxInput.value.trim(),
      autoImportImportedDir: importedInput.value.trim()
    };
    const state = await window.launcherApi.saveConfig(payload);
    applyState(state);
  } finally {
    setBusy(saveBtn, false);
  }
}

openWebBtn.addEventListener('click', async () => {
  setBusy(openWebBtn, true);
  try {
    await window.launcherApi.openWeb();
  } finally {
    setBusy(openWebBtn, false);
  }
});

chooseInboxBtn.addEventListener('click', async () => {
  await chooseFolder(inboxInput);
});

chooseImportedBtn.addEventListener('click', async () => {
  await chooseFolder(importedInput);
});

saveBtn.addEventListener('click', async () => {
  await saveConfig();
});

openRuntimeBtn.addEventListener('click', async () => {
  if (!latestState?.paths?.root) return;
  await window.launcherApi.openFolder(latestState.paths.root);
});

window.launcherApi.onState((state) => {
  applyState(state);
});

refreshState();
