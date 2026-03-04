// =============================================================
// app.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Application controller. Wires together all modules and manages
// every user interaction, timer state, and data storage operation.
//
// HOW IT FITS:
// - Loaded last in index.html — depends on all other JS files
// - Instantiates MandalaGenerator (mandala.js) and IntentionAudioEngine (audio.js)
// - Calls IntentionAnalyzer.analyze() and .reframe() (intention-analyzer.js)
// - Reads hash bytes from mandalaGen.hashNumbers (set by hash-encoder.js)
//
// SESSION DATA STUB:
// Each completed or stopped session saves a record to localStorage with:
//   text      — the intention text
//   hash      — SHA-256 hex string (MERIDIAN-HASH)
//   timestamp — ISO 8601 string of when the mandala was generated
//   duration  — total seconds selected on the scroll wheels
//   style     — 'sacred' or 'cosmic' at time of session end
//   completed — true if timer ran to zero, false if user stopped early
//
// This structure is ready to POST to the backend API when it is built.
// No DOM or structural changes are needed when that migration happens —
// only saveIntention() and saveSessionData() will be updated.
//
// TIMER FLOW:
//   Scroll wheels → Begin Meditation → countdown starts →
//   timer reaches zero OR user hits Stop Meditation →
//   spiralDissolve() + audio fade trigger together (8 seconds) →
//   session complete screen appears →
//   Begin New Session reloads page for clean state
//
// NEW: SAVED INTENTIONS TAB + CLOUD DURABILITY STUB
// Local browser storage (localStorage / IndexedDB) can be wiped if the user
// clears "browsing data/history". If the user must always be able to recover
// intentions even after clearing browsing data, this REQUIRES a backend tied
// to an account.
//
// We implement a two-backend repository now:
//   - LocalIntentionsStore  (works today; NOT durable if browser data cleared)
//   - CloudIntentionsStore  (STUB: placeholders for future API/DB integration)
//
// CONTRACT MARKERS:
// Any code path labeled "BACKEND CONTRACT (STUB)" is a future API contract
// that must be implemented server-side and wired client-side.
// =============================================================


/* global MandalaGenerator, IntentionAudioEngine, IntentionAnalyzer, generateHash, hexToNumbers, hashToSphericalCoords */


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
let sessionDuration  = 0; // total seconds selected — stored at session start
let sessionStyle     = 'sacred'; // tracks which style was active at session end

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
// - We want Saved Intentions to work today without backend.
// - We ALSO want a clean place to add backend sync later.
//
// IMPORTANT:
// - Local storage is NOT durable if user clears browsing data.
// - CloudIntentionsStore is where durability will come from,
//   once backend + auth exists.
//

class LocalIntentionsStore {
    constructor(storageKey) {
        this.key = storageKey;
    }

    // Returns [{ text, hash, timestamp }, ...]
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

    // Prepend newest; optionally skip duplicates (same as existing behavior).
    async addUnique(intentionText, hash) {
        const intentions = await this.list();

        // Avoid consecutive duplicates (same as your prior logic).
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
    // This store is the durability layer: intentions survive local data deletion.
    //
    // Suggested API (future):
    //   GET    /api/intentions              -> list
    //   POST   /api/intentions              -> create {text, hash, timestamp}
    //   DELETE /api/intentions/:id OR body  -> delete
    //
    // Suggested auth (future):
    //   token-based auth; intentions belong to authenticated user.
    //
    // Current behavior:
    //   Stubbed to no-op so front end can ship without backend.

    async list() {
        // TODO: return fetch("/api/intentions").then(r => r.json())
        return [];
    }

    async addUnique(_intentionText, _hash) {
        // TODO: POST to backend
        return { skipped: false };
    }

    async removeAt(_indexOrId) {
        // TODO: DELETE in backend
        return;
    }

    async clear() {
        // TODO: backend "clear all" (optional)
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
        // Default: local only.
        const localItems = await this.local.list();
        if (!this.enableCloudSync) return localItems;

        // When enabled: merge cloud+local.
        // For now: cloud wins if duplicates exist (by hash+timestamp heuristic later).
        // This merge strategy will be refined once backend returns stable IDs.
        const cloudItems = await this.cloud.list();

        // Merge by (text+hash+timestamp) as a temporary identity.
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

        if (this.enableCloudSync && !result.skipped) {
            // Best-effort; UI should not break if cloud fails.
            try {
                await this.cloud.addUnique(intentionText, hash);
            } catch (e) {
                console.warn('CloudIntentionsStore.addUnique failed (stub/offline):', e);
            }
        }

        return result;
    }

    async removeAt(index) {
        await this.local.removeAt(index);

        if (this.enableCloudSync) {
            // BACKEND CONTRACT (STUB): we need a stable identifier for deletes.
            // Index-based deletes are not safe once cloud ordering differs.
            // When backend exists, intention records must have an ID.
            try {
                await this.cloud.removeAt(index);
            } catch (e) {
                console.warn('CloudIntentionsStore.removeAt failed (stub/offline):', e);
            }
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
// INITIALIZATION
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {

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

    // OPTIONAL (new tab UI). If these elements don't exist yet, app still works.
    const tabCreateBtn      = document.getElementById('tabCreateBtn');
    const tabSavedBtn       = document.getElementById('tabSavedBtn');
    const createPanel       = document.getElementById('createPanel');
    const savedPanel        = document.getElementById('savedIntentionsPanel');
    const saveIntentionBtn  = document.getElementById('saveIntentionBtn');

    mandalaGen  = new MandalaGenerator(canvas);
    audioEngine = new IntentionAudioEngine();

    // Build all three scroll wheel pickers and render saved intentions
    buildWheel('hoursWheel',   0,  2, selectedHours,   (val) => { selectedHours   = val; });
    buildWheel('minutesWheel', 0, 59, selectedMinutes, (val) => { selectedMinutes = val; });
    buildWheel('secondsWheel', 0, 59, selectedSeconds, (val) => { selectedSeconds = val; });

    // Render the list in the existing "My Intentions" section (baseline behavior).
    renderIntentionsList();

    // If tab UI exists, wire it.
    if (tabCreateBtn && tabSavedBtn && createPanel && savedPanel) {
        const showTab = (which) => {
            const isCreate = which === 'create';
            createPanel.style.display = isCreate ? 'block' : 'none';
            savedPanel.style.display  = isCreate ? 'none' : 'block';
            tabCreateBtn.setAttribute('aria-selected', isCreate ? 'true' : 'false');
            tabSavedBtn.setAttribute('aria-selected', isCreate ? 'false' : 'true');

            // When entering Saved tab, ensure list is fresh.
            if (!isCreate) renderIntentionsList();
        };

        tabCreateBtn.addEventListener('click', () => showTab('create'));
        tabSavedBtn.addEventListener('click', () => showTab('saved'));

        // Default to Create tab.
        showTab('create');
    }

    // Optional Save button: saves current input without requiring regeneration.
    // This is additive; the baseline already saves after generateMandala().
    if (saveIntentionBtn && intentionInput) {
        saveIntentionBtn.addEventListener('click', async function() {
            const text = intentionInput.value.trim();
            if (!text) { alert('Please enter an intention first.'); return; }

            // If we have a currentHash for the same text, reuse it; else generate hash only.
            // This keeps "saved intentions" consistent with MERIDIAN-HASH identity.
            let hash = currentHash;
            if (!hash || currentIntention !== text) {
                // BACKEND CONTRACT (STUB): If hashing becomes server-only later, replace this.
                hash = await generateHash(text);
            }

            await saveIntention(text, hash);
        });
    }


    // ── WORD COUNTER ──────────────────────────────────────────
    // Updates on every keystroke. Disables Analyze button and
    // shows warning when word count exceeds the 50-word limit.
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
    // Shows the analysis section and runs the consciousness scorer.
    // STUB: will call backend AI API instead of local analyzer.
    analyzeBtn.addEventListener('click', async function() {
        const intention = intentionInput.value.trim();
        if (!intention) { alert('Please enter an intention first.'); return; }
        const analysisSection = document.getElementById('analysisSection');
        analysisSection.style.display = 'block';
        analysisSection.scrollIntoView({ behavior: 'smooth' });
        await analyzeIntention(intention);
    });


    // ── ACCEPT REFRAME ────────────────────────────────────────
    // Generates mandala using the reframed intention text instead of original.
    acceptReframeBtn.addEventListener('click', async function() {
        const reframedText = document.getElementById('reframedText').textContent;
        await generateMandala(reframedText);
    });


    // ── KEEP ORIGINAL ─────────────────────────────────────────
    // Only available for neutral intentions — generates with original text.
    keepOriginalBtn.addEventListener('click', async function() {
        await generateMandala(currentIntention);
    });


    // ── DIRECT GENERATE ───────────────────────────────────────
    // Shown when intention passes consciousness analysis.
    generateDirectBtn.addEventListener('click', async function() {
        await generateMandala(currentIntention);
    });


    // ── STYLE TOGGLE ──────────────────────────────────────────
    // Switches between Sacred and Cosmic rendering styles instantly.
    // No re-hashing needed — setStyle() reuses stored hash parameters.
    // sessionStyle is updated here so the correct style is recorded
    // when the session ends.
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
    // Smooth gain ramp prevents audible click on toggle.
    // Button label switches between Mute and Unmute states.
    muteBtn.addEventListener('click', function() {
        if (!audioEngine) return;
        const isMuted       = audioEngine.toggleMute();
        muteBtn.textContent = isMuted
            ? '🔇 Unmute Schumann Resonance'
            : '🔊 Mute Schumann Resonance';
    });


    // ── BEGIN MEDITATION ──────────────────────────────────────
    // Validates that at least 1 second is selected, then starts timer.
    // Records sessionDuration at this point so it is captured even
    // if the user stops early.
    startTimerBtn.addEventListener('click', function() {
        const totalSeconds = (selectedHours * 3600) + (selectedMinutes * 60) + selectedSeconds;
        if (totalSeconds === 0) {
            alert('Please select a meditation duration greater than zero.');
            return;
        }
        sessionDuration = totalSeconds; // capture intended duration for session record
        sessionStyle    = mandalaGen.style; // capture current style at session start
        startTimer(totalSeconds);
    });


    // ── CANCEL TIMER ──────────────────────────────────────────
    // Restores the wheel picker UI without triggering dissolve.
    // Does NOT save a session record — cancel means the session never started.
    cancelTimerBtn.addEventListener('click', function() {
        cancelTimer();
    });


    // ── STOP MEDITATION ───────────────────────────────────────
    // Triggers the same spiral dissolve as a completed session,
    // but records completed: false to mark the early exit.
    document.getElementById('stopMeditationBtn').addEventListener('click', function() {
        saveSessionData(false); // record early exit before dissolve clears state
        endSession(false);
    });


    // ── NEW SESSION ───────────────────────────────────────────
    // Full page reload guarantees clean audio, animation, and timer state.
    newSessionBtn.addEventListener('click', function() {
        window.location.reload();
    });


    // ── CLEAR ALL INTENTIONS ──────────────────────────────────
    clearAllBtn.addEventListener('click', async function() {
        if (confirm('Are you sure you want to delete all saved intentions? This cannot be undone.')) {
            await intentionsRepo.clear();
            renderIntentionsList();
        }
    });

}); // end DOMContentLoaded


// ─────────────────────────────────────────────
// SCROLL WHEEL PICKER
// ─────────────────────────────────────────────

// Builds an iPhone-style scroll wheel for a numeric range.
// Attaches mouse drag, touch drag, and mouse wheel scroll handlers.
// Snaps to the nearest item after every gesture ends.
//
// containerId  — ID of the .wheel-scroll div in index.html
// min / max    — numeric range to display
// defaultValue — which value is selected when the wheel first renders
// onChange     — callback fired with the new value on every snap
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

    // Snaps wheel to the nearest item and fires onChange with the new value.
    // Clamps index so it never goes out of range.
    function snapToIndex(index) {
        const clamped = Math.max(0, Math.min(index, totalItems - 1));
        track.style.transform = `translateY(${-clamped * itemHeight}px)`;

        items.forEach((item, i) => {
            item.classList.remove('selected', 'near-selected');
            if (i === clamped)                    item.classList.add('selected');
            else if (Math.abs(i - clamped) === 1) item.classList.add('near-selected');
        });

        onChange(min + clamped);
    }

    // Initialize wheel at the default value on page load
    snapToIndex(defaultValue - min);

    // ── MOUSE DRAG ────────────────────────────────────────────
    let isDragging    = false;
    let startY        = 0;
    let currentOffset = (defaultValue - min) * itemHeight;

    container.addEventListener('mousedown', (e) => {
        isDragging    = true;
        startY        = e.clientY;
        currentOffset = Math.abs(parseInt(track.style.transform.replace('translateY(', '') || '0'));
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

    // ── TOUCH DRAG (mobile) ───────────────────────────────────
    let touchStartY      = 0;
    let touchStartOffset = (defaultValue - min) * itemHeight;

    container.addEventListener('touchstart', (e) => {
        touchStartY      = e.touches[0].clientY;
        touchStartOffset = Math.abs(parseInt(track.style.transform.replace('translateY(', '') || '0'));
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

    // ── MOUSE WHEEL SCROLL ────────────────────────────────────
    // Allows desktop users to scroll the picker with the mouse wheel
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const currentIndex = Math.round(
            Math.abs(parseInt(track.style.transform.replace('translateY(', '') || '0')) / itemHeight
        );
        snapToIndex(currentIndex + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
}


// ─────────────────────────────────────────────
// INTENTION STORAGE
// ─────────────────────────────────────────────
//
// STUB (BACKEND CONTRACT):
// If you need intentions to survive browser data deletion, this must sync to backend.
// The repository is already in place; enableCloudSync + implement CloudIntentionsStore.
//

// Saves intention text, hash, and timestamp to localStorage.
// Skips duplicate consecutive entries to avoid redundant storage.
// STUB: will POST to backend API when server is ready.
async function saveIntention(intentionText, hash) {
    // Repository maintains the same behavior as your baseline saveIntention().
    await intentionsRepo.addUnique(intentionText, hash);
    renderIntentionsList();
}

async function loadIntentions() {
    // NOTE: This stays async because later it may call backend.
    return await intentionsRepo.list();
}

async function deleteIntention(index) {
    await intentionsRepo.removeAt(index);
    renderIntentionsList();
}


// ─────────────────────────────────────────────
// SESSION DATA STORAGE (STUB FOR BACKEND)
// ─────────────────────────────────────────────
//
// STUB (BACKEND CONTRACT):
// Replace localStorage.setItem with POST to backend sessions endpoint.
// Suggested future endpoint:
//   POST /api/sessions  -> sessionRecord
//   GET  /api/sessions  -> history
//

function saveSessionData(completed) {
    if (!currentIntention || !currentHash) return; // no session to save

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
        console.log('Session saved:', sessionRecord); // visible in browser dev tools
    } catch(e) {
        console.warn('Could not save session data:', e);
    }
}


// ─────────────────────────────────────────────
// INTENTIONS LIST RENDER
// ─────────────────────────────────────────────
//
// This function renders to the EXISTING baseline DOM:
//  - intentionsSection
//  - intentionsList
// It also supports (optionally) rendering into a new tab panel if you
// choose to reuse the same IDs inside that panel.
//
// If you later change IDs for the Saved tab, this is the one place to update.
//

async function renderIntentionsList() {
    const intentions = await loadIntentions();
    const section    = document.getElementById('intentionsSection');
    const list       = document.getElementById('intentionsList');

    if (!section || !list) return;

    if (intentions.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = '';

    intentions.forEach((entry, index) => {
        const card     = document.createElement('div');
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

        // Clicking the card content regenerates that intention's mandala
        card.querySelector('.intention-card-content').addEventListener('click', async function() {
            document.getElementById('intentionInput').value = entry.text;
            await generateMandala(entry.text);
        });

        // Delete button removes only this entry, does not affect others
        card.querySelector('.intention-delete-btn').addEventListener('click', function(e) {
            e.stopPropagation(); // prevent card click from firing
            deleteIntention(index);
        });

        list.appendChild(card);
    });
}


// ─────────────────────────────────────────────
// CONSCIOUSNESS ANALYSIS
// ─────────────────────────────────────────────
//
// STUB (BACKEND CONTRACT):
// Replace IntentionAnalyzer.analyze() + .reframe() with a fetch() to backend.
// The response shape should match analyze() output: severity, feedback, reframe fields.
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
        // Hard block — reframe required, original cannot proceed
        feedbackDiv.className         = 'feedback-message feedback-harmful';
        reframedText.textContent      = IntentionAnalyzer.reframe(intention);
        reframedSection.style.display = 'block';
        keepOriginalBtn.style.display = 'none';
        directGenerateSection.style.display = 'none';

    } else if (analysis.severity === 'neutral') {
        // Soft warning — reframe offered, original allowed with acknowledgment
        feedbackDiv.className         = 'feedback-message feedback-warning';
        reframedText.textContent      = IntentionAnalyzer.reframe(intention);
        reframedSection.style.display = 'block';
        keepOriginalBtn.style.display = 'inline-block';
        directGenerateSection.style.display = 'none';

    } else {
        // Conscious or transcendent — proceed directly to generation
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
// STUB (BACKEND CONTRACT POSSIBILITY):
// If hashing ever becomes server-only, replace generateHash() usage.
// For now, hashing remains local and deterministic.
//

async function generateMandala(intentionText) {
    const mandalaSection  = document.getElementById('mandalaSection');
    const hashDisplay     = document.getElementById('hashDisplay');
    const muteBtn         = document.getElementById('muteBtn');
    const mandalaWrapper  = document.getElementById('mandalaWrapper');
    const sessionComplete = document.getElementById('sessionComplete');
    const timerSection    = document.getElementById('timerSection');
    const countdown       = document.getElementById('countdown');

    // Reset dissolve and timer state before drawing a new mandala
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

    // Display truncated hash below canvas — full hash is drawn on canvas itself
    hashDisplay.textContent = hash.substring(0, 16) + '...';
    mandalaGen.startBreathing();

    // Save intention record after successful generation
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
    cancelTimer(); // clear any existing interval first
    timerSeconds = totalSeconds;

    const wheelPicker   = document.getElementById('wheelPicker');
    const startTimerBtn = document.getElementById('startTimerBtn');
    const timerLabel    = document.querySelector('.timer-label');
    const countdown     = document.getElementById('countdown');
    const stopBtn       = document.getElementById('stopMeditationBtn');

    // Hide wheel picker UI, show countdown and stop button
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
            saveSessionData(true); // timer reached zero — session completed
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

function endSession(completed) {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const timerSection    = document.getElementById('timerSection');
    const sessionComplete = document.getElementById('sessionComplete');
    const stopBtn         = document.getElementById('stopMeditationBtn');

    timerSection.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';

    // Spiral dissolve and audio fade run simultaneously over 8 seconds
    if (mandalaGen) mandalaGen.spiralDissolve(8000);

    if (audioEngine && audioEngine.masterGain && audioEngine.ctx) {
        audioEngine.masterGain.gain.linearRampToValueAtTime(
            0,
            audioEngine.ctx.currentTime + 8
        );
    }

    // Session complete screen appears after dissolve finishes
    setTimeout(() => {
        if (audioEngine) audioEngine.stop();
        sessionComplete.style.display = 'block';
        sessionComplete.scrollIntoView({ behavior: 'smooth' });
    }, 8000);
}
