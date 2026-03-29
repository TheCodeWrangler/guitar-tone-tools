/**
 * Microphone recording with auto-trigger (noise gate).
 *
 * Flow:
 *  1. openMic()       → requests mic, starts AnalyserNode for level monitoring
 *  2. Calibration phase (~0.5 s) measures ambient noise floor
 *  3. Adaptive onset threshold is set relative to the noise floor so that
 *     quieter microphones (e.g. mobile phones) can still trigger recording
 *  4. Level callback fires continuously with current RMS (0–1)
 *  5. When RMS exceeds onset threshold → MediaRecorder starts capturing
 *  6. When RMS stays below silence threshold for silenceDuration → auto-stops
 *  7. finishRecording() decodes the captured audio and returns { audioBuffer, blob }
 *  8. closeMic()      → tears everything down
 */

let stream = null;
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let mediaRecorder = null;
let audioChunks = [];
let monitorRaf = null;

let state = 'idle'; // idle | listening | calibrating | recording | done

// Adaptive thresholds — computed after calibration
let onsetThreshold   = 0.008; // RMS level to start capture (lowered from 0.04)
let silenceThreshold = 0.003; // RMS level considered silence

// Calibration state
const CALIBRATION_FRAMES = 30;  // ~0.5 s at 60 fps
let calibrationSamples = [];

// Fixed parameters
const SILENCE_DURATION  = 1.5;   // seconds of silence before auto-stop
const MIN_DURATION      = 0.5;   // minimum capture length (seconds)
const MAX_DURATION      = 10;    // safety cap (seconds)

// Absolute floor — prevents triggering on electrical noise alone
const MIN_ONSET   = 0.006;
const MIN_SILENCE = 0.002;

let silenceStart = 0;
let recordStart  = 0;
let onLevel = null;     // callback: (rms, state, { threshold }) => void
let onAutoStop = null;  // callback: () => void — called when auto-stop triggers

export function getState() { return state; }
export function getOnsetThreshold() { return onsetThreshold; }

/**
 * Open the microphone and begin monitoring levels.
 * @param {Object} opts
 * @param {function} opts.onLevel  — called each frame with (rms, state)
 * @param {function} opts.onAutoStop — called when recording auto-stops
 */
export async function openMic(opts = {}) {
  onLevel = opts.onLevel || null;
  onAutoStop = opts.onAutoStop || null;

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  audioCtx = new AudioContext({ sampleRate: 44100 });

  // Mobile browsers start AudioContext in 'suspended' state due to autoplay
  // policy — must explicitly resume even after a user gesture.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  sourceNode = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect(analyser);

  mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMime() });
  audioChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  state = 'calibrating';
  calibrationSamples = [];
  silenceStart = 0;
  recordStart = 0;
  monitorLoop();
}

function finishCalibration() {
  if (calibrationSamples.length === 0) {
    onsetThreshold = MIN_ONSET;
    silenceThreshold = MIN_SILENCE;
  } else {
    const sorted = calibrationSamples.slice().sort((a, b) => a - b);
    // Use the 90th percentile of ambient noise as the noise floor
    const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
    // Onset = 4× the noise floor (ensures a clear signal-to-noise gap)
    onsetThreshold   = Math.max(MIN_ONSET, p90 * 4);
    silenceThreshold = Math.max(MIN_SILENCE, p90 * 1.5);
  }
  state = 'listening';
}

function monitorLoop() {
  if (state === 'idle' || state === 'done') return;

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);

  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);

  if (state === 'calibrating') {
    calibrationSamples.push(rms);
    if (onLevel) onLevel(rms, 'listening', { threshold: onsetThreshold });
    if (calibrationSamples.length >= CALIBRATION_FRAMES) {
      finishCalibration();
    }
    monitorRaf = requestAnimationFrame(monitorLoop);
    return;
  }

  if (onLevel) onLevel(rms, state, { threshold: onsetThreshold });

  if (state === 'listening') {
    if (rms >= onsetThreshold) {
      state = 'recording';
      recordStart = performance.now();
      silenceStart = 0;
      mediaRecorder.start();
    }
  } else if (state === 'recording') {
    const elapsed = (performance.now() - recordStart) / 1000;

    if (elapsed >= MAX_DURATION) {
      autoStop();
      return;
    }

    if (rms < silenceThreshold) {
      if (silenceStart === 0) {
        silenceStart = performance.now();
      } else {
        const silenceElapsed = (performance.now() - silenceStart) / 1000;
        if (silenceElapsed >= SILENCE_DURATION && elapsed >= MIN_DURATION) {
          autoStop();
          return;
        }
      }
    } else {
      silenceStart = 0;
    }
  }

  monitorRaf = requestAnimationFrame(monitorLoop);
}

function autoStop() {
  state = 'done';
  if (onAutoStop) onAutoStop();
}

/**
 * Manually force-stop the recording (if user clicks stop).
 */
export function manualStop() {
  state = 'done';
}

/**
 * Finalize: stop MediaRecorder, decode audio, return result.
 * Call after state becomes 'done'.
 */
export function finishRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      reject(new Error('No recording in progress.'));
      return;
    }
    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        const arrayBuf = await blob.arrayBuffer();
        const decodeCtx = new AudioContext({ sampleRate: 44100 });
        if (decodeCtx.state === 'suspended') await decodeCtx.resume();
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf);
        resolve({ audioBuffer, blob });
      } catch (e) {
        reject(e);
      }
    };
    mediaRecorder.stop();
  });
}

/**
 * Close the mic and clean up all resources.
 */
export function closeMic() {
  state = 'idle';
  if (monitorRaf) cancelAnimationFrame(monitorRaf);
  monitorRaf = null;
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (sourceNode) { try { sourceNode.disconnect(); } catch {} }
  if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch {} }
  stream = null;
  audioCtx = null;
  analyser = null;
  sourceNode = null;
  mediaRecorder = null;
  audioChunks = [];
  calibrationSamples = [];
  onLevel = null;
  onAutoStop = null;
}

/**
 * Legacy helpers for backward compat with loadAudioFile.
 */
export async function loadAudioFile(file) {
  const arrayBuf = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 44100 });
  if (ctx.state === 'suspended') await ctx.resume();
  const audioBuffer = await ctx.decodeAudioData(arrayBuf);
  return { audioBuffer, blob: file };
}

function getSupportedMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
