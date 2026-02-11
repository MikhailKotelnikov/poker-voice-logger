const opponentInput = document.getElementById('opponent-name');
const addOpponentBtn = document.getElementById('add-opponent');
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

function renderOpponents() {
  opponentList.innerHTML = '';
  opponents.forEach((name) => {
    const card = document.createElement('div');
    card.className = 'opponent-card';

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

    card.appendChild(recordButton);
    card.appendChild(openButton);
    opponentList.appendChild(card);
  });
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
  opponentInput.value = '';
  updateRecordUI();
}

addOpponentBtn.addEventListener('click', addOpponent);
opponentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
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
        lastParsed = { preflop: '', flop: '', turn: '', river: '', presupposition: '' };
      }
      lastParsed[field] = data.value || '';
      lastSavedRow = data.row || lastSavedRow;
      renderParsed(lastParsed);
      setStatus(`Поле ${field} обновлено в строке ${lastSavedRow}.`, 'ok');
    } else {
      lastParsed = data.parsed || { preflop: '', flop: '', turn: '', river: '', presupposition: '' };
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
    text.innerHTML = `<strong>${key}</strong>: ${parsed[key] || '—'}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'field-edit-btn ghost';
    editBtn.textContent = 'передиктовать';
    editBtn.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording');
    editBtn.addEventListener('click', () => redictateField(key));

    row.appendChild(text);
    row.appendChild(editBtn);
    parsedEl.appendChild(row);
  });
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
