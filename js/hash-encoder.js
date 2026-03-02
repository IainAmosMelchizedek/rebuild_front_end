// =============================================================
// hash-encoder.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Cryptographic foundation of the entire application.
// Converts raw intention text into a SHA-256 hash, then maps
// that hash into spherical coordinates used by mandala.js to
// draw the sacred geometry pattern.
//
// HOW IT FITS:
// - Called by mandala.js via generate() → generateHash() → hexToNumbers()
// - hashToSphericalCoords() is called once per geometry point in mandala.js
// - sphericalToCartesian() is available but projection is also handled
//   inline in mandala.js using the same math
// - audio.js reads hashNumbers[14] directly for its harmonic interval
//
// CORE GUARANTEE:
// The same intention text always produces the same SHA-256 hash,
// which always produces the same spherical coordinates, which always
// produces the same mandala. This is what makes each pattern
// cryptographically tied to its intention — it is not random.
//
// GOLDEN ANGLE:
// Points are distributed using the golden angle (~137.5°), the same
// spacing found in sunflower seeds and nautilus shells. This prevents
// clustering and produces a naturally organic, non-repeating spread.
// =============================================================


// Generates a SHA-256 hex string from any input text.
// Uses the browser's native Web Crypto API — no external libraries needed.
// Returns a promise because crypto.subtle.digest() is asynchronous.
async function generateHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


// Converts a 64-character hex hash string into an array of 32 integers (0–255).
// Each integer is one byte of the SHA-256 output.
// These 32 bytes seed every visual and audio parameter in the application.
function hexToNumbers(hexString) {
    const numbers = [];
    for (let i = 0; i < hexString.length; i += 2) {
        numbers.push(parseInt(hexString.substr(i, 2), 16));
    }
    return numbers;
}


// Golden angle in degrees — derived from the golden ratio (phi ≈ 1.618).
// Rotating each successive point by this amount produces the same
// efficient, non-overlapping spiral packing seen in sunflowers and pinecones.
const GOLDEN_ANGLE = 137.50776405003785;


// Converts hash bytes into spherical coordinates for a single geometry point.
//
// Uses up to 15 bytes per point by combining byte pairs for higher precision:
//   - Single byte → 256 possible positions (visible banding at low counts)
//   - Two bytes combined → 65,536 possible positions (smooth, continuous)
//
// Strides 5 bytes per point through the 32-byte hash using modulo wrap,
// so all 32 bytes contribute to variation across the full point set.
//
// Returns secondary modulation values (colorShift, sizeVariance, etc.)
// that mandala.js can use for per-point visual variation without
// affecting the structural geometry.
function hashToSphericalCoords(hashNumbers, index) {
    const len = hashNumbers.length; // always 32 for SHA-256

    // Stride by 5 bytes per point — touches all 32 bytes across the full set
    const offset = (index * 5) % len;

    const v1 = hashNumbers[offset % len];
    const v2 = hashNumbers[(offset + 1) % len];
    const v3 = hashNumbers[(offset + 2) % len];
    const v4 = hashNumbers[(offset + 3) % len];
    const v5 = hashNumbers[(offset + 4) % len];

    // Secondary bytes — further into the hash for independent variation
    const v6  = hashNumbers[(offset + 6)  % len];
    const v7  = hashNumbers[(offset + 7)  % len];
    const v8  = hashNumbers[(offset + 8)  % len];
    const v9  = hashNumbers[(offset + 9)  % len];
    const v10 = hashNumbers[(offset + 10) % len];
    const v11 = hashNumbers[(offset + 11) % len];
    const v12 = hashNumbers[(offset + 12) % len];
    const v13 = hashNumbers[(offset + 13) % len];
    const v14 = hashNumbers[(offset + 14) % len];

    // Two-byte longitude: 65,536 steps eliminates visible angular banding
    let longitude = (v1 * 256 + v2) / 65535 * 360;

    // Golden angle offset — each point rotates ~137.5° from the previous,
    // distributing points in a non-repeating spiral across the sphere
    longitude = (longitude + index * GOLDEN_ANGLE) % 360;

    // Two-byte latitude: smooth pole-to-pole variation
    const latitude = ((v3 * 256 + v4) / 65535 * 180) - 90;

    // Radius range 0.5–1.4 gives more dramatic inner/outer contrast
    // than a tighter range, making the depth-of-field parallax more visible
    const radius = 0.5 + (v5 / 255) * 0.9;

    // Secondary modulation — normalized to 0.0–1.0 for easy scaling
    const colorShift   = (v6  * 256 + v7)  / 65535; // per-point hue offset
    const sizeVariance = (v8  * 256 + v9)  / 65535; // per-point size variation
    const glowStrength = (v10 * 256 + v11) / 65535; // per-point glow intensity
    const twistFactor  = (v12 * 256 + v13) / 65535; // secondary spiral influence
    const depthBias    = v14 / 255;                  // pushes point toward front or back

    return {
        longitude,
        latitude,
        radius,
        colorShift,
        sizeVariance,
        glowStrength,
        twistFactor,
        depthBias
    };
}


// Projects spherical coordinates onto a flat 2D canvas plane.
// Uses orthographic projection — preserves the circular mandala appearance
// without the distortion that perspective projection would introduce.
// This function mirrors the inline projection in mandala.js projectPoint().
function sphericalToCartesian(lon, lat, radius, centerX, centerY, scale) {
    const phi   = (90 - lat)  * (Math.PI / 180); // polar angle from north pole
    const theta = (lon + 180) * (Math.PI / 180); // azimuthal angle

    const x = centerX + (radius * Math.sin(phi) * Math.cos(theta) * scale);
    const y = centerY + (radius * Math.sin(phi) * Math.sin(theta) * scale);

    return { x, y };
}
