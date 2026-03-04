// =============================================================
// mandala.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Deterministic sacred-geometry renderer for Intention Keeper.
// The SHA-256-derived constellation (points) is generated via hash-encoder.js
// and MUST remain the fixed foundation. This file only determines:
//
//   - how to connect those fixed points (graph topology)
//   - how to layer rings + symmetries (render structure)
//   - how to animate breathing/rotation and (Cosmic) smooth morphing
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
// - Avoid per-frame allocations where possible.
// - Avoid “snapping” by blending between edge sets instead of rounding.
// - Avoid O(n^2) helper calls (e.g., perm.indexOf) inside hot loops.
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

    // Rings/symmetry are derived from the hash (stable per intention).
    this.numRings = 3 + (this.hashNumbers[1] % 5);
    this.primarySymmetry = [6, 8, 12, 16][this.hashNumbers[2] % 4];
    this.baseHue = this.hashNumbers[3] % 360;
    this.complexity = 1 + (this.hashNumbers[4] % 3);

    // Secondary symmetry used as optional extra layer.
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
  // TOPOLOGY ENGINE (deterministic, wide design space)
  // -------------------------------------------------------------
  buildTopologyEngine(hashNumbers, n) {
    // Seeds pulled from mid-bytes to reduce correlation with core structure.
    const seedA = (hashNumbers[12] << 8) | hashNumbers[13];
    const seedB = (hashNumbers[14] << 8) | hashNumbers[15];
    const seedC = (hashNumbers[16] << 8) | hashNumbers[17];
    const seedD = (hashNumbers[18] << 8) | hashNumbers[19];

    // A stable node permutation is the biggest “pattern space” multiplier.
    // It changes ONLY connection ordering, not the constellation itself.
    const perm = this.makePermutation(n, seedC);
    const invPerm = new Array(n);
    for (let k = 0; k < n; k++) invPerm[perm[k]] = k;

    // Family space (expanded): more families + parameterized families.
    // Cosmic morph blends across this space; Sacred picks stable indices.
    const familyCount = 14;
    const baseFamily = hashNumbers[23] % familyCount;
    const auxFamily = hashNumbers[24] % familyCount;

    // Density controls (prevent “blob” graphs).
    // These are upper-bounds; the renderer still applies symmetry/rings.
    const maxEdgesPerNode = Math.max(2, Math.min(6, 2 + (hashNumbers[25] % 5)));

    // Minimum hop in permutation space discourages “short-edge clumping.”
    const minHop = 1 + (hashNumbers[26] % Math.max(1, Math.floor(n / 3)));

    // Cosmic edge thinning: deterministic, avoids per-frame randomness.
    // Higher values = fewer edges drawn, lower CPU + less blob tendency.
    const cosmicEdgeStride = 1 + (hashNumbers[27] % 3); // 1..3

    // Modulators used by some families.
    const mult1 = 2 + (seedA % Math.max(2, n - 1));
    const mult2 = 2 + (seedB % Math.max(2, n - 1));

    // Deterministic fractional step (stable per intention).
    const irrationalStep = 0.65 + (seedD % 900) / 1000; // 0.65 .. 1.549

    // Tiny deterministic “noise” for gating decisions.
    const mixU32 = (x) => {
      x = x >>> 0;
      x ^= x >>> 16;
      x = Math.imul(x, 0x7feb352d) >>> 0;
      x ^= x >>> 15;
      x = Math.imul(x, 0x846ca68b) >>> 0;
      x ^= x >>> 16;
      return x >>> 0;
    };

    const gate01 = (i, ring, sym, lane) => {
      // 0..1 deterministic “random-like” value for thinning edges
      const x =
        (seedA << 16) ^ seedB ^
        (i * 2654435761) ^
        (ring * 1013904223) ^
        (sym * 1664525) ^
        (lane * 2246822519);
      return mixU32(x) / 0xFFFFFFFF;
    };

    // Helpers for permutation-space indexing.
    const permIndexOfNode = (nodeIndex) => invPerm[nodeIndex];
    const nodeAtPermIndex = (pIdx) => perm[(pIdx % n + n) % n];

    // Families operate in permutation-index space (0..n-1),
    // then map back to actual node indices through perm[].
    const families = [];

    // 0) Star/skip in perm-space with gentle drift.
    families.push((pIdx, t) => {
      const baseK = 1 + (seedA % Math.max(1, n - 1));
      const drift = 1 + 0.35 * Math.sin(t);
      const k = Math.max(1, Math.floor(baseK * drift)) % n;
      return (pIdx + k) % n;
    });

    // 1) Alternate braid (two steps, blended by sin).
    families.push((pIdx, t) => {
      const a = 1 + (seedA % Math.max(1, n - 1));
      const b = 1 + (seedB % Math.max(1, n - 1));
      const w = 0.5 + 0.5 * Math.sin(t * 0.9);
      const k = Math.max(1, Math.floor((1 - w) * a + w * b));
      return (pIdx + k) % n;
    });

    // 2) Mirror chord (reflect then offset).
    families.push((pIdx, t) => {
      const reflect = (n - 1 - pIdx);
      const off = 1 + (seedC % Math.max(1, n - 1));
      const drift = 1 + 0.30 * Math.sin(t * 1.1);
      return (reflect + Math.max(1, Math.floor(off * drift))) % n;
    });

    // 3) Multiply modulo in perm-space (high variety).
    families.push((pIdx, t) => {
      const drift = 0.6 + 0.4 * Math.sin(t * 0.7);
      const m = Math.max(2, Math.round(mult1 * (0.85 + drift * 0.35)));
      return (pIdx * m + (seedB % n)) % n;
    });

    // 4) Dual multiply weave (switches based on phase).
    families.push((pIdx, t) => {
      const a = (pIdx * mult1 + seedA) % n;
      const b = (pIdx * mult2 + seedB) % n;
      const w = 0.5 + 0.5 * Math.sin(t * 0.55);
      return (w < 0.5) ? a : b;
    });

    // 5) Irrational stride (fractional rotation in perm space).
    families.push((pIdx, t) => {
      const phase = (pIdx * irrationalStep + t * 0.25) % n;
      return (Math.floor(phase) + (seedA % 3)) % n;
    });

    // 6) “Weave” with alternating long/short hops.
    families.push((pIdx, t) => {
      const longHop = Math.max(2, minHop + (seedB % Math.max(2, n - 1)));
      const shortHop = Math.max(1, minHop);
      const w = 0.5 + 0.5 * Math.sin(t * 1.3);
      const k = (w < 0.5) ? longHop : shortHop;
      return (pIdx + k) % n;
    });

    // 7) Offset-from-center chords (encourages perimeter crossings).
    families.push((pIdx, t) => {
      const center = Math.floor(n / 2);
      const d = pIdx - center;
      const off = 1 + (seedD % Math.max(1, n - 1));
      const drift = 1 + 0.25 * Math.sin(t * 0.8);
      return (center - d + Math.floor(off * drift)) % n;
    });

    // 8) Bit-ish shuffle (works well for up to 16 nodes).
    families.push((pIdx, t) => {
      const shift = 1 + (seedB % 3);
      const mask = (1 << 4) - 1;
      const j = (((pIdx << shift) | (pIdx >> (4 - shift))) & mask) % n;
      const drift = (seedD % n);
      return (j + drift + Math.floor(1 + 0.5 * Math.sin(t))) % n;
    });

    // 9) “Near-far” alternator to avoid only-short edges.
    families.push((pIdx, t) => {
      const near = (pIdx + minHop) % n;
      const far = (pIdx + Math.max(minHop + 2, Math.floor(n / 2))) % n;
      const w = 0.5 + 0.5 * Math.sin(t * 0.65);
      return (w < 0.5) ? near : far;
    });

    // 10) Two-chord fan: target depends on parity.
    families.push((pIdx, t) => {
      const k1 = Math.max(1, minHop + (seedA % Math.max(1, n - 1)));
      const k2 = Math.max(1, minHop + (seedC % Math.max(1, n - 1)));
      const drift = 1 + 0.20 * Math.sin(t * 1.05);
      const kk1 = Math.max(1, Math.floor(k1 * drift));
      const kk2 = Math.max(1, Math.floor(k2 * drift));
      return (pIdx + ((pIdx & 1) ? kk2 : kk1)) % n;
    });

    // 11) “Opposed braid”: pair with opposite then add hop.
    families.push((pIdx, t) => {
      const opp = (pIdx + Math.floor(n / 2)) % n;
      const hop = Math.max(1, minHop + (seedB % Math.max(1, n - 1)));
      const drift = 1 + 0.25 * Math.sin(t * 0.9);
      return (opp + Math.max(1, Math.floor(hop * drift))) % n;
    });

    // 12) “Saw weave”: alternating forward/back hops.
    families.push((pIdx, t) => {
      const hop = Math.max(1, minHop + (seedD % Math.max(1, n - 1)));
      const dir = (Math.sin(t * 0.8 + pIdx) >= 0) ? 1 : -1;
      return (pIdx + dir * hop) % n;
    });

    // 13) “Triad-ish” chord: target from 1/3 and 2/3 partitions.
    families.push((pIdx, t) => {
      const a = (pIdx + Math.max(minHop, Math.floor(n / 3))) % n;
      const b = (pIdx + Math.max(minHop, Math.floor((2 * n) / 3))) % n;
      const w = 0.5 + 0.5 * Math.sin(t * 0.7);
      return (w < 0.5) ? a : b;
    });

    // Clamp hops away from zero/self and enforce minHop.
    const enforceHop = (pFrom, pTo) => {
      let delta = (pTo - pFrom + n) % n;
      if (delta === 0) delta = 1;
      if (delta < minHop) delta = minHop;
      return (pFrom + delta) % n;
    };

    return {
      n,
      perm,
      invPerm,
      baseFamily,
      auxFamily,
      families,
      seedA, seedB, seedC, seedD,
      maxEdgesPerNode,
      minHop,
      cosmicEdgeStride,
      permIndexOfNode,
      nodeAtPermIndex,
      enforceHop,
      gate01
    };
  }

  // Deterministic permutation via LCG + Fisher-Yates.
  makePermutation(n, seed) {
    let s = seed >>> 0;
    const rand = () => {
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

  // Compute topology targets for node i at time t.
  // Sacred: stable (two stable graphs layered).
  // Cosmic: returns two morph lanes (A and B), each blending between adjacent families.
  getTopologyTargets(i, t) {
    const topo = this.topo;
    const n = topo.n;

    // Convert node index → permutation-index space.
    const pIdx = topo.permIndexOfNode(i);

    if (this.style === "sacred") {
      const pa = topo.families[topo.baseFamily](pIdx, 0);
      const pb = topo.families[topo.auxFamily](pIdx, 0);

      // Enforce minimum hop (reduces self/near repeats that collapse variety).
      const pA2 = topo.enforceHop(pIdx, pa);
      const pB2 = topo.enforceHop(pIdx, pb);

      return {
        a: topo.nodeAtPermIndex(pA2),
        b: topo.nodeAtPermIndex(pB2)
      };
    }

    // Cosmic: smooth morph through family space, blended by fractional phase.
    const familyPhase = t * topo.n * this.morphSpeed;
    const baseIdx = Math.floor(familyPhase) % topo.families.length;
    const nextIdx = (baseIdx + 1) % topo.families.length;
    const w = familyPhase - Math.floor(familyPhase);

    const auxPhase = t * topo.n * (this.morphSpeed * 0.73);
    const auxIdx = (Math.floor(auxPhase) + topo.auxFamily) % topo.families.length;
    const auxNext = (auxIdx + 1) % topo.families.length;
    const w2 = auxPhase - Math.floor(auxPhase);

    const driftT = t * topo.n * this.paramDriftSpeed;

    const a0p = topo.enforceHop(pIdx, topo.families[baseIdx](pIdx, driftT));
    const a1p = topo.enforceHop(pIdx, topo.families[nextIdx](pIdx, driftT));

    const b0p = topo.enforceHop(pIdx, topo.families[auxIdx](pIdx, driftT));
    const b1p = topo.enforceHop(pIdx, topo.families[auxNext](pIdx, driftT));

    return {
      a0: topo.nodeAtPermIndex(a0p),
      a1: topo.nodeAtPermIndex(a1p),
      w,
      b0: topo.nodeAtPermIndex(b0p),
      b1: topo.nodeAtPermIndex(b1p),
      w2
    };
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

        for (let s = 0; s < symmetry; s++) {
          const symAngle = (Math.PI * 2 * s) / symmetry;
          const cosSym = Math.cos(symAngle);
          const sinSym = Math.sin(symAngle);

          // Hot loop: draw points + edges.
          for (let i = 0; i < this.points.length; i++) {
            const bp = baseProj[i];

            // Apply symmetry rotation then ring rotation.
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
            if (!this.topo) continue;

            // A deterministic thinning rule prevents dense “blob” graphs in Cosmic
            // without introducing randomness or changing the constellation.
            if (this.style === "cosmic") {
              if ((i + ring + s) % this.topo.cosmicEdgeStride !== 0) continue;
            }

            if (this.style === "sacred") {
              const { a, b } = this.getTopologyTargets(i, 0);

              // Primary edge (dominant).
              this.drawEdge(
                i, a, baseProj, cosSym, sinSym, cosRing, sinRing,
                ring, layerHue, layerAlpha, 1.0, /*isCosmic*/ false
              );

              // Secondary edge (supportive).
              this.drawEdge(
                i, b, baseProj, cosSym, sinSym, cosRing, sinRing,
                ring, (layerHue + 30) % 360, layerAlpha * 0.35, 0.9, /*isCosmic*/ false
              );
            } else {
              const t = this.time;
              const { a0, a1, w, b0, b1, w2 } = this.getTopologyTargets(i, t);

              // Blend lane A: draw both edge sets with alpha weighting (no snapping).
              this.drawEdge(
                i, a0, baseProj, cosSym, sinSym, cosRing, sinRing,
                ring, layerHue, layerAlpha * (1 - w), 1.0, /*isCosmic*/ true
              );
              this.drawEdge(
                i, a1, baseProj, cosSym, sinSym, cosRing, sinRing,
                ring, layerHue, layerAlpha * (w), 1.0, /*isCosmic*/ true
              );

              // Blend lane B (interference): complementary hue, softer.
              const h2 = (layerHue + 150) % 360;
              this.drawEdge(
                i, b0, baseProj, cosSym, sinSym, cosRing, sinRing,
                ring, h2, layerAlpha * 0.22 * (1 - w2), 0.9, /*isCosmic*/ true
              );
              this.drawEdge(
                i, b1, baseProj, cosSym, sinSym, cosRing, sinRing,
                ring, h2, layerAlpha * 0.22 * (w2), 0.9, /*isCosmic*/ true
              );
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
  // Control point is gently pulled inward to preserve the “mandala arc” feel.
  //
  // Important: This method is designed to be “safe” in hot loops:
  // - It guards against duplicate edge draws (j <= i).
  // - In Cosmic mode it softly suppresses very-short edges to reduce “blob” density.
  drawEdge(i, j, baseProj, cosSym, sinSym, cosRing, sinRing, ring, hue, alpha, weight, isCosmic) {
    if (j <= i) return;

    const bp1 = baseProj[i];
    const bp2 = baseProj[j];

    const x1 = this.centerX + (bp1.x * cosSym - bp1.y * sinSym);
    const y1 = this.centerY + (bp1.x * sinSym + bp1.y * cosSym);
    const p1 = this.rotateAroundCenter(x1, y1, cosRing, sinRing);

    const x2 = this.centerX + (bp2.x * cosSym - bp2.y * sinSym);
    const y2 = this.centerY + (bp2.x * sinSym + bp2.y * cosSym);
    const p2 = this.rotateAroundCenter(x2, y2, cosRing, sinRing);

    // In Cosmic mode, suppress very short edges (they are the main contributor to “blobs”).
    if (isCosmic) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const d2 = dx * dx + dy * dy;

      // Threshold scales with canvas size so small screens don’t over-prune.
      const minLen = Math.max(10, Math.floor(this.canvas.width / 28));
      if (d2 < (minLen * minLen)) return;

      // Fade short-ish edges more than long chords.
      const fade = Math.min(1, Math.max(0.15, Math.sqrt(d2) / (this.canvas.width * 0.45)));
      alpha *= fade;
    }

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
    // Cap to 60 FPS to reduce paint pressure while keeping motion time-based.
    const FPS_CAP = 60;
    const FRAME_MS = 1000 / FPS_CAP;

    // Rotation is expressed per-second so it remains consistent if the cap changes.
    const rotationPerSecond = -0.30; // radians/sec, negative = counterclockwise

    let last = performance.now();
    let acc = 0;

    const animate = (now) => {
      const dtMs = now - last;
      last = now;

      // Clamp large gaps (tab switch / breakpoint) so we don't "fast-forward" violently.
      acc += Math.min(dtMs, 100);

      // Only render when we've met the frame budget.
      if (acc >= FRAME_MS) {
        // Consume exactly one fixed step for stable feel.
        acc -= FRAME_MS;
        const dt = FRAME_MS / 1000; // seconds

        // pulseSpeed was historically "per RAF tick"; scaling by ~60 preserves the tuned feel.
        this.time += this.pulseSpeed * (dt * 60);
        this.rotationAngle += rotationPerSecond * dt;

        const pulse =
          1.0 +
          Math.sin(this.time) * this.pulseAmplitude +
          Math.sin(this.time * 1.6) * (this.pulseAmplitude * 0.2);

        this.drawMandala(pulse);
      }

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
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

      // Reuse drawMandala() so provenance text collapses with the geometry.
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
