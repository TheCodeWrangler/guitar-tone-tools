(function () {
  "use strict";

  var ctx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var muted = false;
  var musicStarted = false;

  var PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.25;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(masterGain);
    } catch (e) {
      ctx = null;
    }
  }

  function ensureResumed() {
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
  }

  // --- Ambient underwater drone ---
  var droneOsc1 = null;
  var droneOsc2 = null;
  var droneFilter = null;
  var lfo = null;

  function startDrone() {
    if (!ctx || droneOsc1) return;

    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 400;
    droneFilter.Q.value = 2;
    droneFilter.connect(musicGain);

    droneOsc1 = ctx.createOscillator();
    droneOsc1.type = "sine";
    droneOsc1.frequency.value = 65.41; // C2
    var g1 = ctx.createGain();
    g1.gain.value = 0.3;
    droneOsc1.connect(g1);
    g1.connect(droneFilter);
    droneOsc1.start();

    droneOsc2 = ctx.createOscillator();
    droneOsc2.type = "triangle";
    droneOsc2.frequency.value = 98.00; // G2
    var g2 = ctx.createGain();
    g2.gain.value = 0.15;
    droneOsc2.connect(g2);
    g2.connect(droneFilter);
    droneOsc2.start();

    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.15;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);
    lfo.start();
  }

  // --- Melody arpeggios ---
  var melodyInterval = null;

  function playNote(freq, duration, delay, gain) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    var env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain || 0.12, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;

    osc.connect(env);
    env.connect(filter);
    filter.connect(musicGain);

    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function startMelody() {
    if (melodyInterval) return;
    var noteIdx = 0;
    var patterns = [
      [0, 2, 4, 7],
      [1, 3, 5, 7],
      [0, 4, 5, 3],
      [2, 5, 7, 4],
      [0, 3, 5, 2],
    ];
    var patIdx = 0;

    melodyInterval = setInterval(function () {
      if (muted || !ctx) return;
      var pat = patterns[patIdx];
      for (var i = 0; i < pat.length; i++) {
        playNote(PENTATONIC[pat[i]], 1.8, i * 0.6, 0.08);
      }
      patIdx = (patIdx + 1) % patterns.length;
    }, 3200);
  }

  // --- Bubble ambience ---
  var bubbleInterval = null;

  function playBubble() {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var freq = 800 + Math.random() * 2000;
    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.15);

    var env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.03, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(env);
    env.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function startBubbles() {
    if (bubbleInterval) return;
    bubbleInterval = setInterval(function () {
      if (Math.random() < 0.4) playBubble();
    }, 600);
  }

  // --- Sound effects ---

  function playSFX(type) {
    if (!ctx || muted) return;
    ensureResumed();
    var t = ctx.currentTime;

    if (type === "collect") {
      [523.25, 659.25, 783.99].forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.08);
        g.gain.linearRampToValueAtTime(0.2, t + i * 0.08 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
        o.connect(g);
        g.connect(sfxGain);
        o.start(t + i * 0.08);
        o.stop(t + i * 0.08 + 0.3);
      });
    }

    if (type === "save") {
      [392, 523.25, 659.25, 783.99, 1046.50].forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.07);
        g.gain.linearRampToValueAtTime(0.15, t + i * 0.07 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.4);
        o.connect(g);
        g.connect(sfxGain);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 0.45);
      });
    }

    if (type === "zap") {
      var noise = ctx.createOscillator();
      noise.type = "sawtooth";
      noise.frequency.setValueAtTime(300, t);
      noise.frequency.exponentialRampToValueAtTime(80, t + 0.3);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      var dist = ctx.createWaveShaperFunction ? null : null;
      noise.connect(g);
      g.connect(sfxGain);
      noise.start(t);
      noise.stop(t + 0.35);
    }

    if (type === "powerup") {
      [440, 554.37, 659.25, 880].forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.06);
        g.gain.linearRampToValueAtTime(0.18, t + i * 0.06 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.3);
        o.connect(g);
        g.connect(sfxGain);
        o.start(t + i * 0.06);
        o.stop(t + i * 0.06 + 0.35);
      });
    }

    if (type === "levelup") {
      var notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
      notes.forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.12);
        g.gain.linearRampToValueAtTime(0.15, t + i * 0.12 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
        o.connect(g);
        g.connect(sfxGain);
        o.start(t + i * 0.12);
        o.stop(t + i * 0.12 + 0.55);
      });
    }

    if (type === "turbo") {
      var sweep = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
      sweep.forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.04);
        g.gain.linearRampToValueAtTime(0.12, t + i * 0.04 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.2);
        o.connect(g);
        g.connect(sfxGain);
        o.start(t + i * 0.04);
        o.stop(t + i * 0.04 + 0.25);
      });
      var bass = ctx.createOscillator();
      bass.type = "sawtooth";
      bass.frequency.setValueAtTime(130.81, t);
      bass.frequency.linearRampToValueAtTime(523.25, t + 0.3);
      var bg = ctx.createGain();
      bg.gain.setValueAtTime(0.15, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      bass.connect(bg);
      bg.connect(sfxGain);
      bass.start(t);
      bass.stop(t + 0.45);
    }

    if (type === "gameover") {
      [392, 349.23, 293.66, 261.63].forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.2);
        g.gain.linearRampToValueAtTime(0.18, t + i * 0.2 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.6);
        o.connect(g);
        g.connect(sfxGain);
        o.start(t + i * 0.2);
        o.stop(t + i * 0.2 + 0.65);
      });
    }
  }

  // --- Public API ---

  function startMusic() {
    if (musicStarted) return;
    init();
    ensureResumed();
    if (!ctx) return;
    musicStarted = true;
    startDrone();
    startMelody();
    startBubbles();
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) {
      masterGain.gain.value = muted ? 0 : 0.5;
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  window.__oceanAudio = {
    init: init,
    startMusic: startMusic,
    playSFX: playSFX,
    toggleMute: toggleMute,
    isMuted: isMuted,
  };
})();
