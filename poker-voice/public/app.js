const opponentInput = document.getElementById('opponent-name');
const opponentSuggestions = document.getElementById('opponent-suggestions');
const addOpponentBtn = document.getElementById('add-opponent');
const clearOpponentsBtn = document.getElementById('clear-opponents');
const opponentList = document.getElementById('opponent-list');
const activeOpponentEl = document.getElementById('active-opponent');
const recordStatusEl = document.getElementById('record-status');
const recordHint = document.getElementById('record-hint');
const stopRecordBtn = document.getElementById('stop-record');
const transcriptEl = document.getElementById('transcript');
const parsedEl = document.getElementById('parsed-fields');
const statusEl = document.getElementById('status');

const STORAGE_KEY = 'pokerVoiceOpponents';
const PARSED_FIELDS = ['preflop', 'flop', 'turn', 'river', 'presupposition'];

let opponents = loadOpponents();
let allOpponentIndex = [];
let activeOpponent = '';
let mediaRecorder = null;
let audioChunks = [];
let currentRecordMode = 'main';
let currentEditField = '';
let lastParsed = {
  preflop: '',
  flop: '',
  turn: '',
  river: '',
  presupposition: ''
};
let lastSavedRow = null;
let opponentIndexLoaded = false;
let suggestionsRequestId = 0;

function loadOpponents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveOpponents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(opponents));
}

function setStatus(message, type = 'ok') {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', type === 'error');
}

function emptyParsedFields() {
  return {
    preflop: '',
    flop: '',
    turn: '',
    river: '',
    presupposition: ''
  };
}

function resetCurrentSelection() {
  activeOpponent = '';
  lastSavedRow = null;
  lastParsed = emptyParsedFields();
  transcriptEl.textContent = '—';
}

function mergeIntoOpponentIndex(items = []) {
  const seen = new Set(allOpponentIndex.map((name) => String(name || '').toLowerCase()));
  items.forEach((name) => {
    const value = String(name || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    allOpponentIndex.push(value);
  });
}

function mergedSuggestions(query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return [];
  }

  const merged = [];
  const seen = new Set();
  const sources = [...allOpponentIndex];

  sources.forEach((name) => {
    if (!name) return;
    const lower = name.toLowerCase();
    if (!lower.includes(q)) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    merged.push(name);
  });

  return merged.slice(0, 20);
}

function renderOpponentSuggestions(filter = '') {
  if (!opponentSuggestions) return;
  const filtered = mergedSuggestions(filter);
  opponentSuggestions.innerHTML = '';

  filtered.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    opponentSuggestions.appendChild(option);
  });
}

async function fetchOpponentSuggestionsFromSheets() {
  const requestId = ++suggestionsRequestId;
  try {
    const response = await fetch('/api/opponent-suggestions?limit=5000');
    const data = await response.json();
    if (requestId !== suggestionsRequestId) return;
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка поиска оппонентов.');
    }

    allOpponentIndex = [];
    mergeIntoOpponentIndex(Array.isArray(data.opponents) ? data.opponents : []);
    opponentIndexLoaded = true;
    renderOpponentSuggestions(opponentInput.value);
  } catch (error) {
    // Keep local fallback only.
    if (requestId !== suggestionsRequestId) return;
    opponentIndexLoaded = false;
    allOpponentIndex = [];
    renderOpponentSuggestions(opponentInput.value);
  }
}

function renderOpponents() {
  opponentList.innerHTML = '';
  opponents.forEach((name) => {
    const card = document.createElement('div');
    card.className = 'opponent-card';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-opponent-btn';
    removeButton.textContent = '×';
    removeButton.title = `Удалить ${name}`;
    removeButton.type = 'button';
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      removeOpponent(name);
    });

    const recordButton = document.createElement('button');
    recordButton.className = 'opponent-btn';
    recordButton.textContent = name;
    if (name === activeOpponent) {
      recordButton.classList.add('active');
    }

    const openButton = document.createElement('button');
    openButton.className = 'open-btn';
    openButton.textContent = 'открыть';

    recordButton.addEventListener('click', () => handleOpponentClick(name));
    openButton.addEventListener('click', () => openOpponentInSheet(name));

    card.appendChild(removeButton);
    card.appendChild(recordButton);
    card.appendChild(openButton);
    opponentList.appendChild(card);
  });
  renderOpponentSuggestions(opponentInput.value);
}

function updateRecordUI() {
  activeOpponentEl.textContent = activeOpponent || '—';
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    recordStatusEl.textContent = currentRecordMode === 'field' ? `правка: ${currentEditField}` : 'запись…';
    recordHint.textContent = currentRecordMode === 'field'
      ? `передиктовка поля ${currentEditField}`
      : 'говори улицы и пресуппозицию';
    stopRecordBtn.disabled = false;
  } else {
    recordStatusEl.textContent = 'ожидание';
    recordHint.textContent = activeOpponent ? 'готов к записи' : 'нет выбранного оппа';
    stopRecordBtn.disabled = true;
  }
  renderOpponents();
  renderParsed(lastParsed);
}

async function handleOpponentClick(name) {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    setStatus('Сначала останови текущую запись.', 'error');
    return;
  }
  activeOpponent = name;
  currentRecordMode = 'main';
  currentEditField = '';
  updateRecordUI();
  await startRecording('main');
}

function addOpponent() {
  const value = opponentInput.value.trim();
  if (!value) return;
  if (!opponents.includes(value)) {
    opponents.unshift(value);
    saveOpponents();
  }
  mergeIntoOpponentIndex([value]);
  opponentInput.value = '';
  renderOpponentSuggestions('');
  updateRecordUI();
}

function removeOpponent(name) {
  const next = opponents.filter((item) => item !== name);
  if (next.length === opponents.length) {
    return;
  }
  opponents = next;
  saveOpponents();

  if (activeOpponent === name) {
    resetCurrentSelection();
  }

  setStatus(`Оппонент ${name} удален из активного списка.`, 'ok');
  updateRecordUI();
}

function clearActiveOpponents() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    setStatus('Сначала останови текущую запись.', 'error');
    return;
  }

  opponents = [];
  saveOpponents();
  resetCurrentSelection();
  setStatus('Активный список оппонентов очищен.', 'ok');
  updateRecordUI();
}

addOpponentBtn.addEventListener('click', addOpponent);
clearOpponentsBtn.addEventListener('click', clearActiveOpponents);
opponentInput.addEventListener('focus', () => {
  if (!opponentInput.value.trim()) {
    renderOpponentSuggestions('');
  }
});
opponentInput.addEventListener('input', () => {
  const query = opponentInput.value;
  renderOpponentSuggestions(query);
  if (!opponentIndexLoaded) {
    fetchOpponentSuggestionsFromSheets();
  }
});
opponentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addOpponent();
  }
});

stopRecordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
});

async function startRecording(mode = 'main', field = '') {
  if (!activeOpponent) return;
  currentRecordMode = mode;
  currentEditField = field;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      updateRecordUI();
      const modeToSend = currentRecordMode;
      const fieldToSend = currentEditField;
      currentRecordMode = 'main';
      currentEditField = '';
      await sendRecording(modeToSend, fieldToSend);
    };

    mediaRecorder.start();
    setStatus(mode === 'field' ? `Передиктовка поля ${field} запущена.` : 'Запись запущена.', 'ok');
    updateRecordUI();
  } catch (error) {
    setStatus('Не удалось получить доступ к микрофону.', 'error');
  }
}

async function sendRecording(mode = 'main', field = '') {
  if (!audioChunks.length) {
    setStatus('Нет аудио для отправки.', 'error');
    return;
  }

  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  formData.append('opponent', activeOpponent);
  if (mode === 'field') {
    formData.append('field', field);
    formData.append('row', String(lastSavedRow || ''));
  }

  setStatus(mode === 'field'
    ? `Транскрибирую правку поля ${field} и обновляю строку…`
    : 'Транскрибирую и отправляю в Sheets…');

  try {
    const endpoint = mode === 'field' ? '/api/record-field' : '/api/record';
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка записи.');
    }

    transcriptEl.textContent = data.transcript || '—';

    if (mode === 'field') {
      if (!lastParsed || typeof lastParsed !== 'object') {
        lastParsed = emptyParsedFields();
      }
      lastParsed[field] = data.value || '';
      lastSavedRow = data.row || lastSavedRow;
      renderParsed(lastParsed);
      setStatus(`Поле ${field} обновлено в строке ${lastSavedRow}.`, 'ok');
    } else {
      lastParsed = data.parsed || emptyParsedFields();
      lastSavedRow = data.row || null;
      renderParsed(lastParsed);
      setStatus(lastSavedRow ? `Запись сохранена в строку ${lastSavedRow}.` : 'Запись сохранена.', 'ok');
    }
  } catch (error) {
    setStatus(error.message || 'Ошибка записи.', 'error');
  }
}

async function openOpponentInSheet(opponent) {
  try {
    setStatus('Открываю строку оппонента в Google Sheets…');
    const response = await fetch(`/api/open-link?opponent=${encodeURIComponent(opponent)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось открыть таблицу.');
    }

    window.open(data.url, '_blank', 'noopener,noreferrer');
    setStatus(`Открыта строка ${data.row} для ${opponent}.`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка открытия таблицы.', 'error');
  }
}

function renderParsed(parsed = {}) {
  parsedEl.innerHTML = '';
  PARSED_FIELDS.forEach((key) => {
    const row = document.createElement('div');
    row.className = 'parsed-row';

    const text = document.createElement('div');
    text.className = 'parsed-text';
    const label = document.createElement('div');
    label.className = 'parsed-label';
    label.innerHTML = `<strong>${key}</strong>`;

    const input = document.createElement('input');
    input.className = 'parsed-input';
    input.type = 'text';
    input.value = parsed[key] || '';
    input.placeholder = '—';
    input.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording');
    input.addEventListener('input', () => {
      lastParsed[key] = input.value;
    });
    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await saveFieldText(key, input.value);
      }
    });

    text.appendChild(label);
    text.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'parsed-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'field-edit-btn ghost';
    editBtn.textContent = 'передиктовать';
    editBtn.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording');
    editBtn.addEventListener('click', () => redictateField(key));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'field-save-btn ghost';
    saveBtn.textContent = 'сохранить';
    saveBtn.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording');
    saveBtn.addEventListener('click', async () => saveFieldText(key, input.value));

    actions.appendChild(editBtn);
    actions.appendChild(saveBtn);
    row.appendChild(text);
    row.appendChild(actions);
    parsedEl.appendChild(row);
  });
}

async function saveFieldText(field, value) {
  if (!activeOpponent) {
    setStatus('Сначала выбери оппонента.', 'error');
    return;
  }
  if (!lastSavedRow) {
    setStatus('Нет сохраненной строки для правки. Сначала сделай обычную запись.', 'error');
    return;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    setStatus('Сначала останови текущую запись.', 'error');
    return;
  }

  try {
    setStatus(`Сохраняю поле ${field}…`);
    const response = await fetch('/api/update-field-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        opponent: activeOpponent,
        row: lastSavedRow,
        field,
        value
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось сохранить поле.');
    }

    lastParsed[field] = data.value ?? value;
    lastSavedRow = data.row || lastSavedRow;
    renderParsed(lastParsed);
    setStatus(`Поле ${field} сохранено в строке ${lastSavedRow}.`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка сохранения поля.', 'error');
  }
}

async function redictateField(field) {
  if (!activeOpponent) {
    setStatus('Сначала выбери оппонента.', 'error');
    return;
  }
  if (!lastSavedRow) {
    setStatus('Нет сохраненной строки для правки. Сначала сделай обычную запись.', 'error');
    return;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    setStatus('Сначала останови текущую запись.', 'error');
    return;
  }

  await startRecording('field', field);
}

renderOpponents();
updateRecordUI();
fetchOpponentSuggestionsFromSheets();
