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
// =============================================================


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

    mandalaGen  = new MandalaGenerator(canvas);
    audioEngine = new IntentionAudioEngine();

    // Build all three scroll wheel pickers and render saved intentions
    buildWheel('hoursWheel',   0,  2, selectedHours,   (val) => { selectedHours   = val; });
    buildWheel('minutesWheel', 0, 59, selectedMinutes,  (val) => { selectedMinutes = val; });
    buildWheel('secondsWheel', 0, 59, selectedSeconds,  (val) => { selectedSeconds = val; });
    renderIntentionsList();


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
    clearAllBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to delete all saved intentions? This cannot be undone.')) {
            localStorage.removeItem(STORAGE_KEY);
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

// Saves intention text, hash, and timestamp to localStorage.
// Skips duplicate consecutive entries to avoid redundant storage.
// STUB: will POST to backend API when server is ready.
function saveIntention(intentionText, hash) {
    const intentions = loadIntentions();
    // Skip if the most recent entry is identical to avoid duplicates
    if (intentions.length > 0 && intentions[0].text === intentionText) return;

    intentions.unshift({
        text:      intentionText,
        hash:      hash,
        timestamp: new Date().toISOString()
    });

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(intentions));
    } catch(e) {
        console.warn('Could not save intention to localStorage:', e);
    }
    renderIntentionsList();
}

function loadIntentions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
}

function deleteIntention(index) {
    const intentions = loadIntentions();
    intentions.splice(index, 1);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(intentions));
    } catch(e) {
        console.warn('Could not update localStorage:', e);
    }
    renderIntentionsList();
}


// ─────────────────────────────────────────────
// SESSION DATA STORAGE (STUB FOR BACKEND)
// ─────────────────────────────────────────────

// Saves a full session record to localStorage.
// Fields captured:
//   text      — intention text
//   hash      — MERIDIAN-HASH (SHA-256 hex)
//   timestamp — when the mandala was generated
//   duration  — total seconds the user selected on the wheels
//   style     — 'sacred' or 'cosmic' at time of session end
//   completed — true = timer ran to zero, false = user stopped early
//
// STUB: replace localStorage.setItem with a POST to the backend API.
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

// Rebuilds the My Intentions section from localStorage.
// Shows the section if entries exist, hides it if empty.
function renderIntentionsList() {
    const intentions = loadIntentions();
    const section    = document.getElementById('intentionsSection');
    const list       = document.getElementById('intentionsList');

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

// Runs the local IntentionAnalyzer and updates the UI based on severity.
// STUB: replace IntentionAnalyzer.analyze() with a fetch() to the backend
// DeepSeek API endpoint. The response shape should match the object
// currently returned by analyze() — severity, feedback, reframe fields.
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

// Hashes the intention, draws the mandala, starts audio, and saves the intention.
// Resets timer and dissolve state so re-generating always starts clean.
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

    // Display truncated hash below canvas — full hash is drawn on canvas itself
    hashDisplay.textContent = hash.substring(0, 16) + '...';
    mandalaGen.startBreathing();

    // Save intention record after successful generation
    saveIntention(intentionText, hash);

    if (audioEngine) {
        audioEngine.start(currentHashNumbers);
        muteBtn.textContent = '🔊 Mute Schumann Resonance';
    }
}


// ─────────────────────────────────────────────
// MEDITATION TIMER
// ─────────────────────────────────────────────

// Starts the countdown from the total seconds derived from the scroll wheels.
// Hides the wheel picker and shows the live countdown display.
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

// Formats total seconds into HH:MM:SS for the countdown display.
function updateCountdownDisplay(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    document.getElementById('countdownDisplay').textContent =
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// Cancels a running timer and restores the wheel picker UI.
// Does NOT trigger dissolve — used only for the Cancel button
// which aborts before meditation begins.
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

// Ends the session — triggered by timer completion OR Stop Meditation button.
// completed: true  = timer ran to zero
// completed: false = user stopped early
// Both paths trigger the same spiral dissolve and audio fade.
// The only difference is the completed flag already saved by the caller.
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
