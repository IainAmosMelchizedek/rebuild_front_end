// =============================================================
// app.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Application controller. Wires together all modules and manages
// UI interactions, timer state, and storage.
//
// HOW IT FITS:
// - Loaded last in index.html (depends on other JS files).
// - Instantiates MandalaGenerator (mandala.js) + IntentionAudioEngine (audio.js).
// - Uses IntentionAnalyzer (intention-analyzer.js) for local analysis.
// - Uses hashing utilities from hash-encoder.js.
//
// SESSION DATA STUB:
// Session records are stored in localStorage for now.
// BACKEND CONTRACT (STUB): this will become POST /api/sessions later.
//
// NEW: SAVED INTENTIONS TAB + DURABILITY STUB
// - Local browser storage can be wiped if a user clears browsing data.
// - Durable recovery requires a backend + user identity (account/auth).
// - We implement two stores now:
//     LocalIntentionsStore  (works today; NOT durable if browser data cleared)
//     CloudIntentionsStore  (STUB: placeholders for future API/DB integration)
//
// CONTRACT MARKERS:
// Any block labeled "BACKEND CONTRACT (STUB)" marks future server work.
// =============================================================

/* global MandalaGenerator, IntentionAudioEngine, IntentionAnalyzer, generateHash */

// ─────────────────────────────────────────────
// MODULE INSTANCES & GLOBAL STATE
// ─────────────────────────────────────────────

let mandalaGen         = null;
let audioEngine        = null;

let currentIntention   = '';
let currentHash        = '';
let currentHashNumbers = [];

// Timer state
let timerInterval    = null;
let timerSeconds     = 0;
let sessionDuration  = 0;           // total seconds selected (captured at timer start)
let sessionStyle     = 'sacred';    // style captured at session start/end

// localStorage keys — namespaced to avoid conflicts with other apps
const STORAGE_KEY         = 'intentionKeeper_intentions';
const SESSION_STORAGE_KEY = 'intentionKeeper_sessions';

// Scroll wheel state — default to 5 minutes so wheels are never at zero on load
let selectedHours   = 0;
let selectedMinutes = 5;
let selectedSeconds = 0;

// ─────────────────────────────────────────────
// PERSISTENCE LAYER (LOCAL + CLOUD STUB)
// ─────────────────────────────────────────────
//
// Why this exists:
// - Saved Intentions must work today without a backend.
// - We want a clean seam where backend sync can be added later.
//
// Important assumption:
// - If a user clears browser data, LocalIntentionsStore is wiped.
// - CloudIntentionsStore is where "durable ownership" will live once
//   authentication + API exists.
//

class LocalIntentionsStore {
  constructor(storageKey) {
    this.key = storageKey;
  }

  // Returns: [{ text, hash, timestamp }, ...]
  async list() {
    try {
      const raw = localStorage.getItem(this.key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('LocalIntentionsStore.list failed:', e);
      return [];
    }
  }

  // Adds newest at front; skips consecutive duplicates (same text)
  async addUnique(intentionText, hash) {
    const intentions = await this.list();

    // Same behavior as your baseline: avoid consecutive duplicates
    if (intentions.length > 0 && intentions[0].text === intentionText) {
      return { skipped: true };
    }

    intentions.unshift({
      text: intentionText,
      hash: hash,
      timestamp: new Date().toISOString()
    });

    try {
      localStorage.setItem(this.key, JSON.stringify(intentions));
    } catch (e) {
      console.warn('LocalIntentionsStore.addUnique failed:', e);
    }

    return { skipped: false };
  }

  async removeAt(index) {
    const intentions = await this.list();
    intentions.splice(index, 1);
    try {
      localStorage.setItem(this.key, JSON.stringify(intentions));
    } catch (e) {
      console.warn('LocalIntentionsStore.removeAt failed:', e);
    }
  }

  async clear() {
    localStorage.removeItem(this.key);
  }
}

class CloudIntentionsStore {
  // BACKEND CONTRACT (STUB)
  //
  // This store is the durability layer:
  // intentions must survive local browser storage deletion.
  //
  // Suggested future API:
  //   GET    /api/intentions          -> list
  //   POST   /api/intentions          -> create {text, hash, timestamp}
  //   DELETE /api/intentions/:id      -> delete by stable ID
  //
  // Critical future requirement:
  // - Intentions must be tied to an authenticated user.
  // - Records must have stable IDs for deletes/updates.

  async list() {
    // TODO: return fetch('/api/intentions').then(r => r.json())
    return [];
  }

  async addUnique(_intentionText, _hash) {
    // TODO: POST to backend
    return { skipped: false };
  }

  async removeById(_id) {
    // TODO: DELETE /api/intentions/:id
    return;
  }

  async clear() {
    // TODO: optional endpoint to clear all
    return;
  }
}

class IntentionsRepository {
  constructor({ localStore, cloudStore, enableCloudSync }) {
    this.local = localStore;
    this.cloud = cloudStore;
    this.enableCloudSync = !!enableCloudSync;
  }

  async list() {
    // Default behavior: local only
    const localItems = await this.local.list();
    if (!this.enableCloudSync) return localItems;

    // Future behavior: merge cloud + local.
    // NOTE: This merge is intentionally conservative; backend will eventually
    // return stable IDs which makes merging and deleting safe.
    const cloudItems = await this.cloud.list();

    const keyOf = (x) => `${x.hash}::${x.timestamp}::${x.text}`;
    const seen = new Set();
    const merged = [];

    for (const it of cloudItems) {
      const k = keyOf(it);
      if (!seen.has(k)) { seen.add(k); merged.push(it); }
    }
    for (const it of localItems) {
      const k = keyOf(it);
      if (!seen.has(k)) { seen.add(k); merged.push(it); }
    }

    return merged;
  }

  async addUnique(intentionText, hash) {
    const result = await this.local.addUnique(intentionText, hash);

    // Best-effort cloud sync; UI should not break if cloud is offline/unimplemented.
    if (this.enableCloudSync && !result.skipped) {
      try {
        await this.cloud.addUnique(intentionText, hash);
      } catch (e) {
        console.warn('CloudIntentionsStore.addUnique failed (stub/offline):', e);
      }
    }

    return result;
  }

  async removeAt(index) {
    // Local delete is safe because local list order is what user is viewing.
    await this.local.removeAt(index);

    if (this.enableCloudSync) {
      // BACKEND CONTRACT (STUB)
      // Cloud deletes must not be index-based. They must use a stable ID.
      // When backend exists, list() must return IDs and the UI must use them.
      console.warn('Cloud delete skipped: requires stable backend IDs.');
    }
  }

  async clear() {
    await this.local.clear();

    if (this.enableCloudSync) {
      try {
        await this.cloud.clear();
      } catch (e) {
        console.warn('CloudIntentionsStore.clear failed (stub/offline):', e);
      }
    }
  }
}

// Repository instance (cloud sync OFF until backend + auth exist)
const intentionsRepo = new IntentionsRepository({
  localStore: new LocalIntentionsStore(STORAGE_KEY),
  cloudStore: new CloudIntentionsStore(),
  enableCloudSync: false
});


// ─────────────────────────────────────────────
// TAB CONTROLLER (SESSION ↔ SAVED)
// ─────────────────────────────────────────────
//
// This MUST match index.html IDs:
//   - Buttons: tabSessionBtn, tabSavedBtn
//   - Panels : tabSessionPanel, tabSavedPanel
//
// Design goal:
// - Saved Intentions are never “pushed down” by session UI,
//   because they live in a different panel entirely.
//

function initTabs() {
  const tabSessionBtn   = document.getElementById('tabSessionBtn');
  const tabSavedBtn     = document.getElementById('tabSavedBtn');
  const tabSessionPanel = document.getElementById('tabSessionPanel');
  const tabSavedPanel   = document.getElementById('tabSavedPanel');

  // If the HTML hasn’t been updated yet, do nothing (app remains usable).
  if (!tabSessionBtn || !tabSavedBtn || !tabSessionPanel || !tabSavedPanel) {
    return {
      setActiveTab: () => {},
      hasTabs: false
    };
  }

  function setActiveTab(which) {
    const isSession = which === 'session';

    tabSessionBtn.classList.toggle('active', isSession);
    tabSavedBtn.classList.toggle('active', !isSession);

    tabSessionBtn.setAttribute('aria-selected', String(isSession));
    tabSavedBtn.setAttribute('aria-selected', String(!isSession));

    tabSessionPanel.classList.toggle('active', isSession);
    tabSavedPanel.classList.toggle('active', !isSession);

    // When entering Saved tab, refresh list so it reflects latest adds/deletes.
    if (!isSession) {
      renderIntentionsList().catch((e) => console.warn('renderIntentionsList failed:', e));
    }
  }

  tabSessionBtn.addEventListener('click', () => setActiveTab('session'));
  tabSavedBtn.addEventListener('click', () => setActiveTab('saved'));

  // Default on load
  setActiveTab('session');

  return {
    setActiveTab,
    hasTabs: true
  };
}


// ─────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  const tabs = initTabs();

  const canvas            = document.getElementById('mandalaCanvas');
  const analyzeBtn        = document.getElementById('analyzeBtn');
  const acceptReframeBtn  = document.getElementById('acceptReframeBtn');
  const keepOriginalBtn   = document.getElementById('keepOriginalBtn');
  const generateDirectBtn = document.getElementById('generateDirectBtn');
  const muteBtn           = document.getElementById('muteBtn');
  const intentionInput    = document.getElementById('intentionInput');
  const wordCountDisplay  = document.getElementById('wordCount');
  const wordWarning       = document.getElementById('wordWarning');
  const cancelTimerBtn    = document.getElementById('cancelTimerBtn');
  const newSessionBtn     = document.getElementById('newSessionBtn');
  const clearAllBtn       = document.getElementById('clearAllBtn');
  const startTimerBtn     = document.getElementById('startTimerBtn');

  // Core engines
  mandalaGen  = new MandalaGenerator(canvas);
  audioEngine = new IntentionAudioEngine();

  // Build scroll wheel pickers
  buildWheel('hoursWheel',   0,  2,  selectedHours,   (val) => { selectedHours   = val; });
  buildWheel('minutesWheel', 0, 59, selectedMinutes, (val) => { selectedMinutes = val; });
  buildWheel('secondsWheel', 0, 59, selectedSeconds, (val) => { selectedSeconds = val; });

  // Render intentions list once at boot (Saved tab will re-render on entry).
  renderIntentionsList().catch((e) => console.warn('renderIntentionsList failed:', e));

  // ── WORD COUNTER ──────────────────────────────────────────
  intentionInput.addEventListener('input', function() {
    const text      = intentionInput.value.trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    wordCountDisplay.textContent = wordCount;

    if (wordCount > 50) {
      wordWarning.style.display    = 'inline';
      analyzeBtn.disabled          = true;
      wordCountDisplay.style.color = '#e74c3c';
    } else {
      wordWarning.style.display    = 'none';
      analyzeBtn.disabled          = false;
      wordCountDisplay.style.color = '#f39c12';
    }
  });

  // ── ANALYZE BUTTON ────────────────────────────────────────
  // STUB (BACKEND CONTRACT): replace local analyzer with backend AI call later.
  analyzeBtn.addEventListener('click', async function() {
    const intention = intentionInput.value.trim();
    if (!intention) { alert('Please enter an intention first.'); return; }

    // Always ensure we’re in Session tab when running the flow.
    tabs.setActiveTab('session');

    const analysisSection = document.getElementById('analysisSection');
    analysisSection.style.display = 'block';
    analysisSection.scrollIntoView({ behavior: 'smooth' });

    await analyzeIntention(intention);
  });

  // ── ACCEPT REFRAME ────────────────────────────────────────
  acceptReframeBtn.addEventListener('click', async function() {
    tabs.setActiveTab('session');
    const reframedText = document.getElementById('reframedText').textContent;
    await generateMandala(reframedText, tabs);
  });

  // ── KEEP ORIGINAL ─────────────────────────────────────────
  keepOriginalBtn.addEventListener('click', async function() {
    tabs.setActiveTab('session');
    await generateMandala(currentIntention, tabs);
  });

  // ── DIRECT GENERATE ───────────────────────────────────────
  generateDirectBtn.addEventListener('click', async function() {
    tabs.setActiveTab('session');
    await generateMandala(currentIntention, tabs);
  });

  // ── STYLE TOGGLE ──────────────────────────────────────────
  const sacredBtn = document.getElementById('sacredBtn');
  const cosmicBtn = document.getElementById('cosmicBtn');

  sacredBtn.addEventListener('click', function() {
    mandalaGen.setStyle('sacred');
    sessionStyle = 'sacred';
    sacredBtn.classList.add('active');
    cosmicBtn.classList.remove('active');
  });

  cosmicBtn.addEventListener('click', function() {
    mandalaGen.setStyle('cosmic');
    sessionStyle = 'cosmic';
    cosmicBtn.classList.add('active');
    sacredBtn.classList.remove('active');
  });

  // ── MUTE / UNMUTE ─────────────────────────────────────────
  muteBtn.addEventListener('click', function() {
    if (!audioEngine) return;
    const isMuted = audioEngine.toggleMute();
    muteBtn.textContent = isMuted ? '🔇 Unmute Schumann Resonance' : '🔊 Mute Schumann Resonance';
  });

  // ── BEGIN MEDITATION ──────────────────────────────────────
  startTimerBtn.addEventListener('click', function() {
    const totalSeconds = (selectedHours * 3600) + (selectedMinutes * 60) + selectedSeconds;
    if (totalSeconds === 0) {
      alert('Please select a meditation duration greater than zero.');
      return;
    }

    tabs.setActiveTab('session');

    sessionDuration = totalSeconds;
    sessionStyle    = mandalaGen.style;
    startTimer(totalSeconds);
  });

  // ── CANCEL TIMER ──────────────────────────────────────────
  cancelTimerBtn.addEventListener('click', function() {
    cancelTimer();
  });

  // ── STOP MEDITATION ───────────────────────────────────────
  document.getElementById('stopMeditationBtn').addEventListener('click', function() {
    saveSessionData(false);
    endSession(false);
  });

  // ── NEW SESSION ───────────────────────────────────────────
  newSessionBtn.addEventListener('click', function() {
    window.location.reload();
  });

  // ── CLEAR ALL INTENTIONS ──────────────────────────────────
  clearAllBtn.addEventListener('click', async function() {
    if (confirm('Are you sure you want to delete all saved intentions? This cannot be undone.')) {
      await intentionsRepo.clear();
      await renderIntentionsList();
    }
  });
});


// ─────────────────────────────────────────────
// SCROLL WHEEL PICKER
// ─────────────────────────────────────────────

function buildWheel(containerId, min, max, defaultValue, onChange) {
  const container = document.getElementById(containerId);
  const track     = document.createElement('div');
  track.className = 'wheel-track';

  const items = [];
  for (let i = min; i <= max; i++) {
    const item = document.createElement('div');
    item.className     = 'wheel-item';
    item.textContent   = String(i).padStart(2, '0');
    item.dataset.value = i;
    track.appendChild(item);
    items.push(item);
  }
  container.appendChild(track);

  const itemHeight = 44; // must match CSS .wheel-item height exactly
  const totalItems = max - min + 1;

  function snapToIndex(index) {
    const clamped = Math.max(0, Math.min(index, totalItems - 1));
    track.style.transform = `translateY(${-clamped * itemHeight}px)`;

    items.forEach((item, i) => {
      item.classList.remove('selected', 'near-selected');
      if (i === clamped) item.classList.add('selected');
      else if (Math.abs(i - clamped) === 1) item.classList.add('near-selected');
    });

    onChange(min + clamped);
  }

  snapToIndex(defaultValue - min);

  // Mouse drag
  let isDragging    = false;
  let startY        = 0;
  let currentOffset = (defaultValue - min) * itemHeight;

  container.addEventListener('mousedown', (e) => {
    isDragging    = true;
    startY        = e.clientY;
    currentOffset = Math.abs(parseInt(track.style.transform.replace('translateY(', '') || '0', 10));
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta     = startY - e.clientY;
    const newOffset = Math.max(0, Math.min(currentOffset + delta, (totalItems - 1) * itemHeight));
    track.style.transform = `translateY(${-newOffset}px)`;
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const delta    = startY - e.clientY;
    const rawIndex = Math.round((currentOffset + delta) / itemHeight);
    snapToIndex(rawIndex);
  });

  // Touch drag
  let touchStartY      = 0;
  let touchStartOffset = (defaultValue - min) * itemHeight;

  container.addEventListener('touchstart', (e) => {
    touchStartY      = e.touches[0].clientY;
    touchStartOffset = Math.abs(parseInt(track.style.transform.replace('translateY(', '') || '0', 10));
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    const delta     = touchStartY - e.touches[0].clientY;
    const newOffset = Math.max(0, Math.min(touchStartOffset + delta, (totalItems - 1) * itemHeight));
    track.style.transform = `translateY(${-newOffset}px)`;
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    const delta    = touchStartY - e.changedTouches[0].clientY;
    const rawIndex = Math.round((touchStartOffset + delta) / itemHeight);
    snapToIndex(rawIndex);
  });

  // Mouse wheel
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const currentIndex = Math.round(
      Math.abs(parseInt(track.style.transform.replace('translateY(', '') || '0', 10)) / itemHeight
    );
    snapToIndex(currentIndex + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
}


// ─────────────────────────────────────────────
// INTENTION STORAGE (via repository)
// ─────────────────────────────────────────────
//
// BACKEND CONTRACT (STUB):
// To survive browser data deletion, enableCloudSync and implement CloudIntentionsStore.
//

async function saveIntention(intentionText, hash) {
  await intentionsRepo.addUnique(intentionText, hash);
  await renderIntentionsList();
}

async function loadIntentions() {
  return await intentionsRepo.list();
}

async function deleteIntention(index) {
  await intentionsRepo.removeAt(index);
  await renderIntentionsList();
}


// ─────────────────────────────────────────────
// SESSION DATA STORAGE (STUB FOR BACKEND)
// ─────────────────────────────────────────────
//
// BACKEND CONTRACT (STUB):
// Replace localStorage with POST /api/sessions and appropriate auth.
//

function saveSessionData(completed) {
  if (!currentIntention || !currentHash) return;

  const sessionRecord = {
    text:      currentIntention,
    hash:      currentHash,
    timestamp: new Date().toISOString(),
    duration:  sessionDuration,
    style:     sessionStyle,
    completed: completed
  };

  try {
    const existing = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    existing.unshift(sessionRecord);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(existing));
    console.log('Session saved:', sessionRecord);
  } catch (e) {
    console.warn('Could not save session data:', e);
  }
}


// ─────────────────────────────────────────────
// INTENTIONS LIST RENDER
// ─────────────────────────────────────────────
//
// Render target is strictly the Saved panel DOM:
//   - intentionsSection
//   - intentionsList
//
// Behavior:
// - If user clicks an intention: switch to Session tab, set input, generate.
// - Delete is local-only unless backend IDs exist.
//

async function renderIntentionsList() {
  const intentions = await loadIntentions();
  const section    = document.getElementById('intentionsSection');
  const list       = document.getElementById('intentionsList');

  if (!section || !list) return;

  // In the Saved tab, we keep the section visible even if empty,
  // but we hide the list content gracefully.
  list.innerHTML = '';

  if (intentions.length === 0) {
    section.style.display = 'block';
    const empty = document.createElement('div');
    empty.style.opacity = '0.8';
    empty.style.padding = '8px 0';
    empty.textContent = 'No saved intentions yet. Generate a mandala to save one.';
    list.appendChild(empty);
    return;
  }

  section.style.display = 'block';

  intentions.forEach((entry, index) => {
    const card = document.createElement('div');
    card.className = 'intention-card';

    const date      = new Date(entry.timestamp);
    const formatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit'
    });

    card.innerHTML = `
      <div class="intention-card-content">
        <div class="intention-card-text">${entry.text}</div>
        <div class="intention-card-date">${formatted} &nbsp;·&nbsp; ${entry.hash.substring(0, 12)}...</div>
      </div>
      <button class="intention-delete-btn" data-index="${index}">Delete</button>
    `;

    // Clicking content: switch to Session tab then regenerate mandala
    card.querySelector('.intention-card-content').addEventListener('click', async function() {
      // Switch tab (if tabs exist). Safe no-op if missing.
      const tabSessionBtn = document.getElementById('tabSessionBtn');
      if (tabSessionBtn) tabSessionBtn.click();

      const input = document.getElementById('intentionInput');
      if (input) input.value = entry.text;

      await generateMandala(entry.text);
    });

    // Delete button
    card.querySelector('.intention-delete-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      deleteIntention(index).catch((err) => console.warn('deleteIntention failed:', err));
    });

    list.appendChild(card);
  });
}


// ─────────────────────────────────────────────
// CONSCIOUSNESS ANALYSIS
// ─────────────────────────────────────────────
//
// BACKEND CONTRACT (STUB):
// Replace IntentionAnalyzer with backend API call.
// Response shape should match: severity, feedback, reframe, transcendentCount.
//

async function analyzeIntention(intention) {
  currentIntention = intention;

  const feedbackDiv           = document.getElementById('feedbackMessage');
  const reframedSection       = document.getElementById('reframedSection');
  const directGenerateSection = document.getElementById('directGenerateSection');
  const reframedText          = document.getElementById('reframedText');
  const keepOriginalBtn       = document.getElementById('keepOriginalBtn');

  const analysis = IntentionAnalyzer.analyze(intention);
  feedbackDiv.innerHTML = analysis.feedback.replace(/\n/g, '<br>');

  if (analysis.severity === 'unconscious') {
    feedbackDiv.className         = 'feedback-message feedback-harmful';
    reframedText.textContent      = IntentionAnalyzer.reframe(intention);
    reframedSection.style.display = 'block';
    keepOriginalBtn.style.display = 'none';
    directGenerateSection.style.display = 'none';
  } else if (analysis.severity === 'neutral') {
    feedbackDiv.className         = 'feedback-message feedback-warning';
    reframedText.textContent      = IntentionAnalyzer.reframe(intention);
    reframedSection.style.display = 'block';
    keepOriginalBtn.style.display = 'inline-block';
    directGenerateSection.style.display = 'none';
  } else {
    feedbackDiv.className = analysis.transcendentCount > 0
      ? 'feedback-message feedback-transcendent'
      : 'feedback-message feedback-conscious';
    reframedSection.style.display       = 'none';
    directGenerateSection.style.display = 'block';
  }
}


// ─────────────────────────────────────────────
// MANDALA GENERATION
// ─────────────────────────────────────────────
//
// BACKEND CONTRACT (OPTIONAL FUTURE):
// If hashing becomes server-only, replace generateHash()/mandalaGen.generate flow.
// For now, hashing stays local/deterministic.
//

async function generateMandala(intentionText) {
  const mandalaSection  = document.getElementById('mandalaSection');
  const hashDisplay     = document.getElementById('hashDisplay');
  const muteBtn         = document.getElementById('muteBtn');
  const mandalaWrapper  = document.getElementById('mandalaWrapper');
  const sessionComplete = document.getElementById('sessionComplete');
  const timerSection    = document.getElementById('timerSection');
  const countdown       = document.getElementById('countdown');

  // Reset dissolve + timer state for a clean generation
  mandalaWrapper.classList.remove('fading');
  mandalaWrapper.style.opacity  = '1';
  sessionComplete.style.display = 'none';
  timerSection.style.display    = 'block';
  countdown.style.display       = 'none';
  cancelTimer();

  mandalaSection.style.display = 'block';
  mandalaSection.scrollIntoView({ behavior: 'smooth' });

  if (audioEngine) audioEngine.stop();

  const hash = await mandalaGen.generate(intentionText);

  currentHash        = hash;
  currentHashNumbers = mandalaGen.hashNumbers;
  currentIntention   = intentionText;

  hashDisplay.textContent = hash.substring(0, 16) + '...';

  mandalaGen.startBreathing();

  // Saved intentions write happens here to keep "saved" aligned with the hash identity.
  await saveIntention(intentionText, hash);

  if (audioEngine) {
    audioEngine.start(currentHashNumbers);
    muteBtn.textContent = '🔊 Mute Schumann Resonance';
  }
}


// ─────────────────────────────────────────────
// MEDITATION TIMER
// ─────────────────────────────────────────────

function startTimer(totalSeconds) {
  cancelTimer();
  timerSeconds = totalSeconds;

  const wheelPicker   = document.getElementById('wheelPicker');
  const startTimerBtn = document.getElementById('startTimerBtn');
  const timerLabel    = document.querySelector('.timer-label');
  const countdown     = document.getElementById('countdown');
  const stopBtn       = document.getElementById('stopMeditationBtn');

  wheelPicker.style.display   = 'none';
  startTimerBtn.style.display = 'none';
  timerLabel.style.display    = 'none';
  countdown.style.display     = 'flex';
  stopBtn.style.display       = 'block';

  updateCountdownDisplay(timerSeconds);

  timerInterval = setInterval(() => {
    timerSeconds--;
    updateCountdownDisplay(timerSeconds);

    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      saveSessionData(true);
      endSession(true);
    }
  }, 1000);
}

function updateCountdownDisplay(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  document.getElementById('countdownDisplay').textContent =
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function cancelTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSeconds = 0;

  const wheelPicker   = document.getElementById('wheelPicker');
  const startTimerBtn = document.getElementById('startTimerBtn');
  const timerLabel    = document.querySelector('.timer-label');
  const countdown     = document.getElementById('countdown');
  const stopBtn       = document.getElementById('stopMeditationBtn');

  if (wheelPicker)   wheelPicker.style.display   = 'flex';
  if (startTimerBtn) startTimerBtn.style.display = 'block';
  if (timerLabel)    timerLabel.style.display    = 'block';
  if (countdown)     countdown.style.display     = 'none';
  if (stopBtn)       stopBtn.style.display       = 'none';
}

function endSession(_completed) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const timerSection    = document.getElementById('timerSection');
  const sessionComplete = document.getElementById('sessionComplete');
  const stopBtn         = document.getElementById('stopMeditationBtn');

  timerSection.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';

  if (mandalaGen) mandalaGen.spiralDissolve(8000);

  if (audioEngine && audioEngine.masterGain && audioEngine.ctx) {
    audioEngine.masterGain.gain.linearRampToValueAtTime(
      0,
      audioEngine.ctx.currentTime + 8
    );
  }

  setTimeout(() => {
    if (audioEngine) audioEngine.stop();
    sessionComplete.style.display = 'block';
    sessionComplete.scrollIntoView({ behavior: 'smooth' });
  }, 8000);
}
