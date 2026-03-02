// =============================================================
// mandala.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Sacred geometry renderer. Reads the SHA-256 hash produced by
// hash-encoder.js and draws a unique, breathing, rotating mandala
// on the HTML5 canvas element defined in index.html.
//
// HOW IT FITS:
// - Depends on hash-encoder.js (generateHash, hexToNumbers,
//   hashToSphericalCoords) — must load after it in index.html
// - app.js instantiates MandalaGenerator and calls:
//     generate(intentionText) → hashes and seeds all parameters
//     startBreathing()        → begins the animation loop
//     setStyle(name)          → switches Sacred/Cosmic without re-hashing
//     spiralDissolve(ms)      → triggers end-of-session collapse animation
//     stopBreathing()         → halts the animation frame loop
//
// DO NOT MODIFY THIS FILE unless you are changing the visualization.
// All session tracking, timer logic, and UI wiring live in app.js.
//
// RENDERING FOUNDATION (shared by both styles):
// - Point positions derive from SHA-256 hash bytes mapped to spherical
//   coordinates using the celestial sphere model and golden ratio distribution
// - The MERIDIAN-HASH provenance stamp is drawn directly on the canvas
// - Depth-of-field parallax: outer rings rotate slower than inner rings
// - Counterclockwise rotation applied directly to point coordinates,
//   not via ctx.rotate() — prevents the clockwise optical illusion
//   caused by stacking canvas transform calls
//
// SACRED STYLE — stable, clean, navigational:
//   Single symmetry layer, consecutive point connections, smaller dots.
//   The same geometric form breathes and rotates — a fixed constellation
//   the user meditates on without visual distraction.
//
// COSMIC STYLE — evolving, infinite:
//   Same hash foundation but connection skip cycles slowly through polygon
//   families, a secondary symmetry layer adds interference patterns, and a
//   Lissajous overlay morphs continuously. New geometric forms emerge from
//   the same intention over time without ever exactly repeating.
// =============================================================

class MandalaGenerator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.animationFrame = null;
        this.time   = 0;
        this.points = [];

        // Structural parameters — all seeded from hash bytes in generate()
        this.numRings          = 0;
        this.primarySymmetry   = 0;
        this.secondarySymmetry = 0;
        this.baseHue           = 0;
        this.complexity        = 0;
        this.connectionSkip    = 1;
        this.lissajousA        = 3;
        this.lissajousB        = 2;
        this.lissajousDelta    = 0;

        // Cosmic evolution speeds — seeded from hash, unique per intention
        this.skipEvolutionSpeed      = 0.001;
        this.lissajousEvolutionSpeed = 0.003;
        this.symmetryEvolutionSpeed  = 0.0005;

        this.hashNumbers   = [];
        this.fullHash      = '';
        this.intentionText = '';
        this.showHash      = true; // controls MERIDIAN-HASH stamp on canvas

        this.pulseAmplitude = 0.10;
        this.pulseSpeed     = 0.02;

        // Master rotation angle — decremented each frame for counterclockwise movement.
        // Applied directly to point coordinates, not via ctx.rotate().
        this.rotationAngle = 0;

        // Active rendering style — 'sacred' or 'cosmic'. Sacred is the default.
        this.style = 'sacred';

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Keeps the canvas square and centered at the largest size that fits
    // the viewport. Called on init and on every window resize event.
    resizeCanvas() {
        const maxSize      = Math.min(window.innerWidth - 40, 600);
        this.canvas.width  = maxSize;
        this.canvas.height = maxSize;
        this.centerX       = this.canvas.width  / 2;
        this.centerY       = this.canvas.height / 2;
    }

    // Hashes the intention text and extracts all visual parameters from the hash.
    // Both Sacred and Cosmic styles share the same hash and point positions —
    // style only affects how those points are connected and decorated.
    // Returns the full hex hash string so app.js can display and store it.
    async generate(intentionText) {
        this.intentionText = intentionText;
        const hash         = await generateHash(intentionText);
        this.hashNumbers   = hexToNumbers(hash);
        this.fullHash      = hash;

        // Core structure — shared by both styles
        const numPoints          = 8  + (this.hashNumbers[0] % 8);
        this.numRings            = 3  + (this.hashNumbers[1] % 5);
        this.primarySymmetry     = [6, 8, 12, 16][this.hashNumbers[2] % 4];
        this.baseHue             = this.hashNumbers[3] % 360;
        this.complexity          = 1  + (this.hashNumbers[4] % 3);

        // Cosmic parameters — always extracted, only rendered in Cosmic style
        this.connectionSkip    = 1 + (this.hashNumbers[5] % 7);
        this.secondarySymmetry = [3, 5, 7, 9][this.hashNumbers[6] % 4];
        const lissajousPairs   = [[3,2],[4,3],[5,4],[5,3],[7,4],[6,5]];
        const pair             = lissajousPairs[this.hashNumbers[8] % lissajousPairs.length];
        this.lissajousA        = pair[0];
        this.lissajousB        = pair[1];
        this.lissajousDelta    = (this.hashNumbers[9] / 255) * Math.PI;

        // Breathing parameters — shared by both styles
        this.pulseAmplitude = 0.05 + (this.hashNumbers[10] / 255) * 0.15;
        this.pulseSpeed     = 0.015 + (this.hashNumbers[11] / 255) * 0.03;

        // Cosmic evolution speeds — each intention evolves at its own unique rate
        this.skipEvolutionSpeed      = 0.0005 + (this.hashNumbers[20] / 255) * 0.001;
        this.lissajousEvolutionSpeed = 0.001  + (this.hashNumbers[21] / 255) * 0.004;
        this.symmetryEvolutionSpeed  = 0.0002 + (this.hashNumbers[22] / 255) * 0.0008;

        // Reset animation state so each new intention starts fresh
        this.rotationAngle = 0;
        this.time          = 0;

        // Build geometry points from hash-derived spherical coordinates
        this.points = [];
        for (let i = 0; i < numPoints; i++) {
            this.points.push(hashToSphericalCoords(this.hashNumbers, i));
        }

        return hash;
    }

    // Switches rendering style without re-hashing.
    // Called by app.js when the user clicks Sacred or Cosmic button.
    // The existing hash and points are reused — only the draw behavior changes.
    setStyle(styleName) {
        this.style = styleName;
    }

    // Orthographic projection of spherical coordinates onto the 2D canvas plane.
    // Orthographic chosen because it preserves the circular mandala shape
    // without the distortion introduced by perspective projection.
    // Used by both styles for all point and connection rendering.
    projectPoint(lon, lat, radius, scale) {
        const phi   = (90 - lat)  * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return {
            x: Math.sin(phi) * Math.cos(theta) * scale * radius,
            y: Math.sin(phi) * Math.sin(theta) * scale * radius
        };
    }

    // Rotates a canvas point around the canvas center by a given angle.
    // Direct coordinate math prevents the clockwise optical illusion
    // that accumulates when ctx.rotate() calls are stacked across frames.
    rotatePoint(x, y, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx  = x - this.centerX;
        const dy  = y - this.centerY;
        return {
            x: this.centerX + dx * cos - dy * sin,
            y: this.centerY + dx * sin + dy * cos
        };
    }

    // Draws the Lissajous knot overlay — Cosmic style only.
    // lissajousPhase advances each frame so the knot form continuously morphs.
    // Alpha kept at 0.2 so it supports the main geometry without dominating it.
    drawLissajous(pulse, hue, lissajousPhase) {
        const steps = 200;
        const scale = Math.min(this.canvas.width, this.canvas.height) * 0.3 * pulse;
        const alpha = 0.2;

        this.ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
            const t    = (i / steps) * Math.PI * 2;
            const rawX = Math.sin(this.lissajousA * t + this.lissajousDelta + lissajousPhase) * scale;
            const rawY = Math.sin(this.lissajousB * t + lissajousPhase * 0.7) * scale;
            const rotated = this.rotatePoint(
                this.centerX + rawX,
                this.centerY + rawY,
                this.rotationAngle * 0.5 // Lissajous rotates at half speed for layered depth
            );
            if (i === 0) this.ctx.moveTo(rotated.x, rotated.y);
            else         this.ctx.lineTo(rotated.x, rotated.y);
        }

        this.ctx.strokeStyle = `hsla(${(hue + 120) % 360}, 60%, 55%, ${alpha})`;
        this.ctx.lineWidth   = 1;
        this.ctx.shadowBlur  = 6;
        this.ctx.shadowColor = `hsla(${(hue + 120) % 360}, 70%, 65%, ${alpha})`;
        this.ctx.stroke();
        this.ctx.shadowBlur  = 0;
    }

    // Renders one complete frame of the mandala.
    // pulse — the current breathing scale factor from the animation loop.
    // evolvedSkip and evolvedSymmetry shift slowly over time in Cosmic style,
    // producing new geometric forms from the same hash without ever repeating.
    drawMandala(pulse) {
        // Near-opaque black fill creates motion trail effect as the mandala moves
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const scale = Math.min(this.canvas.width, this.canvas.height) / 3;
        // Hue cycles slowly over time — the mandala shifts color as it breathes
        const hue   = (this.baseHue + this.time * 10) % 360;

        // Cosmic time-driven evolution — parameters drift slowly,
        // producing continuously new geometric forms from the same intention
        const evolvedSkip = this.style === 'cosmic'
            ? 1 + ((Math.sin(this.time * this.skipEvolutionSpeed * 100) + 1) / 2) * 6
            : 1; // Sacred: fixed consecutive connections

        const evolvedSymmetry = this.style === 'cosmic'
            ? this.secondarySymmetry + Math.sin(this.time * this.symmetryEvolutionSpeed * 100) * 2
            : this.secondarySymmetry;

        const lissajousPhase = this.style === 'cosmic'
            ? this.time * this.lissajousEvolutionSpeed * 100
            : 0;

        // Lissajous drawn first so the main geometry sits on top of it
        if (this.style === 'cosmic') {
            this.drawLissajous(pulse, hue, lissajousPhase);
        }

        // Rings drawn back to front for correct depth ordering
        for (let ring = this.numRings - 1; ring >= 0; ring--) {
            const ringRadius = (ring + 1) / this.numRings;
            const alpha      = 0.3 + (ring / this.numRings) * 0.5;
            const ringHue    = (hue + ring * 30) % 360;

            // PARALLAX DEPTH FACTOR — inner rings rotate faster, outer rings slower.
            // Range 0.3–1.8 gives a 6x speed difference between innermost and outermost,
            // creating the dimensional depth-of-field effect.
            const depth        = ring / (this.numRings - 1 || 1);
            const depthFactor  = 0.3 + depth * 1.5;
            const ringRotation = this.rotationAngle * depthFactor;

            // Sacred: one symmetry layer. Cosmic: primary + evolving secondary layer.
            const symmetries = this.style === 'cosmic'
                ? [this.primarySymmetry, Math.max(3, Math.round(evolvedSymmetry))]
                : [this.primarySymmetry];

            // Sacred: skip=1 (consecutive). Cosmic: skip evolves through polygon families.
            const skip = this.style === 'cosmic'
                ? Math.max(1, Math.round(evolvedSkip))
                : 1;

            symmetries.forEach((symmetry, symLayerIdx) => {
                // Secondary symmetry layer uses complementary hue and reduced alpha
                const layerHue   = symLayerIdx === 0 ? ringHue : (ringHue + 180) % 360;
                const layerAlpha = symLayerIdx === 0 ? alpha : alpha * 0.4;

                for (let sym = 0; sym < symmetry; sym++) {
                    const symAngle = (Math.PI * 2 * sym) / symmetry;

                    for (let i = 0; i < this.points.length; i++) {
                        const point = this.points[i];

                        // Project from spherical to flat 2D coordinates
                        const base = this.projectPoint(
                            point.longitude, point.latitude,
                            point.radius * ringRadius * pulse, scale
                        );

                        // Apply symmetry rotation, then ring rotation (parallax)
                        const symRotated = this.rotatePoint(
                            this.centerX + base.x,
                            this.centerY + base.y,
                            symAngle
                        );

                        const final = this.rotatePoint(
                            symRotated.x, symRotated.y, ringRotation
                        );

                        // Sacred dots are smaller and crisper.
                        // Cosmic dots are slightly larger with stronger glow.
                        const dotScale  = this.style === 'sacred' ? 0.6 : 0.9;
                        const depthSize = (2 + this.complexity) * pulse *
                                          (0.7 + depth * 0.6) * dotScale;

                        this.ctx.beginPath();
                        this.ctx.arc(final.x, final.y, depthSize, 0, Math.PI * 2);
                        this.ctx.fillStyle   = `hsla(${layerHue}, 70%, 60%, ${layerAlpha})`;
                        this.ctx.shadowBlur  = (this.style === 'sacred' ? 6 : 9) *
                                               pulse * (0.5 + depth * 0.8);
                        this.ctx.shadowColor = `hsla(${layerHue}, 80%, 70%, ${layerAlpha})`;
                        this.ctx.fill();

                        // Draw bezier connection to the target point
                        // Control point pulled toward center approximates geodesic curvature
                        const targetIdx = (i + skip) % this.points.length;
                        if (targetIdx !== i) {
                            const tp    = this.points[targetIdx];
                            const tBase = this.projectPoint(
                                tp.longitude, tp.latitude,
                                tp.radius * ringRadius * pulse, scale
                            );
                            const tSymRotated = this.rotatePoint(
                                this.centerX + tBase.x,
                                this.centerY + tBase.y,
                                symAngle
                            );
                            const tFinal = this.rotatePoint(
                                tSymRotated.x, tSymRotated.y, ringRotation
                            );

                            const cpX = (final.x + tFinal.x) / 2 * (0.85 - ring * 0.03) +
                                        this.centerX * (1 - (0.85 - ring * 0.03));
                            const cpY = (final.y + tFinal.y) / 2 * (0.85 - ring * 0.03) +
                                        this.centerY * (1 - (0.85 - ring * 0.03));

                            this.ctx.beginPath();
                            this.ctx.moveTo(final.x, final.y);
                            this.ctx.quadraticCurveTo(cpX, cpY, tFinal.x, tFinal.y);
                            this.ctx.strokeStyle = `hsla(${layerHue}, 60%, 50%, ${layerAlpha * 0.5})`;
                            this.ctx.lineWidth   = 1;
                            this.ctx.shadowBlur  = 4;
                            this.ctx.stroke();
                        }
                    }
                }
            });
        }

        // Center dot — visual anchor point, identical in both styles
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 5 * pulse, 0, Math.PI * 2);
        this.ctx.fillStyle   = `hsl(${this.baseHue}, 80%, 70%)`;
        this.ctx.shadowBlur  = 15 * pulse;
        this.ctx.shadowColor = `hsl(${this.baseHue}, 80%, 70%)`;
        this.ctx.fill();
        this.ctx.shadowBlur  = 0;

        // MERIDIAN-HASH stamp — top right corner of the canvas.
        // Cryptographic provenance drawn directly into the visualization
        // so it is part of the image if the user downloads it.
        if (this.showHash && this.fullHash) {
            this.ctx.save();
            const fontSize = Math.max(8, Math.floor(this.canvas.width / 60));
            this.ctx.font      = `${fontSize}px monospace`;
            this.ctx.fillStyle = 'rgba(149, 165, 166, 0.8)';
            this.ctx.textAlign = 'right';
            const x = this.canvas.width - 10;
            this.ctx.fillText('MERIDIAN-HASH:', x, fontSize + 10);
            this.ctx.fillText(this.fullHash.substring(0, 32), x, fontSize * 2 + 15);
            this.ctx.fillText(this.fullHash.substring(32),    x, fontSize * 3 + 20);
            this.ctx.restore();
        }

        // Intention text stamp — bottom left corner of the canvas.
        // Word-wrapped to fit within canvas width at current font size.
        if (this.intentionText) {
            this.ctx.save();
            const fontSize = Math.max(9, Math.floor(this.canvas.width / 55));
            this.ctx.font      = `${fontSize}px monospace`;
            this.ctx.fillStyle = 'rgba(149, 165, 166, 0.85)';
            this.ctx.textAlign = 'left';

            const lineH    = fontSize + 3;
            const padding  = 10;
            const maxChars = Math.floor((this.canvas.width - padding * 2) / (fontSize * 0.6));

            const words = this.intentionText.split(' ');
            let lines = [], currentLine = '';
            for (let word of words) {
                const test = currentLine ? currentLine + ' ' + word : word;
                if (test.length > maxChars && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = test;
                }
            }
            if (currentLine) lines.push(currentLine);

            const totalLines = lines.length + 1;
            let y = this.canvas.height - padding - (totalLines - 1) * lineH;
            this.ctx.fillText('INTENTION:', padding, y);
            y += lineH;
            for (let line of lines) {
                this.ctx.fillText(line, padding, y);
                y += lineH;
            }
            this.ctx.restore();
        }
    }

    // Animation loop — advances time and rotation each frame.
    // this.time drives both the breathing pulse and Cosmic evolution parameters.
    // rotationAngle decrements for counterclockwise movement.
    startBreathing() {
        const rotationStep = -0.005; // negative = counterclockwise
        const animate = () => {
            this.time += this.pulseSpeed;
            this.rotationAngle += rotationStep;

            // Dual sine breathing — primary + subtle harmonic for organic feel
            const pulse = 1.0 +
                Math.sin(this.time) * this.pulseAmplitude +
                Math.sin(this.time * 1.6) * (this.pulseAmplitude * 0.2);

            this.drawMandala(pulse);
            this.animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    // Halts the animation loop. Called before starting a new session
    // or before the spiral dissolve begins.
    stopBreathing() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    // Spiral dissolve — triggered at meditation session end (timer or manual stop).
    // Scales the mandala down toward the center over the given duration (ms),
    // rotating faster as it collapses, then fills canvas with solid black.
    // The MERIDIAN-HASH and intention text collapse with the mandala
    // because they are drawn inside drawMandala() on every frame.
    spiralDissolve(duration) {
        this.stopBreathing();
        const steps    = 60;
        const interval = duration / steps;
        let   step     = 0;

        const dissolve = setInterval(() => {
            step++;
            const scale = Math.max(0.001, 1 - (step / steps));
            // Rotation accelerates as scale shrinks — creates spiral-into-void effect
            this.rotationAngle -= step * 0.01;

            // Partial fill instead of full clear creates motion trail during collapse
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.save();
            this.ctx.translate(this.centerX, this.centerY);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-this.centerX, -this.centerY);
            this.drawMandala(scale);
            this.ctx.restore();

            if (step >= steps) {
                clearInterval(dissolve);
                // Final solid black fill completes the void transition
                this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }, interval);
    }

    // Returns the current canvas pixel data.
    // Available for future use — PNG download or NFT minting pipeline.
    getCurrentFrame() {
        return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
}
