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

let opponents = loadOpponents();
let activeOpponent = '';
let mediaRecorder = null;
let audioChunks = [];

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
    recordStatusEl.textContent = 'запись…';
    recordHint.textContent = 'говори улицы и пресуппозицию';
    stopRecordBtn.disabled = false;
  } else {
    recordStatusEl.textContent = 'ожидание';
    recordHint.textContent = activeOpponent ? 'готов к записи' : 'нет выбранного оппа';
    stopRecordBtn.disabled = true;
  }
  renderOpponents();
}

async function handleOpponentClick(name) {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    setStatus('Сначала останови текущую запись.', 'error');
    return;
  }
  activeOpponent = name;
  updateRecordUI();
  await startRecording();
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

async function startRecording() {
  if (!activeOpponent) return;
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
      await sendRecording();
    };

    mediaRecorder.start();
    setStatus('Запись запущена.', 'ok');
    updateRecordUI();
  } catch (error) {
    setStatus('Не удалось получить доступ к микрофону.', 'error');
  }
}

async function sendRecording() {
  if (!audioChunks.length) {
    setStatus('Нет аудио для отправки.', 'error');
    return;
  }

  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  formData.append('opponent', activeOpponent);

  setStatus('Транскрибирую и отправляю в Sheets…');

  try {
    const response = await fetch('/api/record', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка записи.');
    }

    transcriptEl.textContent = data.transcript || '—';
    renderParsed(data.parsed);
    setStatus('Запись сохранена.', 'ok');
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
  const entries = [
    ['preflop', parsed.preflop],
    ['flop', parsed.flop],
    ['turn', parsed.turn],
    ['river', parsed.river],
    ['presupposition', parsed.presupposition]
  ];

  parsedEl.innerHTML = '';
  entries.forEach(([key, value]) => {
    const row = document.createElement('div');
    row.innerHTML = `<strong>${key}</strong>: ${value || '—'}`;
    parsedEl.appendChild(row);
  });
}

renderOpponents();
updateRecordUI();
