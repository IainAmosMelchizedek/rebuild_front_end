// =============================================================
// intention-analyzer.js — Intention Keeper (Front End, Stubbed)
// =============================================================
// PURPOSE:
// Local keyword-based consciousness scoring system.
// Analyzes the user's intention text and classifies it as:
//   - conscious    → positive, passes directly to mandala generation
//   - neutral      → ambiguous, offers reframe but allows original
//   - unconscious  → harmful, reframe required, original blocked
//
// STUB NOTE:
// This entire file is a placeholder for a backend AI API call.
// The final implementation will send the intention text to a
// DeepSeek analysis endpoint and receive a structured JSON response
// with the same severity/feedback/reframe shape this file produces.
// The DOM and app.js do not need to change when that swap happens —
// only the analyzeIntention() function in app.js will be updated
// to call the API instead of IntentionAnalyzer.analyze().
//
// FRAMEWORK:
// Scoring is inspired by the Dhammapada — conscious attention focuses
// on states that lead to progress, peace, and benefit for others.
// Unconscious patterns are self-centered, divisive, or cause suffering.
//
// HOW IT FITS:
// - Loaded before app.js in index.html
// - app.js calls IntentionAnalyzer.analyze(intention) on button click
// - app.js calls IntentionAnalyzer.reframe(intention) for harmful/neutral
// - Exposed globally via window.IntentionAnalyzer
// =============================================================

const IntentionAnalyzer = {

    // Keywords representing positive, mindful states that benefit others.
    // A match here increments the positive score.
    consciousPatterns: [
        'love', 'joy', 'peace', 'patience', 'forbearance', 'kindness', 'goodness',
        'faithfulness', 'gentleness', 'self-control', 'impartial', 'unconditional',
        'equality', 'humanity', 'forgiveness', 'healing', 'growth', 'connection',
        'courage', 'abundance', 'compassion', 'service', 'unity', 'wholeness',
        'everyone', 'all people', 'collective', 'community', 'selfless',
        'attention', 'mindful', 'dharma', 'positive', 'benefits others',
        'peace of mind', 'progress'
    ],

    // Keywords representing self-centered, divisive, or harmful states.
    // A match here increments the negative score.
    unconsciousPatterns: [
        'hate', 'hatred', 'anger', 'revenge', 'selfish', 'greed', 'jealousy',
        'envy', 'rage', 'discord', 'division', 'hierarchy', 'partiality',
        'idolatry', 'consumption', 'retaliation', 'ambition', 'drunkenness',
        'impurity', 'debauchery', 'money', 'wealth', 'power over', 'control others',
        'my family', 'my friends', 'my success', 'i want', 'give me', 'make me',
        'better than', 'deserve more', 'fuck', 'destroy', 'hurt', 'punish',
        'politics', 'political', 'politicking', 'politicians',
        'unruly mind', 'suffers', 'causes suffering', 'negative',
        'self-centered', 'malicious', 'stirs up', 'draw downward'
    ],

    // Keywords signaling ego-transcendence — given a 3x score boost.
    // A transcendent intention can override an otherwise negative score,
    // because paradoxical or impersonal language may appear "selfish"
    // on the surface while arising from a non-dual state.
    transcendentIndicators: [
        'transcend', 'transcendent', 'beyond ego', 'non-dual', 'nondual', 'detached',
        'ego death', 'awakened', 'enlightened', 'unity consciousness', 'no self',
        'emptiness', 'void', 'absolute', 'nothingness', 'all is one', 'impersonal',
        'beyond good and evil', 'paradoxical', 'from source', 'divine will',
        'for the whole', 'serves all without attachment'
    ],

    /**
     * Scores the intention and returns structured analysis.
     * Uses word-boundary regex so partial matches don't trigger false positives.
     * Applies two heuristics on top of keyword matching:
     *   1. Excessive "my" usage without positive context adds negative score
     *   2. "I want" without "will" or positive context adds negative score
     *
     * @param {string} intention - Raw intention text from the textarea
     * @returns {Object} { score, positiveCount, negativeCount, transcendentCount,
     *                     isConscious, feedback, severity,
     *                     positiveMatches, negativeMatches, transcendentMatches }
     */
    analyze(intention) {
        const text = intention.toLowerCase().trim();

        // Empty input — return neutral shell so app.js has a safe object to read
        if (!text) {
            return {
                score: 0,
                positiveCount: 0,
                negativeCount: 0,
                transcendentCount: 0,
                isConscious: false,
                feedback: 'No intention provided.',
                severity: 'neutral'
            };
        }

        // Count conscious pattern matches — word boundary prevents partial hits
        const positiveMatches = this.consciousPatterns.filter(keyword =>
            new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)
        );
        let positiveScore = positiveMatches.length;

        // Count unconscious pattern matches
        const negativeMatches = this.unconsciousPatterns.filter(keyword =>
            new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)
        );
        let negativeScore = negativeMatches.length;

        // Count transcendent matches — each worth 3 points to allow override
        const transcendentMatches = this.transcendentIndicators.filter(keyword =>
            new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)
        );
        const transcendentScore = transcendentMatches.length * 3;
        const hasTranscendent = transcendentScore > 0;

        // Heuristic 1: More than 2 "my" references without positive grounding
        // signals a self-focused intention even without explicit negative keywords
        const myCount = (text.match(/\bmy\b/gi) || []).length;
        if (myCount > 2 && positiveScore < 2) {
            negativeScore += 2;
        }

        // Heuristic 2: "I want" without future-tense "will" or positive context
        // suggests ego-driven desire rather than conscious intention
        if (text.includes('i want') && !text.includes('will') && positiveScore < 1) {
            negativeScore += 1;
        }

        const totalScore  = positiveScore + transcendentScore - negativeScore;
        const isConscious = totalScore >= 0;

        let feedback = '';
        let severity  = 'neutral';

        if (negativeScore > (positiveScore + transcendentScore) && negativeScore >= 3 && !hasTranscendent) {
            // UNCONSCIOUS — firm confrontation, reframe required
            severity = 'unconscious';
            feedback = `⚠️ THIS INTENTION REVEALS UNCONSCIOUS PATTERNS ⚠️

Your words show signs of: ${negativeMatches.slice(0, 3).join(', ')}.

This perpetuates harm—to others, to society, and ultimately to yourself. Words are spells that ripple through generations. Selfishness, partiality, and division are acts of the flesh that break humanity into hierarchies.

It's time to confront this: Shift from "my circle first" to impartial love for ALL. Move from consumption to contribution. From ego to equality.

Humanity—especially younger generations—needs conscious intentions now more than ever.

Your intention has been REFRAMED to align with conscious patterns. Meditate on this transformed version instead.`;

        } else if (positiveScore >= 2 || hasTranscendent) {
            // CONSCIOUS — affirm, or flag as potentially transcendent
            severity = 'conscious';
            if (hasTranscendent) {
                feedback = `🌌 POSSIBLE TRANSCENDENT INTENTION DETECTED 🌌

Your words include: ${transcendentMatches.slice(0, 3).join(', ')}.

If this arises from a state beyond ego/duality, it carries profound power—even if it appears paradoxical or "selfish" on the surface. Reflect: Does this serve impartial wholeness without attachment?

If so, beautiful—let it unfold as is. If not, consider reframing for clarity.`;
            } else {
                feedback = `✨ THIS INTENTION ALIGNS WITH CONSCIOUS PATTERNS ✨

Beautiful. Your words carry: ${positiveMatches.slice(0, 3).join(', ')}.

This is conscious intention—rooted in impartiality, love, and service to humanity. Keep cultivating this awareness. Your words ripple outward as positive transformation.

Meditate on this intention. Let it embed deeply in your subconscious.`;
            }

        } else {
            // NEUTRAL — gentle guidance, reframe offered but not forced
            severity = 'neutral';
            feedback = `🔵 NEUTRAL INTENTION DETECTED 🔵

Your intention is neither clearly conscious nor unconscious. To amplify its power and align with conscious patterns, consider infusing it with:
- Impartial love (beyond "my" circle)
- Service to all humanity (not just personal gain)
- Peace, kindness, or equality

Note: If this intention arises from a transcendent state (beyond personal gain or duality), it may hold deeper wisdom despite surface appearances.

Transform "I want X" into "It is my will to embody X for the good of all."`;
        }

        return {
            score:              totalScore,
            positiveCount:      positiveScore,
            negativeCount:      negativeScore,
            transcendentCount:  transcendentMatches.length,
            isConscious:        isConscious,
            feedback:           feedback,
            severity:           severity,
            positiveMatches:    positiveMatches,
            negativeMatches:    negativeMatches,
            transcendentMatches: transcendentMatches
        };
    },

    /**
     * Rewrites a harmful or neutral intention into a conscious form.
     * Replaces negative keywords with positive equivalents, then wraps
     * the result in an empowering frame if it doesn't already have one.
     * Always appends "FOR THE GOOD OF ALL HUMANITY" if no collective
     * language is present.
     *
     * @param {string} intention - The original intention text
     * @returns {string} The reframed intention in uppercase
     */
    reframe(intention) {
        let reframed = intention;

        // Direct keyword substitutions — negative → positive equivalent
        const replacements = {
            'hate':      'love',
            'hatred':    'compassion',
            'anger':     'peace',
            'revenge':   'forgiveness',
            'selfish':   'selfless service',
            'jealousy':  'celebration of others',
            'envy':      'gratitude',
            'rage':      'calm strength',
            'discord':   'harmony',
            'division':  'unity',
            'destroy':   'heal',
            'hurt':      'help',
            'punish':    'guide',
            'my family': 'all families',
            'my friends': 'all beings',
            'i want':    'it is my will to embody',
            'give me':   'i offer to all',
            'make me':   'i become for the good of humanity'
        };

        for (const [negative, positive] of Object.entries(replacements)) {
            const regex = new RegExp(`\\b${negative.replace(/\s+/g, '\\s+')}\\b`, 'gi');
            reframed = reframed.replace(regex, positive);
        }

        // Wrap in empowering frame if the result doesn't already start with one
        if (!reframed.match(/^(it is my will|i am|i embody)/i)) {
            reframed = `IT IS MY WILL TO EMBODY IMPARTIAL LOVE AND ${reframed.toUpperCase()}`;
        }

        // Append collective dedication if no such language is present
        if (!reframed.match(/(for all|humanity|everyone|collective)/i)) {
            reframed += ' FOR THE GOOD OF ALL HUMANITY';
        }

        return reframed.trim();
    }
};

// Expose globally so app.js can call IntentionAnalyzer.analyze()
// and IntentionAnalyzer.reframe() without module imports
window.IntentionAnalyzer = IntentionAnalyzer;
