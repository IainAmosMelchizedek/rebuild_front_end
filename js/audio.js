// =============================================================
// audio.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Single-layer sacred audio engine (Schumann Resonance rate only).
//
// IMPORTANT CLARIFICATION (audibility):
// - 7.83 Hz is below typical human hearing and most device speakers.
// - To keep the experience audible while honoring the Schumann *rate*,
//   we drive an audible low-frequency "carrier" tone (e.g., 80 Hz)
//   with an amplitude envelope that pulses at 7.83 Hz.
//
// WHAT THIS IS (and is not):
// - This is ONE layer only.
// - No harmonic / "third eye" / second oscillator layer exists here.
// - The Schumann value is used as the *pulse frequency* (heartbeat rate).
//
// HOW IT FITS:
// - Loaded before app.js in index.html
// - app.js instantiates IntentionAudioEngine and calls:
//     start(hashNumbers)  → begins the Schumann-rate pulse (hashNumbers unused; kept for API stability)
//     stop()              → clears interval and silences audio
//     toggleMute()        → smooth gain ramp to avoid clicks
//
// DESIGN NOTES:
// - AudioContext creation is deferred until the first user gesture (autoplay rules).
// - A gentle compressor prevents clipping while allowing stronger perceived loudness.
// - Mute uses a short ramp to avoid pops/clicks.
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

        // FIXED CONSTANT: 7.83 Hz — Schumann Resonance (used as pulse rate).
        this.ENTRAINMENT_HZ = 7.83;

        // AUDIBLE CARRIER (Hz): low bass that most speakers can reproduce.
        // 80 Hz is a good compromise across laptops/phones.
        this.CARRIER_HZ = 80;

        // Timing / envelope tuning (kept conservative to reduce distortion).
        this.PULSE_INTERVAL_MS = 1000 / this.ENTRAINMENT_HZ; // ~127.7ms
        this.ATTACK_S = 0.008;   // 8ms
        this.DECAY_S  = 0.25;    // 250ms
        this.EVENT_DURATION_S = 0.30; // oscillator lifetime per pulse

        // Loudness knobs:
        // - OPERATING_GAIN controls overall output.
        // - PULSE_PEAK_GAIN controls the pulse strength into the compressor.
        //
        // If it's still too faint on a device, increase OPERATING_GAIN first,
        // then PULSE_PEAK_GAIN. The compressor should prevent hard clipping.
        this.OPERATING_GAIN = 1.10;
        this.PULSE_PEAK_GAIN = 2.6;
    }

    // Initializes AudioContext and processing chain:
    //   Oscillator → Envelope Gain → Compressor → MasterGain → Speakers
    initContext() {
        if (this.ctx) return;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Gentle limiter-like compression to keep peaks under control.
        // Slightly stronger than before to allow higher perceived loudness.
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.20, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.OPERATING_GAIN, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    // Fires a short pulse at the Schumann rate (~7.83 Hz),
    // using an audible bass carrier so it can be heard on normal speakers.
    startHeartbeat() {
        const intervalMs = this.PULSE_INTERVAL_MS;

        this.heartbeatInterval = setInterval(() => {
            if (!this.ctx || this.muted) return;

            const now = this.ctx.currentTime;

            // Audible carrier oscillator.
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';

            // Small downward bend adds a "thud" character without adding a second layer.
            osc.frequency.setValueAtTime(this.CARRIER_HZ * 1.10, now);
            osc.frequency.exponentialRampToValueAtTime(this.CARRIER_HZ, now + 0.06);

            // Envelope gain (per-pulse).
            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.0001, now);

            // Attack → peak → decay. (Peak is intentionally >1; compressor handles it.)
            env.gain.linearRampToValueAtTime(this.PULSE_PEAK_GAIN, now + this.ATTACK_S);
            env.gain.exponentialRampToValueAtTime(0.0001, now + this.DECAY_S);

            osc.connect(env);
            env.connect(this.compressor);

            osc.start(now);
            osc.stop(now + this.EVENT_DURATION_S);
        }, intervalMs);
    }

    // Starts Schumann heartbeat (rate-based).
    // Signature keeps hashNumbers for compatibility with app.js (unused here).
    start(hashNumbers) {
        void hashNumbers; // intentionally unused (kept for stable API)

        if (this.running) this.stop();

        this.initContext();

        // Resume context if browser suspended it (common on mobile).
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // Ensure gain is at operating level when starting.
        this.masterGain.gain.setValueAtTime(this.OPERATING_GAIN, this.ctx.currentTime);

        this.startHeartbeat();

        this.running = true;
        this.muted = false;
    }

    // Stops heartbeat and clears interval handle.
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.running = false;

        // Hard-stop any lingering audio smoothly.
        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
            // Bring it back to operating level so the next start() doesn't jump from near-zero.
            this.masterGain.gain.linearRampToValueAtTime(this.OPERATING_GAIN, now + 0.12);
        }
    }

    // Toggles mute state with a smooth ramp to prevent clicks.
    // Returns the new muted state so app.js can update the button label.
    toggleMute() {
        if (!this.masterGain || !this.ctx) return this.muted;

        this.muted = !this.muted;

        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);

        if (this.muted) {
            this.masterGain.gain.linearRampToValueAtTime(0.0, now + 0.10);
        } else {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.masterGain.gain.linearRampToValueAtTime(this.OPERATING_GAIN, now + 0.10);
        }

        return this.muted;
    }
}
