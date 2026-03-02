// =============================================================
// mandala.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Sacred geometry renderer. Reads the SHA-256-derived point constellation
// (from hash-encoder.js) and draws a deterministic, breathing, rotating mandala.
//
// CORE ASSUMPTION (MUST STAY FIXED):
// - The point constellation is cryptographically tied to the intention.
// - The same intention => same hash => same bytes => same points (lon/lat/radius).
//
// WHAT MAY EVOLVE (WITHOUT VIOLATING THE FOUNDATION):
// - How points are connected (graph topology over fixed nodes)
// - How multiple graph layers are blended and animated over time
//
// SMOOTH-MORPH FIX (Cosmic):
// - Avoids "snapping" by blending between integer topologies (skip/symmetry).
// - We render both neighbor states (floor/ceil) and crossfade via alpha weights.
// - The constellation itself is never regenerated; only traversal rules morph.
// =============================================================

class MandalaGenerator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        this.animationFrame = null;
        this.time           = 0;
        this.points         = [];

        // Structural parameters (seeded in generate()).
        this.numRings          = 0;
        this.primarySymmetry   = 0;
        this.secondarySymmetry = 0;
        this.baseHue           = 0;
        this.complexity        = 0;

        // Cosmic topology knobs (seeded in generate()).
        this.connectionSkip = 1;
        this.lissajousA     = 3;
        this.lissajousB     = 2;
        this.lissajousDelta = 0;

        // Evolution speeds (seeded in generate()).
        this.skipEvolutionSpeed      = 0.001;
        this.lissajousEvolutionSpeed = 0.003;
        this.symmetryEvolutionSpeed  = 0.0005;

        // Hash / provenance.
        this.hashNumbers   = [];
        this.fullHash      = '';
        this.intentionText = '';
        this.showHash      = true;

        // Breathing.
        this.pulseAmplitude = 0.10;
        this.pulseSpeed     = 0.02;

        // Counterclockwise rotation via coordinate math (not ctx.rotate stacking).
        this.rotationAngle = 0;

        // Render style.
        this.style = 'sacred';

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Keep the canvas square and bounded for mobile friendliness.
    resizeCanvas() {
        const maxSize      = Math.min(window.innerWidth - 40, 600);
        this.canvas.width  = maxSize;
        this.canvas.height = maxSize;
        this.centerX       = this.canvas.width  / 2;
        this.centerY       = this.canvas.height / 2;
    }

    // Seed all parameters from the intention hash.
    // IMPORTANT: the point constellation is fixed per hash.
    async generate(intentionText) {
        this.intentionText = intentionText;

        const hash       = await generateHash(intentionText);
        this.hashNumbers = hexToNumbers(hash);
        this.fullHash    = hash;

        // Core structure (shared by Sacred + Cosmic).
        const numPoints        = 8  + (this.hashNumbers[0] % 8);
        this.numRings          = 3  + (this.hashNumbers[1] % 5);
        this.primarySymmetry   = [6, 8, 12, 16][this.hashNumbers[2] % 4];
        this.baseHue           = this.hashNumbers[3] % 360;
        this.complexity        = 1  + (this.hashNumbers[4] % 3);

        // Cosmic topology parameters (always extracted; only used in cosmic rendering).
        this.connectionSkip    = 1 + (this.hashNumbers[5] % 7);
        this.secondarySymmetry = [3, 5, 7, 9][this.hashNumbers[6] % 4];

        const lissajousPairs = [[3,2],[4,3],[5,4],[5,3],[7,4],[6,5]];
        const pair           = lissajousPairs[this.hashNumbers[8] % lissajousPairs.length];
        this.lissajousA      = pair[0];
        this.lissajousB      = pair[1];
        this.lissajousDelta  = (this.hashNumbers[9] / 255) * Math.PI;

        // Breathing (shared).
        this.pulseAmplitude = 0.05 + (this.hashNumbers[10] / 255) * 0.15;
        this.pulseSpeed     = 0.015 + (this.hashNumbers[11] / 255) * 0.03;

        // Evolution speeds (cosmic).
        this.skipEvolutionSpeed      = 0.0005 + (this.hashNumbers[20] / 255) * 0.001;
        this.lissajousEvolutionSpeed = 0.001  + (this.hashNumbers[21] / 255) * 0.004;
        this.symmetryEvolutionSpeed  = 0.0002 + (this.hashNumbers[22] / 255) * 0.0008;

        // Reset animation state.
        this.rotationAngle = 0;
        this.time          = 0;

        // Build the fixed constellation from hash-derived spherical coordinates.
        this.points = [];
        for (let i = 0; i < numPoints; i++) {
            this.points.push(hashToSphericalCoords(this.hashNumbers, i));
        }

        return hash;
    }

    // Switch style without re-hashing (same constellation, different topology).
    setStyle(styleName) {
        this.style = styleName;
    }

    // Orthographic projection preserves circular mandala character.
    projectPoint(lon, lat, radius, scale) {
        const phi   = (90 - lat)  * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return {
            x: Math.sin(phi) * Math.cos(theta) * scale * radius,
            y: Math.sin(phi) * Math.sin(theta) * scale * radius
        };
    }

    // Rotate coordinates around the canvas center.
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

    // Cosmic-only overlay: a continuously evolving knot to suggest "infinite" motion
    // without changing the constellation itself.
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
                this.rotationAngle * 0.5
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

    // Render one frame.
    // NOTE: The "infinite feeling" comes from evolving topology and overlays,
    // not from changing the underlying point set.
    drawMandala(pulse) {
        // Motion trail background.
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const scale = Math.min(this.canvas.width, this.canvas.height) / 3;
        const hue   = (this.baseHue + this.time * 10) % 360;

        // ---- Cosmic smooth topology morph (NO SNAPPING) ----
        // Convert a continuous value into two integer neighbors + a blend weight.
        function blendInt(value, minInt) {
            const v  = Math.max(minInt, value);
            const v0 = Math.floor(v);
            const v1 = Math.ceil(v);
            const t  = v - v0; // 0..1
            return { v0, v1, t };
        }

        // Skip evolves continuously in ~[1..7] for cosmic.
        const evolvedSkipRaw = this.style === 'cosmic'
            ? 1 + ((Math.sin(this.time * this.skipEvolutionSpeed * 100) + 1) / 2) * 6
            : 1;

        // Secondary symmetry evolves continuously around its seeded base.
        const evolvedSecondarySymRaw = this.style === 'cosmic'
            ? this.secondarySymmetry + Math.sin(this.time * this.symmetryEvolutionSpeed * 100) * 2
            : this.secondarySymmetry;

        const skipBlend = blendInt(evolvedSkipRaw, 1);
        const symBlend  = blendInt(evolvedSecondarySymRaw, 3);

        const lissajousPhase = this.style === 'cosmic'
            ? this.time * this.lissajousEvolutionSpeed * 100
            : 0;

        // Lissajous underlay first.
        if (this.style === 'cosmic') {
            this.drawLissajous(pulse, hue, lissajousPhase);
        }

        // Rings: back-to-front for perceived depth.
        for (let ring = this.numRings - 1; ring >= 0; ring--) {
            const ringRadius = (ring + 1) / this.numRings;
            const alpha      = 0.3 + (ring / this.numRings) * 0.5;
            const ringHue    = (hue + ring * 30) % 360;

            // Parallax: ring rotation varies by depth.
            const depth        = ring / (this.numRings - 1 || 1);
            const depthFactor  = 0.3 + depth * 1.5;
            const ringRotation = this.rotationAngle * depthFactor;

            // Symmetry passes:
            // Sacred: only primary.
            // Cosmic: primary + secondary crossfaded between integer neighbor states.
            const symmetryPasses = this.style === 'cosmic'
                ? [
                    { symmetry: this.primarySymmetry, symLayerIdx: 0, weight: 1.0 },
                    { symmetry: symBlend.v0,          symLayerIdx: 1, weight: 1.0 - symBlend.t },
                    ...(symBlend.v1 !== symBlend.v0 ? [{ symmetry: symBlend.v1, symLayerIdx: 1, weight: symBlend.t }] : [])
                  ]
                : [{ symmetry: this.primarySymmetry, symLayerIdx: 0, weight: 1.0 }];

            // Skip passes (topology over points):
            // Sacred: fixed consecutive edges.
            // Cosmic: crossfade between integer skip neighbors.
            const skipPasses = this.style === 'cosmic'
                ? [
                    { skip: skipBlend.v0, weight: 1.0 - skipBlend.t },
                    ...(skipBlend.v1 !== skipBlend.v0 ? [{ skip: skipBlend.v1, weight: skipBlend.t }] : [])
                  ]
                : [{ skip: 1, weight: 1.0 }];

            for (const symPass of symmetryPasses) {
                const symmetry    = Math.max(3, Math.round(symPass.symmetry));
                const symLayerIdx = symPass.symLayerIdx;
                const symWeight   = symPass.weight;

                // Secondary layer uses complementary hue and thinner presence.
                const layerHueBase = symLayerIdx === 0 ? ringHue : (ringHue + 180) % 360;

                for (const skipPass of skipPasses) {
                    const skip       = Math.max(1, Math.round(skipPass.skip));
                    const passWeight = symWeight * skipPass.weight;

                    // Avoid spending cycles on near-zero blends.
                    if (passWeight < 0.02) continue;

                    const layerAlpha = (symLayerIdx === 0 ? alpha : alpha * 0.4) * passWeight;
                    const layerHue   = layerHueBase;

                    for (let sym = 0; sym < symmetry; sym++) {
                        const symAngle = (Math.PI * 2 * sym) / symmetry;

                        for (let i = 0; i < this.points.length; i++) {
                            const point = this.points[i];

                            const base = this.projectPoint(
                                point.longitude,
                                point.latitude,
                                point.radius * ringRadius * pulse,
                                scale
                            );

                            const symRotated = this.rotatePoint(
                                this.centerX + base.x,
                                this.centerY + base.y,
                                symAngle
                            );

                            const final = this.rotatePoint(
                                symRotated.x,
                                symRotated.y,
                                ringRotation
                            );

                            // Dot sizing: sacred crisper; cosmic slightly larger.
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

                            // Topology edge to the skip target.
                            const targetIdx = (i + skip) % this.points.length;
                            if (targetIdx !== i) {
                                const tp = this.points[targetIdx];

                                const tBase = this.projectPoint(
                                    tp.longitude,
                                    tp.latitude,
                                    tp.radius * ringRadius * pulse,
                                    scale
                                );

                                const tSymRotated = this.rotatePoint(
                                    this.centerX + tBase.x,
                                    this.centerY + tBase.y,
                                    symAngle
                                );

                                const tFinal = this.rotatePoint(
                                    tSymRotated.x,
                                    tSymRotated.y,
                                    ringRotation
                                );

                                // Control point pulled toward center to keep arcs mandala-like.
                                const pull = (0.85 - ring * 0.03);
                                const cpX  = (final.x + tFinal.x) / 2 * pull + this.centerX * (1 - pull);
                                const cpY  = (final.y + tFinal.y) / 2 * pull + this.centerY * (1 - pull);

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
                }
            }
        }

        // Center anchor.
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 5 * pulse, 0, Math.PI * 2);
        this.ctx.fillStyle   = `hsl(${this.baseHue}, 80%, 70%)`;
        this.ctx.shadowBlur  = 15 * pulse;
        this.ctx.shadowColor = `hsl(${this.baseHue}, 80%, 70%)`;
        this.ctx.fill();
        this.ctx.shadowBlur  = 0;

        // Provenance stamp.
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

        // Intention stamp.
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
            let lines = [];
            let currentLine = '';

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

    // Animation loop.
    // Time drives breathing and cosmic evolution; rotationAngle drives global spin.
    startBreathing() {
        const rotationStep = -0.005;

        const animate = () => {
            this.time += this.pulseSpeed;
            this.rotationAngle += rotationStep;

            const pulse =
                1.0 +
                Math.sin(this.time) * this.pulseAmplitude +
                Math.sin(this.time * 1.6) * (this.pulseAmplitude * 0.2);

            this.drawMandala(pulse);
            this.animationFrame = requestAnimationFrame(animate);
        };

        animate();
    }

    stopBreathing() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    // Spiral dissolve: ends a session without altering the underlying constellation.
    // It collapses the rendered frame over time, then resolves into a black canvas.
    spiralDissolve(duration) {
        this.stopBreathing();

        const steps    = 60;
        const interval = duration / steps;
        let step       = 0;

        const dissolve = setInterval(() => {
            step++;
            const scale = Math.max(0.001, 1 - (step / steps));

            // Accelerate rotation during collapse for a "spiral into void".
            this.rotationAngle -= step * 0.01;

            // Partial fill preserves a fading trail during collapse.
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.save();
            this.ctx.translate(this.centerX, this.centerY);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-this.centerX, -this.centerY);

            // Draw uses 'scale' as a visual pulse multiplier during dissolve.
            this.drawMandala(scale);

            this.ctx.restore();

            if (step >= steps) {
                clearInterval(dissolve);
                this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }, interval);
    }

    getCurrentFrame() {
        return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
}
