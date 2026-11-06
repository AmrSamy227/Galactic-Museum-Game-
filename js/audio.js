// ============================================================
// AFTERLIGHT — Audio System
// Procedural audio via Web Audio API — no external files
// ============================================================

(function () {
    'use strict';

    // ---------------------------------------------------------
    // Internal state
    // ---------------------------------------------------------
    var ctx = null;                // AudioContext
    var masterGain = null;         // Master volume node
    var masterVolume = 0.5;
    var muted = false;
    var contextReady = false;

    // Continuous sound nodes
    var motorOsc = null;
    var motorGain = null;
    var motorRunning = false;

    var windSource = null;
    var windGain = null;
    var windRunning = false;

    // Rumble nodes (continuous, volume-modulated)
    var rumbleSource = null;
    var rumbleGain = null;
    var rumbleFilter = null;

    // ---------------------------------------------------------
    // Utility: create white noise buffer
    // ---------------------------------------------------------
    function createNoiseBuffer(duration, type) {
        if (!ctx) return null;
        var sampleRate = ctx.sampleRate;
        var length = Math.floor(sampleRate * duration);
        var buffer = ctx.createBuffer(1, length, sampleRate);
        var data = buffer.getChannelData(0);

        if (type === 'brown') {
            // Brown noise: integrated white noise
            var lastOut = 0;
            for (var i = 0; i < length; i++) {
                var white = Math.random() * 2 - 1;
                lastOut = (lastOut + (0.02 * white)) / 1.02;
                data[i] = lastOut * 3.5;
            }
        } else {
            // White noise
            for (var j = 0; j < length; j++) {
                data[j] = Math.random() * 2 - 1;
            }
        }
        return buffer;
    }

    // ---------------------------------------------------------
    // Utility: safely disconnect a node
    // ---------------------------------------------------------
    function safeDisconnect(node) {
        try {
            if (node) node.disconnect();
        } catch (e) { /* ignore */ }
    }

    // ---------------------------------------------------------
    // Utility: play a simple tone
    // ---------------------------------------------------------
    function playTone(freq, duration, startTime, type, gainVal, destination) {
        if (!ctx || !contextReady) return null;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gainVal || 0.15, startTime);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(g);
        g.connect(destination || masterGain);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
        return osc;
    }

    // ---------------------------------------------------------
    // Public API
    // ---------------------------------------------------------
    window.AudioSystem = {

        /**
         * Create the AudioContext. Must be called on or after a user gesture.
         */
        init: function () {
            if (ctx) return;
            try {
                var AC = window.AudioContext || window.webkitAudioContext;
                ctx = new AC();
                masterGain = ctx.createGain();
                masterGain.gain.value = muted ? 0 : masterVolume;
                masterGain.connect(ctx.destination);
                contextReady = true;

                // If suspended, try to resume
                if (ctx.state === 'suspended') {
                    ctx.resume();
                }
            } catch (e) {
                console.warn('[AudioSystem] Web Audio API not available:', e);
                contextReady = false;
            }
        },

        /**
         * Resume AudioContext if it's suspended (browser autoplay policy).
         */
        ensureContext: function () {
            if (!ctx) {
                this.init();
            }
            if (ctx && ctx.state === 'suspended') {
                ctx.resume();
            }
        },

        /**
         * Set master volume (0–1).
         */
        setMasterVolume: function (v) {
            masterVolume = Math.max(0, Math.min(1, v));
            if (masterGain && !muted) {
                masterGain.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
            }
        },

        /**
         * Get the current master volume.
         */
        getMasterVolume: function () {
            return masterVolume;
        },

        /**
         * Mute or unmute all audio.
         */
        setMuted: function (val) {
            muted = !!val;
            if (masterGain) {
                masterGain.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.05);
            }
        },

        /**
         * Returns true if audio is muted.
         */
        isMuted: function () {
            return muted;
        },

        // =====================================================
        // Continuous sounds
        // =====================================================

        /**
         * Start the rover motor hum (low-frequency drone).
         */
        startMotor: function () {
            if (!ctx || !contextReady || motorRunning) return;
            this.ensureContext();

            // Primary motor oscillator (low drone)
            motorOsc = ctx.createOscillator();
            motorOsc.type = 'triangle';
            motorOsc.frequency.value = 45;

            motorGain = ctx.createGain();
            motorGain.gain.value = 0;

            // Light low-pass to soften
            var lpf = ctx.createBiquadFilter();
            lpf.type = 'lowpass';
            lpf.frequency.value = 120;
            lpf.Q.value = 1;

            motorOsc.connect(lpf);
            lpf.connect(motorGain);
            motorGain.connect(masterGain);
            motorOsc.start();

            // Wheel rumble — filtered noise
            var noiseBuffer = createNoiseBuffer(2, 'white');
            if (noiseBuffer) {
                rumbleSource = ctx.createBufferSource();
                rumbleSource.buffer = noiseBuffer;
                rumbleSource.loop = true;

                rumbleFilter = ctx.createBiquadFilter();
                rumbleFilter.type = 'bandpass';
                rumbleFilter.frequency.value = 180;
                rumbleFilter.Q.value = 0.8;

                rumbleGain = ctx.createGain();
                rumbleGain.gain.value = 0;

                rumbleSource.connect(rumbleFilter);
                rumbleFilter.connect(rumbleGain);
                rumbleGain.connect(masterGain);
                rumbleSource.start();
            }

            motorRunning = true;
        },

        /**
         * Stop the motor sound.
         */
        stopMotor: function () {
            if (!motorRunning) return;
            try {
                if (motorOsc) { motorOsc.stop(); safeDisconnect(motorOsc); motorOsc = null; }
                if (motorGain) { safeDisconnect(motorGain); motorGain = null; }
                if (rumbleSource) { rumbleSource.stop(); safeDisconnect(rumbleSource); rumbleSource = null; }
                if (rumbleGain) { safeDisconnect(rumbleGain); rumbleGain = null; }
                if (rumbleFilter) { safeDisconnect(rumbleFilter); rumbleFilter = null; }
            } catch (e) { /* ignore */ }
            motorRunning = false;
        },

        /**
         * Update motor pitch & volume based on rover speed.
         * @param {number} speed  Current speed
         * @param {number} maxSpeed  Maximum rover speed
         */
        updateMotor: function (speed, maxSpeed) {
            if (!motorRunning || !ctx) return;
            var ratio = Math.min(Math.abs(speed) / (maxSpeed || 1), 1);

            // Motor volume: subtle hum even at low speed
            if (motorGain) {
                var vol = 0.02 + ratio * 0.08; // 0.02–0.10 range (quiet)
                motorGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
            }

            // Pitch variation with speed
            if (motorOsc) {
                var freq = 40 + ratio * 40; // 40–80 Hz
                motorOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1);
            }

            // Wheel rumble volume
            if (rumbleGain) {
                var rv = ratio * 0.04; // very subtle
                rumbleGain.gain.setTargetAtTime(rv, ctx.currentTime, 0.1);
            }
        },

        /**
         * Start ambient wind sound (filtered brown noise with slow LFO).
         */
        startWind: function () {
            if (!ctx || !contextReady || windRunning) return;
            this.ensureContext();

            var buffer = createNoiseBuffer(4, 'brown');
            if (!buffer) return;

            windSource = ctx.createBufferSource();
            windSource.buffer = buffer;
            windSource.loop = true;

            // Bandpass filter for wind-like quality
            var filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 250;
            filter.Q.value = 0.5;

            // Slow LFO for volume modulation
            var lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.15; // very slow
            var lfoGain = ctx.createGain();
            lfoGain.gain.value = 0.008; // modulation depth

            windGain = ctx.createGain();
            windGain.gain.value = 0.025; // very quiet

            // Connect LFO to wind gain
            lfo.connect(lfoGain);
            lfoGain.connect(windGain.gain);

            windSource.connect(filter);
            filter.connect(windGain);
            windGain.connect(masterGain);

            windSource.start();
            lfo.start();

            // Store LFO references for cleanup
            windSource._lfo = lfo;
            windSource._lfoGain = lfoGain;
            windSource._filter = filter;

            windRunning = true;
        },

        /**
         * Stop wind ambient sound.
         */
        stopWind: function () {
            if (!windRunning) return;
            try {
                if (windSource) {
                    windSource.stop();
                    if (windSource._lfo) windSource._lfo.stop();
                    safeDisconnect(windSource);
                    safeDisconnect(windSource._lfo);
                    safeDisconnect(windSource._lfoGain);
                    safeDisconnect(windSource._filter);
                    windSource = null;
                }
                if (windGain) { safeDisconnect(windGain); windGain = null; }
            } catch (e) { /* ignore */ }
            windRunning = false;
        },

        // =====================================================
        // One-shot sounds
        // =====================================================

        /**
         * Play a collision / impact sound.
         * @param {number} intensity  0–1 (how hard the hit)
         */
        playCollision: function (intensity) {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;
            var vol = 0.1 + Math.min(intensity, 1) * 0.2;

            // Low thud
            playTone(60, 0.15, t, 'sine', vol, masterGain);

            // Noise burst
            var buf = createNoiseBuffer(0.12, 'white');
            if (buf) {
                var src = ctx.createBufferSource();
                src.buffer = buf;
                var g = ctx.createGain();
                g.gain.setValueAtTime(vol * 0.5, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                var lpf = ctx.createBiquadFilter();
                lpf.type = 'lowpass';
                lpf.frequency.value = 400;
                src.connect(lpf);
                lpf.connect(g);
                g.connect(masterGain);
                src.start(t);
                src.stop(t + 0.15);
            }
        },

        /**
         * Play the checkpoint reached chime (rising two-tone).
         */
        playCheckpoint: function () {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;
            playTone(440, 0.2, t, 'sine', 0.12, masterGain);
            playTone(660, 0.3, t + 0.15, 'sine', 0.12, masterGain);
        },

        /**
         * Play the objective complete chime (C5 E5 G5 ascending).
         */
        playObjectiveComplete: function () {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;
            // C5=523.25, E5=659.25, G5=783.99
            playTone(523.25, 0.18, t, 'sine', 0.1, masterGain);
            playTone(659.25, 0.18, t + 0.12, 'sine', 0.1, masterGain);
            playTone(783.99, 0.35, t + 0.24, 'sine', 0.12, masterGain);
        },

        /**
         * Play the mission complete fanfare (ascending arpeggio).
         */
        playMissionComplete: function () {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;

            // C4, E4, G4, C5, E5, G5, C6
            var notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
            var spacing = 0.12;
            for (var i = 0; i < notes.length; i++) {
                var dur = (i === notes.length - 1) ? 0.6 : 0.2;
                var vol = 0.08 + (i / notes.length) * 0.08;
                playTone(notes[i], dur, t + i * spacing, 'sine', vol, masterGain);
            }

            // Sustained chord at the end
            var chordTime = t + notes.length * spacing + 0.1;
            playTone(523.25, 0.8, chordTime, 'sine', 0.07, masterGain);
            playTone(659.25, 0.8, chordTime, 'sine', 0.06, masterGain);
            playTone(783.99, 0.8, chordTime, 'sine', 0.07, masterGain);
        },

        /**
         * Play sci-fi scanner / interaction sound (filter sweep).
         */
        playScanSound: function () {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;

            // High sine with frequency sweep
            var osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
            osc.frequency.exponentialRampToValueAtTime(800, t + 0.7);
            osc.frequency.exponentialRampToValueAtTime(1800, t + 1.0);

            var g = ctx.createGain();
            g.gain.setValueAtTime(0.08, t);
            g.gain.setValueAtTime(0.08, t + 0.8);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

            osc.connect(g);
            g.connect(masterGain);
            osc.start(t);
            osc.stop(t + 1.05);

            // Subtle secondary oscillator for texture
            var osc2 = ctx.createOscillator();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(60, t);
            var g2 = ctx.createGain();
            g2.gain.setValueAtTime(0.02, t);
            g2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
            osc2.connect(g2);
            g2.connect(masterGain);
            osc2.start(t);
            osc2.stop(t + 1.05);
        },

        /**
         * Play a short UI click sound.
         */
        playUIClick: function () {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;

            var osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 1800;

            var g = ctx.createGain();
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

            osc.connect(g);
            g.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.06);
        },

        /**
         * Play a warning beep (two short beeps).
         */
        playWarning: function () {
            if (!ctx || !contextReady) return;
            this.ensureContext();
            var t = ctx.currentTime;
            playTone(800, 0.1, t, 'square', 0.08, masterGain);
            playTone(800, 0.1, t + 0.15, 'square', 0.08, masterGain);
        },

        // =====================================================
        // Frame update for continuous sounds
        // =====================================================

        /**
         * Call each frame to keep continuous sounds in sync with rover.
         * @param {number} roverSpeed  Current rover speed
         * @param {number} maxSpeed    Maximum rover speed
         */
        update: function (roverSpeed, maxSpeed) {
            if (!ctx || !contextReady) return;
            if (motorRunning) {
                this.updateMotor(roverSpeed, maxSpeed);
            }
        },

        /**
         * Stop all sounds.
         */
        stopAll: function () {
            this.stopMotor();
            this.stopWind();
        },

        /**
         * Resume after pause (re-enable context if needed).
         */
        resume: function () {
            if (ctx && ctx.state === 'suspended') {
                ctx.resume();
            }
        }
    };

})();
