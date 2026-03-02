// =============================================================
// audio.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Two-layer sacred audio engine. Generates a living soundscape
// that is unique to each intention via hash-derived parameters,
// while remaining rooted in two fixed sacred frequencies.
//
// HOW IT FITS:
// - Loaded before app.js in index.html
// - app.js instantiates IntentionAudioEngine and calls:
//     start(hashNumbers)  → begins both audio layers
//     stop()              → clears all intervals, silences audio
//     toggleMute()        → smooth gain ramp to avoid clicks
// - hashNumbers come from mandalaGen.hashNumbers after generate()
//
// TWO AUDIO LAYERS:
//
// LAYER 1 — Schumann Resonance Heartbeat (7.83 Hz)
//   Earth's natural electromagnetic frequency, often called the
//   planet's heartbeat. Associated with grounding, autonomic
//   nervous system calming, and meditative states.
//   Source: Siever & Collura, "Audio-Visual Entrainment" (Elsevier, 2017)
//           Balser & Wagner (1960), Nature
//   Implementation: Sine wave pulse fired at 7.83 Hz intervals.
//   Pitch bends downward on attack for an organic, drum-like quality.
//
// LAYER 2 — Third Eye Sitar Harmonic (852 Hz base)
//   852 Hz is the Ajna (Third Eye) Chakra Solfeggio frequency.
//   Associated with spiritual insight and intuitive clarity —
//   aligned with the act of setting a conscious intention.
//   Source: Solfeggio frequency tradition; Belle Health review (2025)
//   Implementation: Triangle wave fired every other heartbeat.
//   The harmonic interval is hash-derived so each intention produces
//   a unique overtone while staying consonant with 852 Hz.
//
// MUTE BUTTON:
//   Targets the Schumann Resonance layer specifically (masterGain).
//   Both layers share the same gain node, so muting silences both.
//   The button label in index.html reads "Mute Schumann Resonance"
//   to make clear which sacred frequency is being controlled.
// =============================================================

class IntentionAudioEngine {
    constructor() {
        // AudioContext is deferred until the first user gesture.
        // Browsers block autoplay audio — the Generate Mandala button
        // click satisfies the gesture requirement before start() is called.
        this.ctx        = null;
        this.masterGain = null;
        this.compressor = null;

        // Interval handles — stored so stop() can clear them cleanly
        this.heartbeatInterval = null;
        this.sitarInterval     = null;

        this.muted   = false;
        this.running = false;

        // FIXED CONSTANT: 7.83 Hz — Schumann Resonance.
        // Kept fixed across all intentions — this is the grounding anchor.
        // Changing this value would break the clinical basis of the layer.
        this.ENTRAINMENT_HZ = 7.83;

        // FIXED CONSTANT: 53.25 Hz — sub-harmonic of 852 Hz Third Eye frequency.
        // Using a sub-harmonic brings the tone into a more audible bass range
        // while preserving the mathematical relationship to 852 Hz.
        // 852 / 16 = 53.25 — four octaves below the Solfeggio frequency.
        this.THIRD_EYE_HZ = 53.25;

        // Hash-derived harmonic interval — set in extractAudioParams().
        // Varies per intention so each sitar tone is unique while staying
        // consonant with the Third Eye frequency.
        this.harmonicInterval = 1.5;
    }

    // Initializes AudioContext and the processing chain:
    //   Oscillators → Compressor → MasterGain → Speakers
    // Called once on first use. Subsequent calls are no-ops.
    initContext() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Compressor prevents clipping when both layers fire simultaneously.
        // Settings tuned for gentle limiting rather than aggressive compression.
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(6,        this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(3,       this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003,  this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.25,  this.ctx.currentTime);

        // Master gain at 1.5 — headroom for the two layers combined
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.5, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    // Reads hash byte 14 to select a consonant harmonic interval for the sitar.
    // Only the sitar's interval varies — the two base frequencies are fixed.
    // Intervals are drawn from Indian classical raga-compatible ratios:
    //   1.5   = perfect fifth
    //   1.333 = perfect fourth
    //   1.25  = major third
    //   1.125 = major second
    extractAudioParams(hashNumbers) {
        const intervals = [1.5, 1.333, 1.25, 1.125];
        this.harmonicInterval = intervals[hashNumbers[14] % 4];
    }

    // Fires a sine wave pulse at 7.83 Hz — the Schumann Resonance rate.
    // Each pulse is a short, soft bass thud — felt more than heard,
    // like a distant heartbeat or a hand drum in an empty room.
    // Pitch bends downward on attack for organic, non-electronic quality.
    startHeartbeat() {
        const intervalMs = 1000 / this.ENTRAINMENT_HZ; // ~128ms between pulses

        this.heartbeatInterval = setInterval(() => {
            if (!this.ctx || this.muted) return;

            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // Sub-harmonic of THIRD_EYE_HZ for tonal coherence with the sitar layer
            const hitFreq = this.THIRD_EYE_HZ * 0.15; // ~8 Hz — deep bass thud
            osc.type = 'sine';
            // Pitch bend downward from 1.3x to 1.0x over 60ms — drum-like attack
            osc.frequency.setValueAtTime(hitFreq * 1.3, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(hitFreq, this.ctx.currentTime + 0.06);

            // Soft attack (10ms), medium decay (500ms) — felt pulse, not sharp hit
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(1.5, this.ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(this.compressor);
            osc.start(this.ctx.currentTime);
            osc.stop(this.ctx.currentTime + 0.55);

        }, intervalMs);
    }

    // Fires a triangle wave tone every other heartbeat — a slow, contemplative rhythm.
    // Triangle wave approximates the warm, bright quality of a plucked sitar string
    // more closely than a sine (too smooth) or sawtooth (too harsh).
    // The 100ms offset after heartbeat creates a call-and-response feel
    // between the two layers — heartbeat speaks, sitar answers.
    startSitarHarmonic() {
        const beatMs     = 1000 / this.ENTRAINMENT_HZ;
        const intervalMs = beatMs * 2; // fires every other heartbeat

        // Slight delay so sitar lands just after the heartbeat pulse
        setTimeout(() => {
            this.sitarInterval = setInterval(() => {
                if (!this.ctx || this.muted) return;

                const osc  = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'triangle';
                // Dividing by harmonicInterval brings the frequency down into a
                // comfortable meditative register while staying mathematically
                // related to the Third Eye frequency
                osc.frequency.setValueAtTime(
                    this.THIRD_EYE_HZ / this.harmonicInterval,
                    this.ctx.currentTime
                );

                // Plucked string envelope: very fast attack (8ms), slow decay (800ms)
                gain.gain.setValueAtTime(0, this.ctx.currentTime);
                gain.gain.linearRampToValueAtTime(1.5, this.ctx.currentTime + 0.008);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

                osc.connect(gain);
                gain.connect(this.compressor);
                osc.start(this.ctx.currentTime);
                osc.stop(this.ctx.currentTime + 0.85);

            }, intervalMs);
        }, 100); // 100ms after heartbeat
    }

    // Starts both audio layers simultaneously.
    // Extracts hash-derived parameters before starting so the sitar
    // interval is set correctly for this intention's hash.
    // If already running, stops cleanly before restarting to prevent
    // overlapping soundscapes when a new mandala is generated.
    start(hashNumbers) {
        if (this.running) this.stop();

        this.initContext();
        this.extractAudioParams(hashNumbers);

        // Resume context if browser suspended it (common on mobile)
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.startHeartbeat();
        this.startSitarHarmonic();

        this.running = true;
        this.muted   = false;
    }

    // Stops both layers and clears all interval handles.
    // Always called before generating a new mandala and before page reload.
    stop() {
        if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
        if (this.sitarInterval)     { clearInterval(this.sitarInterval);     this.sitarInterval     = null; }
        this.running = false;
    }

    // Toggles mute state with a smooth 100ms gain ramp to prevent audible clicks.
    // Rhythm timing is preserved during mute — both layers resume in sync on unmute.
    // Returns the new muted state so app.js can update the button label.
    toggleMute() {
        if (!this.masterGain) return;

        this.muted = !this.muted;

        if (this.muted) {
            // Ramp to silence over 100ms — avoids the click of an instant cut
            this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        } else {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            // Ramp back to operating gain on unmute
            this.masterGain.gain.linearRampToValueAtTime(0.75, this.ctx.currentTime + 0.1);
        }

        return this.muted;
    }
}
