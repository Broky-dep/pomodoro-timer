// ── State ──
const state = {
  mode: 'work',             // work | shortBreak | longBreak
  isRunning: false,
  isPaused: false,
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  sessions: 0,
  intervalId: null,

  // durations in minutes
  durations: {
    work: 25,
    shortBreak: 5,
    longBreak: 15,
  },

  notes: [],
  noteIdCounter: 0,
  dirty: false,
};

// ── DOM refs ──
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const timerDisplay = $('#timerDisplay');
const phaseLabel = $('#phaseLabel');
const progressRing = $('.ring-progress');
const startBtn = $('#startBtn');
const resetBtn = $('#resetBtn');
const sessionCount = $('#sessionCount');
const notesList = $('#notesList');
const notesStatus = $('#notesStatus');
const timerSection = $('.timer-section');

const ringCircumference = 2 * Math.PI * 115; // ≈ 722.6

// ── Sound generation ──
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1100;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.3);
    }, 200);
  } catch (e) { /* audio not available */ }
}

function sendNotification(title, body) {
  if (window.electronAPI?.showNotification) {
    window.electronAPI.showNotification({ title, body });
  }
}

// ── Timer helpers ──
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getModeDurations() {
  const w = parseInt($('#workDuration').value) || 25;
  const s = parseInt($('#shortBreakDuration').value) || 5;
  const l = parseInt($('#longBreakDuration').value) || 15;
  return { work: w, shortBreak: s, longBreak: l };
}

function updateDisplay() {
  timerDisplay.textContent = formatTime(state.timeLeft);
  const fraction = 1 - state.timeLeft / state.totalTime;
  const offset = ringCircumference * fraction;
  progressRing.style.strokeDashoffset = offset.toFixed(1);
}

function updatePhaseLabel() {
  const labels = {
    work: '专注时间',
    shortBreak: '短休息',
    longBreak: '长休息',
  };
  phaseLabel.textContent = labels[state.mode] || '';

  timerSection.classList.toggle('break-mode', state.mode !== 'work');
}

function updateSessionCount() {
  sessionCount.textContent = state.sessions;
}

function updateStartBtn() {
  if (state.isRunning) {
    startBtn.textContent = state.isPaused ? '继续' : '暂停';
    startBtn.classList.add('running');
  } else {
    startBtn.textContent = '开始';
    startBtn.classList.remove('running');
  }
}

function updateModeButtons() {
  $$('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === state.mode);
  });
}

// ── Timer control ──
function loadDurations() {
  state.durations = getModeDurations();
}

function switchMode(mode) {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.mode = mode;
  state.isRunning = false;
  state.isPaused = false;
  loadDurations();
  state.totalTime = state.durations[mode] * 60;
  state.timeLeft = state.totalTime;
  updateDisplay();
  updatePhaseLabel();
  updateModeButtons();
  updateStartBtn();
  progressRing.style.strokeDashoffset = '0';
}

function startTimer() {
  if (state.isRunning && state.isPaused) {
    state.isPaused = false;
    state.intervalId = setInterval(tick, 1000);
    updateStartBtn();
    return;
  }

  if (state.isRunning) {
    // pause
    state.isPaused = true;
    clearInterval(state.intervalId);
    state.intervalId = null;
    updateStartBtn();
    return;
  }

  // fresh start
  state.isRunning = true;
  state.isPaused = false;
  loadDurations();
  state.totalTime = state.durations[state.mode] * 60;
  if (state.totalTime !== state.timeLeft + 1) { // allow restart from reset
    state.timeLeft = state.totalTime;
  }
  state.intervalId = setInterval(tick, 1000);
  updateStartBtn();
  updatePhaseLabel();
}

function resetTimer() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.isRunning = false;
  state.isPaused = false;
  loadDurations();
  state.totalTime = state.durations[state.mode] * 60;
  state.timeLeft = state.totalTime;
  updateDisplay();
  updateStartBtn();
  progressRing.style.strokeDashoffset = '0';
  updatePhaseLabel();
}

function tick() {
  if (state.timeLeft <= 0) {
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.isRunning = false;
    state.isPaused = false;
    updateStartBtn();

    if (state.mode === 'work') {
      state.sessions++;
      updateSessionCount();
      playBeep();
      sendNotification('专注完成 🎉', `已完成 ${state.sessions} 个番茄钟！`);

      const nextMode = state.sessions % 4 === 0 ? 'longBreak' : 'shortBreak';
      setTimeout(() => switchMode(nextMode), 1000);
    } else {
      playBeep();
      sendNotification('休息结束', '该开始下一轮专注了！');
      setTimeout(() => switchMode('work'), 1000);
    }
    progressRing.style.strokeDashoffset = '0';
    updatePhaseLabel();
    return;
  }

  state.timeLeft--;
  updateDisplay();
}

// ── Notes ──
function createNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';
  card.dataset.id = note.id;

  const time = new Date(note.createdAt);
  const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  if (note.editing) {
    card.innerHTML = `
      <div class="note-card-header">
        <span class="note-card-time">${timeStr}</span>
        <div class="note-card-actions">
          <button class="del-btn" data-action="delete" title="删除">✕</button>
        </div>
      </div>
      <textarea placeholder="写点笔记..." data-action="edit-text">${escapeHtml(note.content)}</textarea>
    `;
  } else {
    card.innerHTML = `
      <div class="note-card-header">
        <span class="note-card-time">${timeStr}</span>
        <div class="note-card-actions">
          <button class="edit-btn" data-action="edit" title="编辑">✎</button>
          <button class="del-btn" data-action="delete" title="删除">✕</button>
        </div>
      </div>
      <div class="note-card-view" data-action="view">${escapeHtml(note.content) || '<span style="color:var(--text-dim)">点击编辑...</span>'}</div>
    `;
  }

  // Event delegation for card actions
  card.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'edit') {
      enterEditMode(note.id);
    } else if (action === 'delete') {
      deleteNote(note.id);
    } else if (action === 'view' && !note.editing) {
      enterEditMode(note.id);
    }
  });

  // Live edit: auto-save on blur for textarea
  card.addEventListener('focusout', (e) => {
    if (e.target.matches('textarea')) {
      const val = e.target.value.trim();
      const n = state.notes.find(n => n.id === note.id);
      if (n) {
        n.content = val;
        n.editing = false;
        markDirty();
        renderNotes();
        setTimeout(() => autoSave(), 200);
      }
    }
  });

  // Save on Enter (but not Shift+Enter)
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.matches('textarea')) {
      e.target.blur();
    }
  });

  // Focus textarea when entering edit mode
  if (note.editing) {
    setTimeout(() => {
      const ta = card.querySelector('textarea');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 50);
  }

  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function renderNotes() {
  const empty = notesList.querySelector('.notes-empty');

  // Remove all note cards but keep empty state
  notesList.querySelectorAll('.note-card').forEach(el => el.remove());

  if (state.notes.length === 0) {
    if (!empty) {
      const div = document.createElement('div');
      div.className = 'notes-empty';
      div.textContent = '暂无备忘录，点击「+ 新建」开始记录';
      notesList.appendChild(div);
    }
    return;
  }

  if (empty) empty.remove();

  state.notes.forEach(note => {
    notesList.appendChild(createNoteCard(note));
  });
}

function addNote() {
  const newNote = {
    id: ++state.noteIdCounter,
    content: '',
    createdAt: Date.now(),
    editing: true,
  };
  state.notes.unshift(newNote);
  renderNotes();
  markDirty();
}

function enterEditMode(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  note.editing = true;
  renderNotes();
}

function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  renderNotes();
  markDirty();
  autoSave();
}

function markDirty() {
  state.dirty = true;
}

function autoSave() {
  if (!state.dirty) return;
  const data = state.notes.map(n => ({
    id: n.id,
    content: n.content,
    createdAt: n.createdAt,
  }));
  if (window.electronAPI?.saveNotes) {
    window.electronAPI.saveNotes(data).then(() => {
      state.dirty = false;
      showSavedStatus();
    });
  } else {
    // Fallback: localStorage
    try {
      localStorage.setItem('pomodoro-notes', JSON.stringify(data));
      state.dirty = false;
      showSavedStatus();
    } catch {}
  }
}

let statusTimeout = null;
function showSavedStatus() {
  notesStatus.textContent = '已保存';
  notesStatus.classList.add('show');
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    notesStatus.classList.remove('show');
  }, 2000);
}

async function loadNotes() {
  let data = [];
  if (window.electronAPI?.loadNotes) {
    data = await window.electronAPI.loadNotes();
  } else {
    try {
      const raw = localStorage.getItem('pomodoro-notes');
      if (raw) data = JSON.parse(raw);
    } catch {}
  }
  state.notes = data.map(n => ({ ...n, editing: false }));
  state.noteIdCounter = data.reduce((max, n) => Math.max(max, n.id || 0), 0);
  renderNotes();
}

// ── Settings sync ──
function setupDurationInputs() {
  ['work', 'shortBreak', 'longBreak'].forEach(mode => {
    const input = document.getElementById(mode + 'Duration');
    input.addEventListener('change', () => {
      if (!state.isRunning) {
        loadDurations();
        state.totalTime = state.durations[state.mode] * 60;
        state.timeLeft = state.totalTime;
        updateDisplay();
        progressRing.style.strokeDashoffset = '0';
      }
    });
  });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  // Load notes
  await loadNotes();

  // Setup duration inputs
  setupDurationInputs();

  // Mode buttons
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.isRunning && !confirm('切换模式将重置计时器，确定吗？')) return;
      switchMode(btn.dataset.mode);
    });
  });

  // Controls
  startBtn.addEventListener('click', startTimer);
  resetBtn.addEventListener('click', resetTimer);

  // Notes
  document.getElementById('addNoteBtn').addEventListener('click', addNote);
  document.getElementById('saveNotesBtn').addEventListener('click', autoSave);

  // Auto-save every 30 seconds if dirty
  setInterval(() => autoSave(), 30000);

  // Auto-save before unload
  window.addEventListener('beforeunload', () => autoSave());

  // Initial display
  switchMode('work');
});
