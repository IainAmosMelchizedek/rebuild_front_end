// =============================================================
// mandala.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Deterministic sacred-geometry renderer for the Intention Keeper.
// A SHA-256-derived point constellation is generated elsewhere (hash-encoder.js)
// and MUST remain the fixed foundation. This file only decides how to:
//   - connect those fixed points (graph topology)
//   - layer symmetries/rings (render structure)
//   - animate breathing/rotation and (for Cosmic) smooth morphing
//
// HARD REQUIREMENTS (must stay fixed by design):
// ✅ SHA-256 identity (generateHash) — unchanged
// ✅ hexToNumbers() — unchanged
// ✅ hashToSphericalCoords() — unchanged mapping bytes→lon/lat/radius (+ golden angle)
// ✅ numPoints = 8 + (hashNumbers[0] % 8) — unchanged
// ✅ point order / byte-to-point mapping — unchanged
// ✅ coordinate formulas — unchanged
//
// WHAT MAY EVOLVE (still “true” to the intention):
// - Connection topology over the fixed nodes (graph edges)
// - Layering strategy (multiple graphs over the same nodes)
// - Continuous morphing between topologies (Cosmic only)
// - Hash-tied modulation (alpha/width/hue) that is deterministic
//
// PERFORMANCE ASSUMPTION:
// Canvas rendering must remain smooth on typical laptops/phones.
// This file avoids per-frame expensive allocations where possible,
// and avoids “snapping” by blending between topologies instead of rounding.
//
// =============================================================

class MandalaGenerator {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.animationFrame = null;

    // Time drives breathing and (Cosmic) topology morphing.
    this.time = 0;

    // Fixed point set derived from the hash (MUST stay deterministic).
    this.points = [];
    this.hashNumbers = [];
    this.fullHash = "";
    this.intentionText = "";

    // Structural parameters seeded from hash in generate().
    this.numRings = 0;
    this.primarySymmetry = 0;
    this.secondarySymmetry = 0;
    this.baseHue = 0;
    this.complexity = 0;

    // Breathing parameters seeded from hash.
    this.pulseAmplitude = 0.10;
    this.pulseSpeed = 0.02;

    // Counterclockwise master rotation (applied to coordinates).
    this.rotationAngle = 0;

    // Rendering style.
    this.style = "sacred"; // 'sacred' | 'cosmic'
    this.showHash = true;

    // Cosmic overlay parameters (still seeded deterministically).
    this.lissajousA = 3;
    this.lissajousB = 2;
    this.lissajousDelta = 0;

    // Smooth evolution speeds (Cosmic).
    this.morphSpeed = 0.002;        // topology morph speed
    this.paramDriftSpeed = 0.0015;  // drift within a topology family
    this.lissajousSpeed = 0.0025;

    // Unified topology engine state (seeded once per intention).
    this.topo = null;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  // Keep the canvas square, sized to viewport without overflow.
  resizeCanvas() {
    const maxSize = Math.min(window.innerWidth - 40, 600);
    this.canvas.width = maxSize;
    this.canvas.height = maxSize;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }

  // -------------------------------------------------------------
  // GENERATE (hash → fixed constellation + deterministic parameters)
  // -------------------------------------------------------------
  async generate(intentionText) {
    this.intentionText = intentionText;

    const hash = await generateHash(intentionText);
    this.hashNumbers = hexToNumbers(hash);
    this.fullHash = hash;

    // MUST REMAIN: point count formula.
    const numPoints = 8 + (this.hashNumbers[0] % 8);

    // Rings/symmetry are still derived from the hash (stable per intention).
    this.numRings = 3 + (this.hashNumbers[1] % 5);
    this.primarySymmetry = [6, 8, 12, 16][this.hashNumbers[2] % 4];
    this.baseHue = this.hashNumbers[3] % 360;
    this.complexity = 1 + (this.hashNumbers[4] % 3);

    // Secondary symmetry is used as an optional extra layer.
    this.secondarySymmetry = [3, 5, 7, 9][this.hashNumbers[6] % 4];

    // Lissajous (Cosmic) parameters.
    const lissajousPairs = [
      [3, 2], [4, 3], [5, 4], [5, 3], [7, 4], [6, 5]
    ];
    const pair = lissajousPairs[this.hashNumbers[8] % lissajousPairs.length];
    this.lissajousA = pair[0];
    this.lissajousB = pair[1];
    this.lissajousDelta = (this.hashNumbers[9] / 255) * Math.PI;

    // Breathing parameters (stable per intention).
    this.pulseAmplitude = 0.05 + (this.hashNumbers[10] / 255) * 0.15;
    this.pulseSpeed = 0.015 + (this.hashNumbers[11] / 255) * 0.03;

    // Evolution speeds (stable per intention, vary across intentions).
    this.morphSpeed = 0.0012 + (this.hashNumbers[20] / 255) * 0.0035;
    this.paramDriftSpeed = 0.0009 + (this.hashNumbers[21] / 255) * 0.0025;
    this.lissajousSpeed = 0.0010 + (this.hashNumbers[22] / 255) * 0.0040;

    // Reset animation state.
    this.rotationAngle = 0;
    this.time = 0;

    // MUST REMAIN: point order + mapping. We call hashToSphericalCoords
    // once per point, in index order 0..numPoints-1.
    this.points = [];
    for (let i = 0; i < numPoints; i++) {
      this.points.push(hashToSphericalCoords(this.hashNumbers, i));
    }

    // Build unified topology engine once per intention.
    this.topo = this.buildTopologyEngine(this.hashNumbers, numPoints);

    return hash;
  }

  setStyle(styleName) {
    this.style = styleName;
  }

  // -------------------------------------------------------------
  // PROJECTION + ROTATION HELPERS (avoid ctx.rotate stacking)
  // -------------------------------------------------------------
  projectPoint(lon, lat, radius, scale) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return {
      x: Math.sin(phi) * Math.cos(theta) * scale * radius,
      y: Math.sin(phi) * Math.sin(theta) * scale * radius
    };
  }

  // Rotate around the canvas center using precomputed cos/sin.
  rotateAroundCenter(x, y, cos, sin) {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    return {
      x: this.centerX + dx * cos - dy * sin,
      y: this.centerY + dx * sin + dy * cos
    };
  }

  // -------------------------------------------------------------
  // TOPOLOGY ENGINE (deterministic, large design space)
  // -------------------------------------------------------------
  buildTopologyEngine(hashNumbers, n) {
    // Seeds: pulled from mid-bytes to reduce correlation with core structure.
    const seedA = (hashNumbers[12] << 8) | hashNumbers[13];
    const seedB = (hashNumbers[14] << 8) | hashNumbers[15];
    const seedC = (hashNumbers[16] << 8) | hashNumbers[17];
    const seedD = (hashNumbers[18] << 8) | hashNumbers[19];

    // “Family” choices: selecting multiple independent families creates
    // far more variety than a single skip-based star polygon.
    const baseFamily = hashNumbers[23] % 8;
    const auxFamily = hashNumbers[24] % 8;

    // Perimeter/degree limits to keep density controlled.
    const minDegree = 1;
    const maxDegree = Math.max(2, Math.min(6, 2 + (hashNumbers[25] % 5)));

    // Derive stable “multipliers” used by certain families.
    const mult1 = 2 + (seedA % Math.max(2, n - 1));
    const mult2 = 2 + (seedB % Math.max(2, n - 1));

    // A stable, deterministic permutation (for “permuted chord” family).
    const perm = this.makePermutation(n, seedC);

    // Deterministic irrational-ish step (golden-ratio flavored) in index space.
    // We keep it stable per intention; time only blends/morphs, not randomizes.
    const irrationalStep = 0.5 + (seedD % 1000) / 1000; // 0.5 .. 1.499

    // Families: each returns an integer target index in [0, n).
    const families = [
      // 0) Skip/star polygon (classic), but parameterized by time-drift.
      (i, t) => {
        const drift = 1 + Math.sin(t) * 0.5;
        const k = Math.max(1, Math.round(((seedA % (n - 1)) + 1) * drift)) % n;
        return (i + k) % n;
      },

      // 1) Multiply modulo (produces jumpy chords, many distinct graphs).
      (i, t) => {
        const drift = 0.5 + 0.5 * Math.sin(t * 0.7);
        const m = Math.max(2, Math.round(mult1 * (0.75 + drift * 0.5)));
        return (i * m + (seedB % n)) % n;
      },

      // 2) Two-step braid (alternating offsets).
      (i, t) => {
        const a = 1 + (seedA % Math.max(1, n - 1));
        const b = 1 + (seedB % Math.max(1, n - 1));
        const w = 0.5 + 0.5 * Math.sin(t);
        const k = (1 - w) * a + w * b;
        return (i + Math.max(1, Math.floor(k))) % n;
      },

      // 3) Mirror chord (reflect then offset).
      (i, t) => {
        const reflect = (n - 1 - i);
        const off = 1 + (seedC % Math.max(1, n - 1));
        const drift = 1 + 0.35 * Math.sin(t * 1.3);
        return (reflect + Math.max(1, Math.floor(off * drift))) % n;
      },

      // 4) Permuted chord (stable permutation graph).
      (i, t) => {
        // Small drift chooses neighbor within permutation to create richer variety
        // without ever leaving the permuted “space.”
        const w = 0.5 + 0.5 * Math.sin(t * 0.9);
        const step = Math.max(1, Math.floor(1 + w * (maxDegree - 1)));
        return perm[(perm.indexOf(i) + step) % n];
      },

      // 5) Irrational stride (index-space “rotation” via fractional drift).
      (i, t) => {
        const phase = (i * irrationalStep + t * 0.2) % n;
        return (Math.floor(phase) + (seedA % 3)) % n;
      },

      // 6) Bit-ish shuffle (good for n up to 15; still works for 8..15).
      (i, t) => {
        const shift = 1 + (seedB % 3);
        const mask = (1 << 4) - 1; // supports up to 16
        const j = (((i << shift) | (i >> (4 - shift))) & mask) % n;
        const drift = (seedD % n);
        return (j + drift + Math.floor(1 + 0.5 * Math.sin(t))) % n;
      },

      // 7) Dual-multiply weave (two modulo maps blended).
      (i, t) => {
        const w = 0.5 + 0.5 * Math.sin(t * 0.6);
        const a = (i * mult1 + seedA) % n;
        const b = (i * mult2 + seedB) % n;
        // Choose smoothly by alternating “edge set weighting” elsewhere.
        return w < 0.5 ? a : b;
      }
    ];

    const clampDegree = (d) => Math.max(minDegree, Math.min(maxDegree, d));

    return {
      n,
      baseFamily,
      auxFamily,
      families,
      clampDegree,
      seedA,
      seedB,
      seedC,
      seedD
    };
  }

  // Deterministic permutation via LCG + Fisher-Yates.
  makePermutation(n, seed) {
    let s = seed >>> 0;
    const rand = () => {
      // LCG constants (fast, deterministic)
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 0x100000000;
    };

    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // Return a blended “target index” by mixing two families.
  // This avoids snapping: instead of changing a discrete integer parameter abruptly,
  // we render BOTH edge sets with weights elsewhere. Here we just compute targets.
  getTopologyTargets(i, t) {
    const topo = this.topo;
    const n = topo.n;

    // Sacred: stable (no morphing over time).
    if (this.style === "sacred") {
      const a = topo.families[topo.baseFamily](i, 0);
      // Auxiliary stable layer for richness (still stable).
      const b = topo.families[topo.auxFamily](i, 0);
      return { a, b, w: 0.0 };
    }

    // Cosmic: smooth morph through family space.
    // We move through families continuously and blend adjacent families.
    const familyPhase = t * topo.n * this.morphSpeed; // scaled for variety
    const baseIdx = Math.floor(familyPhase) % topo.families.length;
    const nextIdx = (baseIdx + 1) % topo.families.length;
    const w = familyPhase - Math.floor(familyPhase); // 0..1 blend

    // A second, independent morph lane (creates interference patterns).
    const auxPhase = t * topo.n * (this.morphSpeed * 0.73);
    const auxIdx = (Math.floor(auxPhase) + topo.auxFamily) % topo.families.length;
    const auxNext = (auxIdx + 1) % topo.families.length;
    const w2 = auxPhase - Math.floor(auxPhase);

    const driftT = t * topo.n * this.paramDriftSpeed;

    const a0 = topo.families[baseIdx](i, driftT);
    const a1 = topo.families[nextIdx](i, driftT);
    const b0 = topo.families[auxIdx](i, driftT);
    const b1 = topo.families[auxNext](i, driftT);

    // We return targets for two lanes; draw code blends the lanes by alpha.
    return { a0, a1, w, b0, b1, w2 };
  }

  // -------------------------------------------------------------
  // COSMIC OVERLAY (kept lightweight)
  // -------------------------------------------------------------
  drawLissajous(pulse, hue, phase) {
    const steps = 140;
    const scale = Math.min(this.canvas.width, this.canvas.height) * 0.30 * pulse;
    const alpha = 0.18;

    const rot = this.rotationAngle * 0.5;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    this.ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const rawX = Math.sin(this.lissajousA * t + this.lissajousDelta + phase) * scale;
      const rawY = Math.sin(this.lissajousB * t + phase * 0.7) * scale;

      const p = this.rotateAroundCenter(
        this.centerX + rawX,
        this.centerY + rawY,
        cosR,
        sinR
      );

      if (i === 0) this.ctx.moveTo(p.x, p.y);
      else this.ctx.lineTo(p.x, p.y);
    }

    const cHue = (hue + 120) % 360;
    this.ctx.strokeStyle = `hsla(${cHue}, 60%, 55%, ${alpha})`;
    this.ctx.lineWidth = 1;
    this.ctx.shadowBlur = 5;
    this.ctx.shadowColor = `hsla(${cHue}, 70%, 65%, ${alpha})`;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  // -------------------------------------------------------------
  // DRAW FRAME
  // -------------------------------------------------------------
  drawMandala(pulse) {
    // Slightly translucent fill for motion trails.
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const scale = Math.min(this.canvas.width, this.canvas.height) / 3;
    const hue = (this.baseHue + this.time * 10) % 360;

    // Cosmic overlay first (behind main geometry).
    if (this.style === "cosmic") {
      const lPhase = this.time * this.lissajousSpeed * 120;
      this.drawLissajous(pulse, hue, lPhase);
    }

    // Ring depth ordering: back to front.
    for (let ring = this.numRings - 1; ring >= 0; ring--) {
      const ringRadius = (ring + 1) / this.numRings;
      const alphaBase = 0.30 + (ring / this.numRings) * 0.50;
      const ringHue = (hue + ring * 30) % 360;

      // Parallax: inner rings rotate faster, outer slower.
      const depth = ring / (this.numRings - 1 || 1);
      const depthFactor = 0.30 + depth * 1.50; // 0.3..1.8
      const ringRotation = this.rotationAngle * depthFactor;
      const cosRing = Math.cos(ringRotation);
      const sinRing = Math.sin(ringRotation);

      // Decide symmetry layers.
      // Sacred: primary only (stable).
      // Cosmic: primary + secondary (still controlled).
      const symList = (this.style === "cosmic")
        ? [this.primarySymmetry, this.secondarySymmetry]
        : [this.primarySymmetry];

      // Precompute base projected positions for this ring (reduces repeated trig).
      const baseProj = new Array(this.points.length);
      for (let i = 0; i < this.points.length; i++) {
        const p = this.points[i];
        baseProj[i] = this.projectPoint(
          p.longitude,
          p.latitude,
          p.radius * ringRadius * pulse,
          scale
        );
      }

      // For each symmetry layer, draw nodes and edges.
      for (let layerIdx = 0; layerIdx < symList.length; layerIdx++) {
        const symmetry = symList[layerIdx];

        // Secondary layer is supportive (reduced alpha + complementary hue).
        const layerHue = (layerIdx === 0) ? ringHue : (ringHue + 180) % 360;
        const layerAlpha = (layerIdx === 0) ? alphaBase : alphaBase * 0.40;

        // Precompute symmetry cos/sin once per segment.
        for (let s = 0; s < symmetry; s++) {
          const symAngle = (Math.PI * 2 * s) / symmetry;
          const cosSym = Math.cos(symAngle);
          const sinSym = Math.sin(symAngle);

          // Draw points + edges.
          for (let i = 0; i < this.points.length; i++) {
            const bp = baseProj[i];

            // Apply symmetry rotation (around center), then ring rotation (parallax).
            const symX = this.centerX + (bp.x * cosSym - bp.y * sinSym);
            const symY = this.centerY + (bp.x * sinSym + bp.y * cosSym);

            const final = this.rotateAroundCenter(symX, symY, cosRing, sinRing);

            // Dot size: sacred crisper, cosmic slightly more glow.
            const dotScale = (this.style === "sacred") ? 0.62 : 0.90;
            const depthSize = (2 + this.complexity) * pulse * (0.7 + depth * 0.6) * dotScale;

            this.ctx.beginPath();
            this.ctx.arc(final.x, final.y, depthSize, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsla(${layerHue}, 70%, 60%, ${layerAlpha})`;
            this.ctx.shadowBlur = ((this.style === "sacred") ? 6 : 9) * pulse * (0.5 + depth * 0.8);
            this.ctx.shadowColor = `hsla(${layerHue}, 80%, 70%, ${layerAlpha})`;
            this.ctx.fill();

            // --- Edges (Topology Engine) ---
            // Sacred: stable “rich” structure by drawing TWO stable graphs:
            //   - base family edges (primary)
            //   - aux family edges (subtle)
            // Cosmic: continuous morph by blending two edge-sets with weights.
            const t = this.time;

            if (!this.topo) continue;

            if (this.style === "sacred") {
              const { a, b } = this.getTopologyTargets(i, 0);

              // Primary edge.
              this.drawEdge(i, a, baseProj, cosSym, sinSym, cosRing, sinRing, ring, layerHue, layerAlpha, 1.0);

              // Secondary edge (softer).
              this.drawEdge(i, b, baseProj, cosSym, sinSym, cosRing, sinRing, ring, (layerHue + 30) % 360, layerAlpha * 0.35, 0.9);
            } else {
              const { a0, a1, w, b0, b1, w2 } = this.getTopologyTargets(i, t);

              // Blend lane A: draw both edge-sets with alpha weighting (no snapping).
              this.drawEdge(i, a0, baseProj, cosSym, sinSym, cosRing, sinRing, ring, layerHue, layerAlpha * (1 - w), 1.0);
              this.drawEdge(i, a1, baseProj, cosSym, sinSym, cosRing, sinRing, ring, layerHue, layerAlpha * (w), 1.0);

              // Blend lane B (interference): complementary hue, softer.
              const h2 = (layerHue + 150) % 360;
              this.drawEdge(i, b0, baseProj, cosSym, sinSym, cosRing, sinRing, ring, h2, layerAlpha * 0.25 * (1 - w2), 0.9);
              this.drawEdge(i, b1, baseProj, cosSym, sinSym, cosRing, sinRing, ring, h2, layerAlpha * 0.25 * (w2), 0.9);
            }
          }
        }
      }
    }

    // Center anchor dot.
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, 5 * pulse, 0, Math.PI * 2);
    this.ctx.fillStyle = `hsl(${this.baseHue}, 80%, 70%)`;
    this.ctx.shadowBlur = 15 * pulse;
    this.ctx.shadowColor = `hsl(${this.baseHue}, 80%, 70%)`;
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // Hash provenance stamp (top-right).
    if (this.showHash && this.fullHash) {
      this.ctx.save();
      const fontSize = Math.max(8, Math.floor(this.canvas.width / 60));
      this.ctx.font = `${fontSize}px monospace`;
      this.ctx.fillStyle = "rgba(149, 165, 166, 0.8)";
      this.ctx.textAlign = "right";
      const x = this.canvas.width - 10;
      this.ctx.fillText("MERIDIAN-HASH:", x, fontSize + 10);
      this.ctx.fillText(this.fullHash.substring(0, 32), x, fontSize * 2 + 15);
      this.ctx.fillText(this.fullHash.substring(32), x, fontSize * 3 + 20);
      this.ctx.restore();
    }

    // Intention stamp (bottom-left).
    if (this.intentionText) {
      this.ctx.save();
      const fontSize = Math.max(9, Math.floor(this.canvas.width / 55));
      this.ctx.font = `${fontSize}px monospace`;
      this.ctx.fillStyle = "rgba(149, 165, 166, 0.85)";
      this.ctx.textAlign = "left";

      const lineH = fontSize + 3;
      const padding = 10;
      const maxChars = Math.floor((this.canvas.width - padding * 2) / (fontSize * 0.6));

      const words = this.intentionText.split(" ");
      const lines = [];
      let currentLine = "";
      for (const word of words) {
        const test = currentLine ? currentLine + " " + word : word;
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
      this.ctx.fillText("INTENTION:", padding, y);
      y += lineH;
      for (const line of lines) {
        this.ctx.fillText(line, padding, y);
        y += lineH;
      }
      this.ctx.restore();
    }
  }

  // Draw one quadratic edge between point i and point j, under the current ring/sym transforms.
  // The control point is gently pulled inward to preserve the “mandala arc” feel.
  drawEdge(i, j, baseProj, cosSym, sinSym, cosRing, sinRing, ring, hue, alpha, weight) {
    if (j === i) return;

    const bp1 = baseProj[i];
    const bp2 = baseProj[j];

    const x1 = this.centerX + (bp1.x * cosSym - bp1.y * sinSym);
    const y1 = this.centerY + (bp1.x * sinSym + bp1.y * cosSym);
    const p1 = this.rotateAroundCenter(x1, y1, cosRing, sinRing);

    const x2 = this.centerX + (bp2.x * cosSym - bp2.y * sinSym);
    const y2 = this.centerY + (bp2.x * sinSym + bp2.y * cosSym);
    const p2 = this.rotateAroundCenter(x2, y2, cosRing, sinRing);

    // Inward pull factor: deeper rings pull a bit more toward the center.
    const pull = (0.85 - ring * 0.03);
    const cpX = ((p1.x + p2.x) / 2) * pull + this.centerX * (1 - pull);
    const cpY = ((p1.y + p2.y) / 2) * pull + this.centerY * (1 - pull);

    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.quadraticCurveTo(cpX, cpY, p2.x, p2.y);
    this.ctx.strokeStyle = `hsla(${hue}, 60%, 50%, ${alpha * 0.55})`;
    this.ctx.lineWidth = 1 * weight;
    this.ctx.shadowBlur = 4;
    this.ctx.stroke();
  }

  // -------------------------------------------------------------
  // ANIMATION LOOP
  // -------------------------------------------------------------
  startBreathing() {
    const rotationStep = -0.005; // negative = counterclockwise
    const animate = () => {
      this.time += this.pulseSpeed;
      this.rotationAngle += rotationStep;

      // Dual-sine breathing.
      const pulse = 1.0 +
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

  // -------------------------------------------------------------
  // SPIRAL DISSOLVE
  // -------------------------------------------------------------
  spiralDissolve(duration) {
    this.stopBreathing();

    const steps = 60;
    const interval = duration / steps;
    let step = 0;

    const dissolve = setInterval(() => {
      step++;
      const scale = Math.max(0.001, 1 - (step / steps));

      // Increase spin as it collapses.
      this.rotationAngle -= step * 0.01;

      this.ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.save();
      this.ctx.translate(this.centerX, this.centerY);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-this.centerX, -this.centerY);

      // We reuse drawMandala() so the provenance text collapses with the geometry.
      this.drawMandala(scale);

      this.ctx.restore();

      if (step >= steps) {
        clearInterval(dissolve);
        this.ctx.fillStyle = "rgba(0, 0, 0, 1)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }, interval);
  }

  getCurrentFrame() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }
}
