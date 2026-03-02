const CHECKPOINTS = ['START', 'C1', 'C2', 'C3', 'C4', 'FINISH'];
const MIN_COMPLETION_MS = 180000;

const state = {
  scanned: new Set(),
  startedAt: null,
  finishedAt: null,
  timerId: null,
  scanner: null,
  scannerRunning: false,
  completed: false,
  validForSubmission: false,
  lastTotalMs: 0
};

const el = {
  timer: document.getElementById('timer'),
  startButton: document.getElementById('startButton'),
  scanButton: document.getElementById('scanButton'),
  stopScannerButton: document.getElementById('stopScannerButton'),
  statusMessage: document.getElementById('statusMessage'),
  progressList: document.getElementById('progressList'),
  scannerCard: document.getElementById('scannerCard'),
  completionCard: document.getElementById('completionCard'),
  completionTime: document.getElementById('completionTime'),
  playerName: document.getElementById('playerName'),
  submitRunButton: document.getElementById('submitRunButton'),
  submitStatus: document.getElementById('submitStatus'),
  demoButtons: document.getElementById('demoButtons'),
  resetButton: document.getElementById('resetButton'),
  todayBoard: document.getElementById('todayBoard'),
  alltimeBoard: document.getElementById('alltimeBoard')
};

function formatMs(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function setStatus(message) {
  el.statusMessage.textContent = message;
}

function renderProgress() {
  el.progressList.innerHTML = '';
  for (const cp of CHECKPOINTS) {
    const li = document.createElement('li');
    const done = state.scanned.has(cp);
    li.className = done ? 'done' : '';
    li.textContent = `${done ? '✅' : '⬜'} ${cp}`;
    el.progressList.appendChild(li);
  }
}

function updateTimer() {
  if (!state.startedAt) {
    el.timer.textContent = '00:00';
    return;
  }
  const end = state.finishedAt ? state.finishedAt.getTime() : Date.now();
  el.timer.textContent = formatMs(end - state.startedAt.getTime());
}

function startTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
  }
  state.timerId = setInterval(updateTimer, 250);
  updateTimer();
}

function resetRun() {
  state.scanned = new Set();
  state.startedAt = null;
  state.finishedAt = null;
  state.completed = false;
  state.validForSubmission = false;
  state.lastTotalMs = 0;
  el.completionCard.hidden = true;
  el.submitStatus.textContent = '';
  el.scanButton.disabled = false;
  setStatus('Run reset. Scan START to begin.');
  renderProgress();
  updateTimer();
  stopScanner();
}

function canFinish() {
  return ['C1', 'C2', 'C3', 'C4'].every((cp) => state.scanned.has(cp));
}

function parseScanPayload(payload) {
  const raw = String(payload || '').trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    const cp = url.searchParams.get('cp');
    const tok = url.searchParams.get('tok');
    if (cp && tok) {
      return { cp: cp.toUpperCase(), tok };
    }
  } catch (_) {
    // not URL
  }

  const normalized = raw.replace(/;/g, '&').replace(/^\?/, '');
  const params = new URLSearchParams(normalized);
  const cp = params.get('cp');
  const tok = params.get('tok');
  if (cp && tok) {
    return { cp: cp.toUpperCase(), tok };
  }

  return null;
}

async function validateWithServer(cp, tok) {
  const response = await fetch('/api/validateScan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cp, tok })
  });
  if (!response.ok) {
    throw new Error('Failed to validate scan.');
  }
  return response.json();
}

async function processScanPayload(payload, source = 'camera') {
  const parsed = parseScanPayload(payload);
  if (!parsed) {
    setStatus('Invalid QR payload.');
    return;
  }

  const { cp, tok } = parsed;
  if (!CHECKPOINTS.includes(cp)) {
    setStatus(`Unknown checkpoint: ${cp}`);
    return;
  }

  let validation;
  try {
    validation = await validateWithServer(cp, tok);
  } catch (error) {
    setStatus(error.message);
    return;
  }

  if (!validation.valid) {
    setStatus('Invalid code or rotated token.');
    return;
  }

  if (state.scanned.has(cp)) {
    setStatus(`${cp} already scanned.`);
    return;
  }

  if (!state.startedAt && cp !== 'START') {
    setStatus('Scan START first.');
    return;
  }

  if (cp === 'FINISH' && !canFinish()) {
    setStatus('Scan C1 through C4 before FINISH.');
    return;
  }

  state.scanned.add(cp);
  renderProgress();

  if (cp === 'START') {
    state.startedAt = new Date();
    state.finishedAt = null;
    startTimer();
    setStatus(source === 'query' ? 'START processed from QR URL.' : 'Race started! Find C1.');
    return;
  }

  if (cp !== 'FINISH') {
    setStatus(`${cp} accepted. Keep going!`);
    return;
  }

  state.finishedAt = new Date();
  state.completed = true;
  state.lastTotalMs = state.finishedAt.getTime() - state.startedAt.getTime();
  state.validForSubmission = state.lastTotalMs >= MIN_COMPLETION_MS;
  updateTimer();
  stopScanner();
  el.scanButton.disabled = true;

  if (!state.validForSubmission) {
    setStatus('Too fast to be valid.');
    el.completionCard.hidden = false;
    el.completionTime.textContent = `Time: ${formatMs(state.lastTotalMs)} (not eligible)`;
    return;
  }

  setStatus('Finished! Enter your name to submit.');
  el.completionCard.hidden = false;
  el.completionTime.textContent = `Time: ${formatMs(state.lastTotalMs)}`;
}

async function startScanner() {
  if (state.scannerRunning) {
    return;
  }

  if (!window.Html5Qrcode) {
    setStatus('Scanner library failed to load.');
    return;
  }

  state.scanner = state.scanner || new Html5Qrcode('scannerViewport');
  el.scannerCard.hidden = false;
  el.stopScannerButton.hidden = false;

  try {
    await state.scanner.start(
      { facingMode: { exact: 'environment' } },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        await processScanPayload(decodedText);
      },
      () => {}
    );
  } catch (_) {
    try {
      await state.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await processScanPayload(decodedText);
        },
        () => {}
      );
    } catch (error) {
      setStatus('Unable to start camera scanner. Check camera permission and HTTPS.');
      el.scannerCard.hidden = true;
      el.stopScannerButton.hidden = true;
      return;
    }
  }

  state.scannerRunning = true;
  setStatus('Scanner started. Point at a checkpoint QR code.');
}

async function stopScanner() {
  if (!state.scanner || !state.scannerRunning) {
    el.scannerCard.hidden = true;
    el.stopScannerButton.hidden = true;
    state.scannerRunning = false;
    return;
  }

  await state.scanner.stop();
  await state.scanner.clear();
  state.scannerRunning = false;
  el.scannerCard.hidden = true;
  el.stopScannerButton.hidden = true;
}

async function submitRun() {
  if (!state.validForSubmission || !state.completed || !state.startedAt || !state.finishedAt) {
    el.submitStatus.textContent = 'Run is not eligible for submission.';
    return;
  }

  const name = el.playerName.value.trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9 ]{3,20}$/.test(name)) {
    el.submitStatus.textContent = 'Name must be 3-20 chars, letters/numbers/spaces only.';
    return;
  }

  const deviceHash = await getDeviceHash();

  const body = {
    name,
    totalMs: state.lastTotalMs,
    checkpoints: CHECKPOINTS,
    startedAtIso: state.startedAt.toISOString(),
    finishedAtIso: state.finishedAt.toISOString(),
    deviceHash
  };

  const response = await fetch('/api/submitRun', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    el.submitStatus.textContent = `Submit failed: ${result.reason || 'unknown_error'}`;
    return;
  }

  el.submitStatus.textContent = 'Score submitted!';
  await loadLeaderboards();
}

async function loadLeaderboards() {
  const [todayRes, allRes] = await Promise.all([
    fetch('/api/leaderboard?scope=today'),
    fetch('/api/leaderboard?scope=alltime')
  ]);

  const today = await todayRes.json();
  const alltime = await allRes.json();

  renderBoard(el.todayBoard, today.rows || []);
  renderBoard(el.alltimeBoard, alltime.rows || []);
}

function renderBoard(target, rows) {
  target.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4">No entries yet</td>';
    target.appendChild(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    const dt = new Date(row.timestamp);
    tr.innerHTML = `<td>${row.rank}</td><td>${row.name}</td><td>${row.time}</td><td>${dt.toLocaleString()}</td>`;
    target.appendChild(tr);
  }
}

async function getDeviceHash() {
  const raw = [navigator.userAgent, navigator.language, screen.width, screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function setupDemoButtons() {
  const demoTokens = {
    START: 'start_demo_token',
    C1: 'c1_demo_token',
    C2: 'c2_demo_token',
    C3: 'c3_demo_token',
    C4: 'c4_demo_token',
    FINISH: 'finish_demo_token'
  };

  for (const cp of CHECKPOINTS) {
    const button = document.createElement('button');
    button.textContent = `Scan ${cp}`;
    button.addEventListener('click', async () => {
      await processScanPayload(`cp=${cp};tok=${demoTokens[cp]}`, 'demo');
    });
    el.demoButtons.appendChild(button);
  }
}

async function processQueryScan() {
  const params = new URLSearchParams(window.location.search);
  const cp = params.get('cp');
  const tok = params.get('tok');
  if (!cp || !tok) {
    return;
  }

  await processScanPayload(`cp=${cp};tok=${tok}`, 'query');
  window.history.replaceState({}, document.title, '/');
}

function setupEvents() {
  el.startButton.addEventListener('click', async () => {
    setStatus('Use Scan checkpoint to scan START, or use Demo Mode.');
  });
  el.scanButton.addEventListener('click', startScanner);
  el.stopScannerButton.addEventListener('click', stopScanner);
  el.submitRunButton.addEventListener('click', submitRun);
  el.resetButton.addEventListener('click', resetRun);
}

(async function init() {
  renderProgress();
  setupEvents();
  setupDemoButtons();
  await loadLeaderboards();
  await processQueryScan();
})();
