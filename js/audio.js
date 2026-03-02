// =============================================================
// audio.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Single-layer sacred audio engine (Schumann Resonance only).
//
// This file intentionally contains ONLY the Schumann Resonance “heartbeat” layer.
// No harmonic / “third eye” layer exists in this version.
//
// HOW IT FITS:
// - Loaded before app.js in index.html
// - app.js instantiates IntentionAudioEngine and calls:
//     start(hashNumbers)  → begins Schumann layer (hashNumbers unused for now; kept for API stability)
//     stop()              → clears intervals and silences audio
//     toggleMute()        → smooth gain ramp to avoid clicks
//
// DESIGN NOTES:
// - AudioContext creation is deferred until the first user gesture (browser autoplay rules).
// - Mute uses a short ramp to avoid pops/clicks.
// - Gain is normalized to a single consistent operating level (0.75).
// =============================================================

class IntentionAudioEngine {
    constructor() {
        // Deferred until first user gesture.
        this.ctx = null;
        this.masterGain = null;
        this.compressor = null;

        // Interval handle — stored so stop() can clear it cleanly.
        this.heartbeatInterval = null;

        this.muted = false;
        this.running = false;

        // FIXED CONSTANT: 7.83 Hz — Schumann Resonance.
        this.ENTRAINMENT_HZ = 7.83;

        // Operating gain level for unmuted playback (kept consistent everywhere).
        this.OPERATING_GAIN = 0.75;
    }

    // Initializes AudioContext and processing chain:
    //   Oscillators → Compressor → MasterGain → Speakers
    // Called once on first use. Subsequent calls are no-ops.
    initContext() {
        if (this.ctx) return;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Gentle limiting to prevent clipping.
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(3, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.OPERATING_GAIN, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    // Fires a short sine pulse at the Schumann rate (~7.83 Hz).
    // This is a felt “heartbeat” style thud rather than a musical tone.
    startHeartbeat() {
        const intervalMs = 1000 / this.ENTRAINMENT_HZ; // ~128ms

        this.heartbeatInterval = setInterval(() => {
            if (!this.ctx || this.muted) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // Deep thud: low frequency sine with a small downward pitch bend.
            const hitFreq = 8; // ~8 Hz (sub-audio / felt pulse)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(hitFreq * 1.3, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(hitFreq, this.ctx.currentTime + 0.06);

            // Soft attack + decay envelope.
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(1.5, this.ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(this.compressor);

            osc.start(this.ctx.currentTime);
            osc.stop(this.ctx.currentTime + 0.55);
        }, intervalMs);
    }

    // Starts Schumann heartbeat.
    // Signature keeps hashNumbers for compatibility with app.js (unused here).
    start(hashNumbers) {
        void hashNumbers; // intentionally unused (kept for stable API)

        if (this.running) this.stop();

        this.initContext();

        // Resume context if browser suspended it (common on mobile).
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.startHeartbeat();

        this.running = true;
        this.muted = false;

        // Ensure gain is at the operating level when starting.
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.OPERATING_GAIN, this.ctx.currentTime);
        }
    }

    // Stops heartbeat and clears interval handle.
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.running = false;
    }

    // Toggles mute state with a smooth 100ms gain ramp to prevent clicks.
    // Returns the new muted state so app.js can update the button label.
    toggleMute() {
        if (!this.masterGain || !this.ctx) return this.muted;

        this.muted = !this.muted;

        if (this.muted) {
            // Ramp to silence over 100ms.
            this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        } else {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            // Ramp back to operating gain over 100ms.
            this.masterGain.gain.linearRampToValueAtTime(this.OPERATING_GAIN, this.ctx.currentTime + 0.1);
        }

        return this.muted;
    }
}
