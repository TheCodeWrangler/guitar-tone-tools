/**
 * Main application controller — wires the UI to the recorder, analysis, and scoring engines.
 * All guitar data is persisted in IndexedDB (with automatic migration from localStorage).
 */
import { openMic, closeMic, finishRecording, manualStop, getState, getOnsetThreshold, loadAudioFile } from './recorder.js';
import { analyzeAudio } from './analysis.js';
import {
  computeScores, hzToNote, CHORD_PRESETS, SCORE_LABELS, SCORE_DESCRIPTIONS, scoreGrade,
} from './scoring.js';
import {
  drawWaveform, drawFFT, drawBinPowers, drawDamping,
  drawFFTOverlay, drawBinPowerCompare, drawMirrorFFT,
  drawSpectrogram,
  drawDecayRateCompare,
  mountHarmonicDecayChart, mountHarmonicDecayCompareChart,
} from './charts.js';
import { PROFILE_STEPS, STRING_CATEGORIES, CHORD_DIAGRAMS, STRING_DIAGRAMS, CHORD_NOTES, computeProfile } from './profile.js';
import {
  initStorage,
  loadAllProfiles, saveProfile, saveAllProfiles, deleteProfile as idbDeleteProfile,
  loadAllGuitars, saveGuitar, saveAllGuitars, deleteGuitar as idbDeleteGuitar,
  estimateStorageUsage,
} from './storage.js';

// ── Helpers: reference frequency lines for FFT ────────────────────────

function buildRefFreqs(chordOrNote) {
  if (!chordOrNote) return null;

  const chordKey = chordOrNote.replace('Open ', '');
  if (CHORD_NOTES[chordKey]) return CHORD_NOTES[chordKey];

  const noteMatch = chordOrNote.match(/^Note\s+([A-G]#?\d)$/);
  if (noteMatch) {
    const preset = CHORD_PRESETS[chordOrNote];
    if (preset) {
      const f = preset.hz;
      const refs = [{ hz: f, name: noteMatch[1] }];
      for (let h = 2; h <= 6; h++) {
        const hf = f * h;
        if (hf > 5000) break;
        const n = hzToNote(hf);
        refs.push({ hz: hf, name: `${n.name} (${h}×)` });
      }
      return refs;
    }
  }

  return null;
}

function buildRefFreqsForStep(step) {
  if (!step) return null;
  if (step.type === 'chord' && CHORD_NOTES[step.id]) return CHORD_NOTES[step.id];
  if (step.type === 'string') {
    const f = step.hz;
    const refs = [{ hz: f, name: step.id }];
    for (let h = 2; h <= 6; h++) {
      const hf = f * h;
      if (hf > 5000) break;
      const n = hzToNote(hf);
      refs.push({ hz: hf, name: `${n.name} (${h}×)` });
    }
    return refs;
  }
  return null;
}

// ── State ──────────────────────────────────────────────────────────────

let guitars = [];
let profiles = [];
let currentAnalysis = null;
let currentBlob = null;
let _readyResolve;
const storageReady = new Promise(r => { _readyResolve = r; });

async function persistGuitar(g) {
  const serialisable = {
    id: g.id,
    name: g.name,
    chord: g.chord || '',
    analysis: serialiseAnalysis(g.analysis),
  };
  await saveGuitar(serialisable);
}

async function persistAllGuitars() {
  const serialisable = guitars.map(g => ({
    id: g.id,
    name: g.name,
    chord: g.chord || '',
    analysis: serialiseAnalysis(g.analysis),
  }));
  await saveAllGuitars(serialisable);
}

async function persistProfile(entry) {
  const serialisable = {
    id: entry.id,
    name: entry.name,
    timestamp: entry.timestamp,
    profile: serialiseProfile(entry.profile),
  };
  await saveProfile(serialisable);
}

async function persistAllProfiles() {
  const serialisable = profiles.map(p => ({
    id: p.id,
    name: p.name,
    timestamp: p.timestamp,
    profile: serialiseProfile(p.profile),
  }));
  await saveAllProfiles(serialisable);
}

function serialiseProfileCompact(prof) {
  return {
    overall: prof.overall,
    stringScores: prof.stringScores,
    chordScores: prof.chordScores,
    categoryScores: prof.categoryScores,
    strengths: prof.strengths,
    weaknesses: prof.weaknesses,
    stepResults: prof.stepResults.map(r => ({
      stepId: r.stepId,
      analysis: serialiseAnalysisCompact(r.analysis),
    })),
  };
}

function downsampleFFT(freqs, mags, maxFreq, maxBins) {
  if (!freqs || !mags) return { frequencies: [], magnitudes: [] };
  let cutoff = freqs.length;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] > maxFreq) { cutoff = i; break; }
  }
  if (cutoff <= maxBins) {
    return {
      frequencies: Array.from(freqs.slice(0, cutoff)),
      magnitudes: Array.from(mags.slice(0, cutoff)),
    };
  }
  const step = cutoff / maxBins;
  const outF = new Array(maxBins);
  const outM = new Array(maxBins);
  for (let i = 0; i < maxBins; i++) {
    const idx = Math.min(Math.round(i * step), cutoff - 1);
    outF[i] = freqs[idx];
    outM[i] = mags[idx];
  }
  return { frequencies: outF, magnitudes: outM };
}

function serialiseHarmonicDecay(hd, maxPoints) {
  if (!hd) return null;
  const step = maxPoints ? Math.max(1, Math.ceil(hd.times.length / maxPoints)) : 1;
  const times = [];
  for (let i = 0; i < hd.times.length; i += step) times.push(hd.times[i]);
  return {
    times,
    harmonics: hd.harmonics.map(h => ({
      harmonic: h.harmonic,
      hz: h.hz,
      decayRate: h.decayRate,
      amplitudes: times.map((_, ti) => h.amplitudes[ti * step] ?? 0),
    })),
  };
}

function serialiseSTFT(stft, maxFrames, maxBins) {
  if (!stft) return null;
  const { times, frequencies, numBins, data } = stft;
  const frameStep = Math.max(1, Math.ceil(times.length / maxFrames));
  const binStep = Math.max(1, Math.ceil(numBins / maxBins));
  const outTimes = [];
  for (let t = 0; t < times.length; t += frameStep) outTimes.push(times[t]);
  const outFreqs = [];
  for (let b = 0; b < numBins; b += binStep) outFreqs.push(frequencies[b]);
  const actualBins = outFreqs.length;
  const outData = [];
  for (let t = 0; t < times.length; t += frameStep) {
    for (let b = 0; b < numBins; b += binStep) {
      outData.push(data[t * numBins + b]);
    }
  }
  return { times: outTimes, frequencies: outFreqs, numBins: actualBins, data: outData };
}

function serialiseAnalysisCompact(a) {
  if (!a) return a;
  const fft = downsampleFFT(a.fft?.frequencies, a.fft?.magnitudes, 6000, 512);
  return {
    name: a.name,
    duration: a.duration,
    fundamental: a.fundamental,
    dampingFactor: a.dampingFactor,
    detectedNote: a.detectedNote,
    scores: a.scores,
    binPowers: a.binPowers,
    fft,
    waveform: { samples: Array.from((a.waveform?.samples || []).slice(0, 2000)), sr: a.waveform?.sr || 44100 },
    damping: {
      envelope: Array.from((a.damping?.envelope || []).slice(0, 100)),
      times: Array.from((a.damping?.times || []).slice(0, 100)),
    },
    stft: serialiseSTFT(a.stft, 40, 192),
    harmonicDecay: serialiseHarmonicDecay(a.harmonicDecay, 40),
    spectrogramFeatures: a.spectrogramFeatures || null,
  };
}

function serialiseAnalysis(a) {
  if (!a || !a.fft) return a;
  const fft = downsampleFFT(a.fft.frequencies, a.fft.magnitudes, 6000, 2048);
  return {
    ...a,
    fft,
    waveform: {
      samples: Array.from(a.waveform.samples.slice(0, 10000)),
      sr: a.waveform.sr,
    },
    damping: {
      envelope: Array.from(a.damping.envelope),
      times: Array.from(a.damping.times),
    },
    stft: serialiseSTFT(a.stft, 80, 384),
    harmonicDecay: serialiseHarmonicDecay(a.harmonicDecay),
    spectrogramFeatures: a.spectrogramFeatures || null,
  };
}

function serialiseProfile(prof) {
  return {
    ...prof,
    stepResults: prof.stepResults.map(r => ({
      stepId: r.stepId,
      analysis: serialiseAnalysis(r.analysis),
    })),
  };
}

function hydrateAnalysis(a) {
  if (!a || !a.fft) return a;
  a.fft.frequencies = new Float32Array(a.fft.frequencies);
  a.fft.magnitudes = new Float32Array(a.fft.magnitudes);
  a.waveform.samples = new Float32Array(a.waveform.samples);
  if (!a.scores) a.scores = computeScores(a);
  if (!a.detectedNote) a.detectedNote = hzToNote(a.fundamental);
  return a;
}

function hydrateGuitarList(raw) {
  return raw.map(g => {
    if (g.analysis && g.analysis.fft) {
      g.analysis = hydrateAnalysis(g.analysis);
      if (!g.chord) g.chord = '';
    }
    return g;
  });
}

function hydrateProfileList(raw) {
  return raw.map(p => {
    if (p.profile && p.profile.stepResults) {
      p.profile.stepResults = p.profile.stepResults.map(r => ({
        stepId: r.stepId,
        analysis: hydrateAnalysis(r.analysis),
      }));
    }
    return p;
  });
}

// ── DOM references ─────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${btn.dataset.page}`).classList.add('active');
    if (btn.dataset.page === 'compare') renderCompare();
    if (btn.dataset.page === 'library') renderLibrary();
  });
});

// ── Record & Analyze ───────────────────────────────────────────────────

const btnRecord     = $('#btn-record');
const btnUpload     = $('#btn-upload');
const fileInput     = $('#file-input');
const btnAnalyze    = $('#btn-analyze');
const inputName     = $('#guitar-name');
const chordSelect   = $('#chord-select');
const audioPlayer   = $('#audio-player');
const recStatus     = $('#rec-status');
const noteDetection = $('#note-detection');
const analysisOut   = $('#analysis-output');

function showDetectedNote(analysis) {
  const note = analysis.detectedNote;
  const chord = chordSelect.value;
  const preset = CHORD_PRESETS[chord];

  noteDetection.classList.remove('hidden');
  let html = `<span class="note-badge">Detected: <strong>${note.name}</strong> (${analysis.fundamental} Hz`;
  if (note.cents !== 0) html += `, ${note.cents > 0 ? '+' : ''}${note.cents} cents`;
  html += `)</span>`;

  if (preset) {
    const expectedNote = hzToNote(preset.hz);
    if (note.note === expectedNote.note && Math.abs(note.octave - expectedNote.octave) <= 1) {
      html += `<span class="note-match good">Matches ${chord} root (${preset.root})</span>`;
    } else {
      html += `<span class="note-match warn">Expected ${preset.root} for ${chord} — detected ${note.name}. Re-record or change selection.</span>`;
    }
  }
  noteDetection.innerHTML = html;
}

const levelMeter     = $('#level-meter');
const levelFill      = levelMeter.querySelector('.level-meter-fill');
const levelLabel     = levelMeter.querySelector('.level-meter-label');

async function processRecording() {
  btnRecord.textContent = 'Record';
  btnRecord.classList.remove('recording');
  levelMeter.classList.add('hidden');
  recStatus.textContent = 'Processing audio...';
  try {
    const { audioBuffer, blob } = await finishRecording();
    closeMic();
    currentBlob = blob;
    audioPlayer.src = URL.createObjectURL(blob);
    audioPlayer.classList.remove('hidden');
    await new Promise(r => setTimeout(r, 50));
    recStatus.textContent = 'Analyzing tone...';
    await new Promise(r => setTimeout(r, 50));
    currentAnalysis = analyzeAudio(audioBuffer);
    currentAnalysis.detectedNote = hzToNote(currentAnalysis.fundamental);
    currentAnalysis.scores = computeScores(currentAnalysis);
    showDetectedNote(currentAnalysis);
    btnAnalyze.classList.remove('hidden');
    recStatus.textContent = `Recorded ${currentAnalysis.duration}s — select what you played, name your guitar, and click Save & Score.`;
    setTimeout(() => recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  } catch (err) {
    closeMic();
    recStatus.textContent = `Error processing recording: ${err.message}`;
    console.error(err);
    recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

btnRecord.addEventListener('click', async () => {
  const recState = getState();
  if (recState === 'listening' || recState === 'recording' || recState === 'calibrating') {
    manualStop();
    await processRecording();
  } else {
    try {
      audioPlayer.classList.add('hidden');
      btnAnalyze.classList.add('hidden');
      noteDetection.classList.add('hidden');
      analysisOut.innerHTML = '';
      levelMeter.classList.remove('hidden');

      await openMic({
        onLevel(rms, st, meta) {
          const threshold = meta?.threshold ?? 0.04;
          const meterMax = Math.max(threshold * 4, 0.03);
          const pct = Math.min(rms / meterMax, 1) * 100;
          levelFill.style.width = `${pct}%`;
          levelFill.className = 'level-meter-fill' + (st === 'recording' ? ' active' : '');
          const threshPct = Math.min(threshold / meterMax, 1) * 100;
          levelMeter.style.setProperty('--threshold-pct', `${threshPct}%`);
          levelLabel.textContent = st === 'listening' ? 'Waiting for sound…' : 'Recording…';
        },
        async onAutoStop() {
          await processRecording();
        },
      });

      btnRecord.textContent = 'Stop';
      btnRecord.classList.add('recording');
      recStatus.textContent = 'Listening — pluck the string or strum the chord…';
    } catch (err) {
      recStatus.textContent = 'Microphone access denied. Please allow mic access and try again.';
      levelMeter.classList.add('hidden');
    }
  }
});

btnUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    recStatus.textContent = 'Loading file...';
    const { audioBuffer, blob } = await loadAudioFile(file);
    currentBlob = blob;
    audioPlayer.src = URL.createObjectURL(blob);
    audioPlayer.classList.remove('hidden');
    recStatus.textContent = 'Analyzing tone...';
    await new Promise(r => setTimeout(r, 50));
    currentAnalysis = analyzeAudio(audioBuffer);
    currentAnalysis.detectedNote = hzToNote(currentAnalysis.fundamental);
    currentAnalysis.scores = computeScores(currentAnalysis);
    showDetectedNote(currentAnalysis);
    btnAnalyze.classList.remove('hidden');
    recStatus.textContent = `Loaded "${file.name}" (${currentAnalysis.duration}s) — select what you played, name your guitar, and click Save & Score.`;
    if (!inputName.value) inputName.value = file.name.replace(/\.\w+$/, '');
  } catch (err) {
    recStatus.textContent = `Error loading file: ${err.message}`;
    console.error(err);
  }
});

btnAnalyze.addEventListener('click', () => {
  try {
    const name = inputName.value.trim();
    if (!name) {
      recStatus.textContent = 'Please enter a guitar name.';
      recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!chordSelect.value) {
      recStatus.textContent = 'Please select what you played (chord or note).';
      recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!currentAnalysis) {
      recStatus.textContent = 'No audio to analyze. Please record or upload first.';
      recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    currentAnalysis.name = name;
    const chord = chordSelect.value;

    const id = Date.now().toString(36);
    const entry = { id, name, chord, analysis: currentAnalysis };
    guitars.push(entry);
    persistGuitar(entry).catch(e => console.warn('IndexedDB save failed:', e));

    renderSingleAnalysis(currentAnalysis);
    recStatus.textContent = `"${name}" (${chord}) saved with a score of ${currentAnalysis.scores.overall}/100! Compare it on the Compare page.`;
    setTimeout(() => analysisOut.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } catch (err) {
    recStatus.textContent = `Error saving: ${err.message}`;
    console.error(err);
    recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// ── Score rendering ────────────────────────────────────────────────────

function renderScoreGauge(score, label, description) {
  const color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--danger)';
  const pct = score;
  return `
    <div class="score-gauge" title="${description || ''}">
      <div class="score-gauge-bar">
        <div class="score-gauge-fill" style="width:${pct}%; background:${color}"></div>
      </div>
      <div class="score-gauge-info">
        <span class="score-gauge-label">${label}</span>
        <span class="score-gauge-value" style="color:${color}">${score}</span>
      </div>
    </div>`;
}

function renderScoreCard(scores) {
  const grade = scoreGrade(scores.overall);
  const overallColor = scores.overall >= 75 ? 'var(--green)' : scores.overall >= 50 ? 'var(--amber)' : 'var(--danger)';

  let html = `<div class="score-card">`;
  html += `<div class="score-overall">
    <div class="score-overall-number" style="color:${overallColor}">${scores.overall}</div>
    <div class="score-overall-label">${grade}</div>
  </div>`;
  html += `<div class="score-details">`;
  for (const [key, label] of Object.entries(SCORE_LABELS)) {
    if (key === 'overall') continue;
    html += renderScoreGauge(scores[key], label, SCORE_DESCRIPTIONS[key]);
  }
  html += `</div></div>`;
  return html;
}

function renderSingleAnalysis(a) {
  analysisOut.innerHTML = '';

  if (a.scores) {
    const scoreSection = document.createElement('div');
    scoreSection.innerHTML = `<h2 class="section-title">Tone Quality Score</h2>` + renderScoreCard(a.scores);
    analysisOut.appendChild(scoreSection);
  }

  if (a.detectedNote) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'metrics-grid';
    noteDiv.innerHTML = `
      <div class="metric"><span class="metric-value">${a.detectedNote.name}</span><span class="metric-label">Detected Note</span></div>
      <div class="metric"><span class="metric-value">${a.fundamental} Hz</span><span class="metric-label">Fundamental</span></div>
      <div class="metric"><span class="metric-value">${a.duration} s</span><span class="metric-label">Duration</span></div>
      <div class="metric"><span class="metric-value">${a.dampingFactor ?? '—'}</span><span class="metric-label">Damping Factor</span></div>
    `;
    analysisOut.appendChild(noteDiv);
  }

  const binRow = document.createElement('div');
  binRow.className = 'metrics-grid bins';
  for (const [b, v] of Object.entries(a.binPowers)) {
    binRow.innerHTML += `<div class="metric"><span class="metric-value">${v}%</span><span class="metric-label">${b}</span></div>`;
  }
  analysisOut.appendChild(binRow);

  const refFreqs = buildRefFreqs(chordSelect.value);
  const charts = [
    (c) => drawWaveform(c, a.waveform.samples, a.waveform.sr, `${a.name} — Waveform`),
    (c) => drawFFT(c, a.fft.frequencies, a.fft.magnitudes, `${a.name} — Frequency Spectrum`, '#7c3aed', refFreqs),
    (c) => drawBinPowers(c, a.binPowers, `${a.name} — Bin Power`),
    (c) => drawDamping(c, a.damping.envelope, a.damping.times, `${a.name} — Amplitude Decay`),
  ];
  for (const draw of charts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    analysisOut.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
  }
  if (a.stft) {
    const sc = document.createElement('canvas');
    sc.className = 'chart-canvas-tall';
    analysisOut.appendChild(sc);
    requestAnimationFrame(() => drawSpectrogram(sc, a.stft, `${a.name} — Spectrogram`, refFreqs));
  }
  if (a.harmonicDecay) {
    mountHarmonicDecayChart(analysisOut, a.harmonicDecay, `${a.name} — Harmonic Decay`);
  }
}

// ── Profile Wizard ─────────────────────────────────────────────────────

const profileNameInput = $('#profile-guitar-name');
const btnStartProfile  = $('#btn-start-profile');
const wizardContent    = $('#wizard-content');
const profileReport    = $('#profile-report');

let profileStepResults = [];
let profileCurrentStep = 0;
let profileRecordingBlob = null;

btnStartProfile.addEventListener('click', () => {
  const name = profileNameInput.value.trim();
  if (!name) {
    profileNameInput.focus();
    profileNameInput.classList.add('shake');
    setTimeout(() => profileNameInput.classList.remove('shake'), 500);
    return;
  }
  profileStepResults = [];
  profileCurrentStep = 0;
  profileRecordingBlob = null;
  profileReport.classList.add('hidden');
  profileReport.innerHTML = '';
  wizardContent.classList.remove('hidden');
  btnStartProfile.disabled = true;
  profileNameInput.disabled = true;
  renderWizardStep();
});

function drawChordDiagram(canvas, diagram) {
  const dpr = window.devicePixelRatio || 1;
  const W = 180, H = 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const { frets, fingers, startFret } = diagram;
  const numStrings = 6;
  const numFrets = 4;
  const left = 30, top = 30, right = W - 15, bottom = H - 20;
  const stringSpacing = (right - left) / (numStrings - 1);
  const fretSpacing = (bottom - top) / numFrets;

  // Nut (thick bar at top if starting at fret 1)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = startFret === 1 ? 4 : 1.5;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.stroke();

  // Fret lines
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#64748b';
  for (let f = 1; f <= numFrets; f++) {
    const y = top + f * fretSpacing;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // String lines
  for (let s = 0; s < numStrings; s++) {
    const x = left + s * stringSpacing;
    ctx.strokeStyle = s < 3 ? '#94a3b8' : '#cbd5e1';
    ctx.lineWidth = s < 3 ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  // Markers: X, O, or finger dots
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dotR = stringSpacing * 0.32;
  for (let s = 0; s < numStrings; s++) {
    const x = left + s * stringSpacing;
    const fret = frets[s];
    const finger = fingers[s];

    if (fret === -1) {
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('✕', x, top - 14);
    } else if (fret === 0) {
      ctx.beginPath();
      ctx.arc(x, top - 14, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      const y = top + (fret - 0.5) * fretSpacing;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
      if (finger) {
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(finger, x, y);
      }
    }
  }

  // String labels at bottom
  const labels = ['E', 'A', 'D', 'G', 'B', 'e'];
  ctx.font = '500 10px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  for (let s = 0; s < numStrings; s++) {
    ctx.fillText(labels[s], left + s * stringSpacing, bottom + 12);
  }
}

function drawStringDiagram(canvas, stringIndex, vibration) {
  const dpr = window.devicePixelRatio || 1;
  const W = 180, H = 80;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const left = 15, right = W - 15, cy = H / 2;
  const spacing = (right - left) / 5;
  const labels = ['E', 'A', 'D', 'G', 'B', 'e'];
  const thicknesses = [3.5, 3, 2.5, 2, 1.5, 1.2];
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';

  for (let s = 0; s < 6; s++) {
    const isTarget = s === stringIndex;
    const y = cy - 25 + s * 10;

    if (isTarget && vibration && vibration.amplitude > 0.05) {
      const amp = vibration.amplitude;
      const waveFreq = 2.5 + (5 - s) * 0.4;
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = thicknesses[s];
      ctx.beginPath();
      for (let px = left - 5; px <= right + 5; px++) {
        const t = (px - (left - 5)) / (right - left + 10);
        const envelope = Math.sin(t * Math.PI);
        const wave = Math.sin(t * waveFreq * Math.PI * 2 + vibration.phase);
        const dy = amp * envelope * wave;
        if (px === left - 5) ctx.moveTo(px, y + dy);
        else ctx.lineTo(px, y + dy);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = isTarget ? '#7c3aed' : (dark ? '#475569' : '#9ca3af');
      ctx.lineWidth = thicknesses[s];
      ctx.beginPath();
      ctx.moveTo(left - 5, y);
      ctx.lineTo(right + 5, y);
      ctx.stroke();
    }

    if (isTarget) {
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath();
      ctx.arc(right + 14, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 11px Inter, sans-serif';
      ctx.fillStyle = dark ? '#e2e8f0' : '#2e3039';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('← play this one', right + 22, y);
    }
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = '500 10px Inter, sans-serif';
  for (let s = 0; s < 6; s++) {
    ctx.fillStyle = s === stringIndex ? '#c4b5fd' : (dark ? '#64748b' : '#9ca3af');
    ctx.fillText(labels[s], left - 10, cy - 25 + s * 10);
  }
}

function createStringVibrator(canvas, stringIndex) {
  let animId = null;
  let targetAmp = 0;
  let currentAmp = 0;
  let phase = 0;
  let running = false;

  function loop() {
    currentAmp += (targetAmp - currentAmp) * 0.18;
    phase += 0.35;
    drawStringDiagram(canvas, stringIndex, { amplitude: currentAmp, phase });
    if (currentAmp > 0.05 || targetAmp > 0) {
      animId = requestAnimationFrame(loop);
    } else {
      currentAmp = 0;
      drawStringDiagram(canvas, stringIndex);
      animId = null;
      running = false;
    }
  }

  return {
    update(rms) {
      targetAmp = Math.min(rms * 120, 4);
      if (!running) { running = true; animId = requestAnimationFrame(loop); }
    },
    stop() { targetAmp = 0; },
    destroy() { if (animId) cancelAnimationFrame(animId); animId = null; running = false; },
  };
}

function renderWizardStep(autoRecord = false) {
  const step = PROFILE_STEPS[profileCurrentStep];
  const total = PROFILE_STEPS.length;
  const pct = ((profileCurrentStep) / total) * 100;

  wizardContent.innerHTML = `
    <div class="wizard-progress">
      <div class="wizard-progress-bar">
        <div class="wizard-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="wizard-progress-text">Step ${profileCurrentStep + 1} of ${total}</div>
    </div>
    <div class="wizard-step">
      <h3 class="wizard-step-label">${step.label}</h3>
      <p class="wizard-step-instruction">${step.instruction}</p>
      <div class="wizard-diagram"><canvas id="wiz-diagram"></canvas></div>
      <div class="wizard-step-controls">
        <button id="wiz-record" class="btn primary">Record</button>
        <button id="wiz-rerecord" class="btn hidden">Re-record</button>
      </div>
      <div id="wiz-level" class="level-meter hidden"><div class="level-meter-fill"></div><span class="level-meter-label"></span></div>
      <div id="wiz-status" class="wizard-status"></div>
      <div id="wiz-note" class="hidden"></div>
      <audio id="wiz-audio" controls class="hidden"></audio>
      <div class="wizard-nav">
        <button id="wiz-next" class="btn primary" disabled>
          ${profileCurrentStep < total - 1 ? 'Next Step →' : 'Finish & Generate Report'}
        </button>
      </div>
    </div>
  `;

  const wizRecord   = $('#wiz-record');
  const wizRerecord = $('#wiz-rerecord');
  const wizStatus   = $('#wiz-status');
  const wizNote     = $('#wiz-note');
  const wizAudio    = $('#wiz-audio');
  const wizNext     = $('#wiz-next');

  const wizLevel    = $('#wiz-level');
  const wizLevelFill  = wizLevel.querySelector('.level-meter-fill');
  const wizLevelLabel = wizLevel.querySelector('.level-meter-label');
  let stepAnalysis = null;

  // Draw the fingering diagram
  const diagCanvas = $('#wiz-diagram');
  let stringVibrator = null;
  if (step.type === 'chord' && CHORD_DIAGRAMS[step.id]) {
    drawChordDiagram(diagCanvas, CHORD_DIAGRAMS[step.id]);
  } else if (step.type === 'string' && STRING_DIAGRAMS[step.id]) {
    const sIdx = STRING_DIAGRAMS[step.id].stringIndex;
    drawStringDiagram(diagCanvas, sIdx);
    stringVibrator = createStringVibrator(diagCanvas, sIdx);
  }

  async function wizProcessRecording() {
    if (stringVibrator) stringVibrator.stop();
    wizRecord.textContent = 'Record';
    wizRecord.classList.remove('recording');
    wizLevel.classList.add('hidden');
    wizStatus.textContent = 'Processing audio...';
    try {
      const { audioBuffer, blob } = await finishRecording();
      closeMic();
      profileRecordingBlob = blob;
      wizAudio.src = URL.createObjectURL(blob);
      wizAudio.classList.remove('hidden');
      await new Promise(r => setTimeout(r, 50));
      wizStatus.textContent = 'Analyzing tone...';
      await new Promise(r => setTimeout(r, 50));
      stepAnalysis = analyzeAudio(audioBuffer);
      stepAnalysis.detectedNote = hzToNote(stepAnalysis.fundamental);
      stepAnalysis.scores = computeScores(stepAnalysis);
      stepAnalysis.name = `${profileNameInput.value.trim()} — ${step.label}`;

      renderWizardNoteDetection(stepAnalysis, step, wizNote);
      wizRerecord.classList.remove('hidden');
      wizNext.disabled = false;
      wizStatus.textContent = `Recorded ${stepAnalysis.duration}s — review and continue.`;
    } catch (err) {
      closeMic();
      wizStatus.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  }

  async function doRecord() {
    const recState = getState();
    if (recState === 'listening' || recState === 'recording' || recState === 'calibrating') {
      manualStop();
      await wizProcessRecording();
    } else {
      try {
        wizAudio.classList.add('hidden');
        wizNote.classList.add('hidden');
        wizNext.disabled = true;
        wizRerecord.classList.add('hidden');
        wizLevel.classList.remove('hidden');

        await openMic({
          onLevel(rms, st, meta) {
            const threshold = meta?.threshold ?? 0.04;
            const meterMax = Math.max(threshold * 4, 0.03);
            const pct = Math.min(rms / meterMax, 1) * 100;
            wizLevelFill.style.width = `${pct}%`;
            wizLevelFill.className = 'level-meter-fill' + (st === 'recording' ? ' active' : '');
            const threshPct = Math.min(threshold / meterMax, 1) * 100;
            wizLevel.style.setProperty('--threshold-pct', `${threshPct}%`);
            wizLevelLabel.textContent = st === 'listening' ? 'Waiting for sound…' : 'Recording…';
            if (stringVibrator) {
              if (st === 'recording') stringVibrator.update(rms);
              else stringVibrator.stop();
            }
          },
          async onAutoStop() {
            await wizProcessRecording();
          },
        });

        wizRecord.textContent = 'Stop';
        wizRecord.classList.add('recording');
        wizStatus.textContent = 'Listening — play when ready…';
      } catch (err) {
        wizStatus.textContent = 'Microphone access denied. Please allow mic access.';
        wizLevel.classList.add('hidden');
      }
    }
  }

  wizRecord.addEventListener('click', doRecord);
  wizRerecord.addEventListener('click', () => {
    stepAnalysis = null;
    wizNext.disabled = true;
    wizNote.classList.add('hidden');
    wizAudio.classList.add('hidden');
    wizRerecord.classList.add('hidden');
    wizRecord.textContent = 'Record';
    wizStatus.textContent = '';
    doRecord();
  });

  wizNext.addEventListener('click', () => {
    if (!stepAnalysis) return;
    if (stringVibrator) { stringVibrator.destroy(); stringVibrator = null; }
    profileStepResults[profileCurrentStep] = {
      stepId: step.id,
      analysis: stepAnalysis,
    };
    profileCurrentStep++;
    if (profileCurrentStep < total) {
      renderWizardStep(true);
      setTimeout(() => wizardContent.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else {
      finishProfile();
    }
  });

  if (autoRecord) {
    setTimeout(() => doRecord(), 300);
  }
}

function hasEnergyAtFrequency(analysis, targetHz) {
  const freqs = analysis.fft.frequencies;
  const mags = analysis.fft.magnitudes;
  const tolerance = targetHz * 0.06;
  let targetEnergy = 0;
  let totalEnergy = 0;
  for (let i = 0; i < freqs.length; i++) {
    const m2 = mags[i] * mags[i];
    totalEnergy += m2;
    if (Math.abs(freqs[i] - targetHz) < tolerance) targetEnergy += m2;
  }
  return totalEnergy > 0 ? targetEnergy / totalEnergy : 0;
}

function renderWizardNoteDetection(analysis, step, container) {
  const note = analysis.detectedNote;
  const expectedNote = hzToNote(step.hz);
  const isChord = step.type === 'chord';

  container.classList.remove('hidden');
  let html = '';

  if (isChord) {
    // For chords, check if the root note has energy in the FFT rather than
    // relying on pitch detection (which is unreliable with multiple notes)
    const rootEnergy = hasEnergyAtFrequency(analysis, step.hz);
    if (rootEnergy > 0.005) {
      html += `<span class="note-match good">Root note ${expectedNote.name} detected in chord — sounds good!</span>`;
    } else {
      html += `<span class="note-match warn">Root note ${expectedNote.name} is weak — make sure you're fretting the chord correctly.</span>`;
    }
  } else {
    // Single string: pitch detection is reliable
    html += `<span class="note-badge">Detected: <strong>${note.name}</strong> (${analysis.fundamental} Hz`;
    if (note.cents !== 0) html += `, ${note.cents > 0 ? '+' : ''}${note.cents} cents`;
    html += `)</span>`;

    if (note.note === expectedNote.note && Math.abs(note.octave - expectedNote.octave) <= 1) {
      html += `<span class="note-match good">Matches expected ${expectedNote.name}</span>`;
    } else {
      html += `<span class="note-match warn">Expected ${expectedNote.name} — detected ${note.name}. Make sure the string is in tune.</span>`;
    }
  }
  container.innerHTML = html;
}

async function finishProfile() {
  await storageReady;
  try {
    const name = profileNameInput.value.trim();

    const compactResults = profileStepResults.filter(Boolean);
    if (compactResults.length === 0) {
      wizardContent.innerHTML = '<p class="compare-warn">No recordings found. Please try again.</p>';
      return;
    }

    const profile = computeProfile(compactResults);

    const entry = {
      id: Date.now().toString(36),
      name,
      timestamp: new Date().toISOString(),
      profile,
    };
    profiles.push(entry);

    let saveError = null;
    try {
      await persistProfile(entry);
    } catch (storageErr) {
      saveError = storageErr.message;
      console.warn('Could not save profile:', storageErr);
    }

    wizardContent.classList.add('hidden');
    wizardContent.innerHTML = '';
    profileReport.classList.remove('hidden');

    if (saveError) {
      profileReport.innerHTML = `<div class="save-status save-error">⚠ Profile generated but NOT saved: ${saveError}</div>`;
    } else {
      profileReport.innerHTML = `<div class="save-status save-ok">✓ Profile saved! View it anytime in the Library tab.</div>`;
    }

    const reportDiv = document.createElement('div');
    profileReport.appendChild(reportDiv);
    renderProfileReport(profile, name, reportDiv, entry.id);

    btnStartProfile.disabled = false;
    profileNameInput.disabled = false;
    btnStartProfile.textContent = 'Start New Profile';

    setTimeout(() => profileReport.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } catch (err) {
    console.error('Profile generation failed:', err);
    wizardContent.innerHTML = `<div class="compare-warn">Error generating report: ${err.message}. Check console for details.</div>`;
    btnStartProfile.disabled = false;
    profileNameInput.disabled = false;
  }
}

// ── Profile Report ─────────────────────────────────────────────────────

function renderProfileReport(profile, name, container, entryId) {
  const { overall, stringScores, chordScores, categoryScores, strengths, weaknesses, stepResults } = profile;
  const grade = scoreGrade(overall.overall);
  const overallColor = overall.overall >= 75 ? 'var(--green)' : overall.overall >= 50 ? 'var(--amber)' : 'var(--danger)';

  let html = `<h2 class="section-title">Profile Report — ${name}</h2>`;

  // Overall composite
  html += `<div class="score-card">
    <div class="score-overall">
      <div class="score-overall-number" style="color:${overallColor}">${overall.overall}</div>
      <div class="score-overall-label">${grade}</div>
    </div>
    <div class="score-details">`;
  for (const [key, label] of Object.entries(SCORE_LABELS)) {
    if (key === 'overall') continue;
    html += renderScoreGauge(overall[key], label, SCORE_DESCRIPTIONS[key]);
  }
  html += `</div></div>`;

  // Strengths & weaknesses
  if (strengths.length > 0 || weaknesses.length > 0) {
    html += `<div class="profile-callouts">`;
    if (strengths.length > 0) {
      html += `<div class="profile-callout strength">
        <h4>Strengths</h4>
        <ul>${strengths.map(s => `<li><strong>${SCORE_LABELS[s.dim]}</strong> — ${s.val}/100</li>`).join('')}</ul>
      </div>`;
    }
    if (weaknesses.length > 0) {
      html += `<div class="profile-callout weakness">
        <h4>Areas for Improvement</h4>
        <ul>${weaknesses.map(w => `<li><strong>${SCORE_LABELS[w.dim]}</strong> — ${w.val}/100</li>`).join('')}</ul>
      </div>`;
    }
    html += `</div>`;
  }

  // Category breakdown
  const catLabels = { bass: 'Bass Strings (E2, A2)', mid: 'Mid Strings (D3, G3)', treble: 'Treble Strings (B3, E4)' };
  html += `<h3 class="subsection-title">String Category Breakdown</h3>`;
  html += `<div class="profile-categories">`;
  for (const [cat, label] of Object.entries(catLabels)) {
    const scores = categoryScores[cat];
    if (!scores) continue;
    html += `<div class="profile-category-card">
      <h4>${label}</h4>`;
    html += renderScoreCard(scores);
    html += `</div>`;
  }
  html += `</div>`;

  // Chord performance
  if (chordScores) {
    html += `<h3 class="subsection-title">Chord Performance</h3>`;
    html += renderScoreCard(chordScores);
  }

  // Individual step results (expandable + re-record)
  html += `<h3 class="subsection-title">Individual Step Results</h3>`;
  html += `<p class="hint" style="padding:0 0 0.5rem;text-align:left;font-size:0.8rem">Tap a step to see details. Use Re-record to replace any step and regenerate the profile.</p>`;
  html += `<div class="profile-steps-list">`;
  stepResults.forEach((r, i) => {
    const step = PROFILE_STEPS.find(s => s.id === r.stepId);
    const a = r.analysis;
    const stepScore = a.scores ? a.scores.overall : '—';
    const stepGrade = a.scores ? scoreGrade(a.scores.overall) : '';
    const stepColor = (a.scores && a.scores.overall >= 75) ? 'var(--green)'
      : (a.scores && a.scores.overall >= 50) ? 'var(--amber)' : 'var(--danger)';
    html += `<div class="profile-step-item">
      <div class="profile-step-header" data-toggle="profile-step-detail-${i}">
        <span class="profile-step-num">${i + 1}</span>
        <span class="profile-step-name">${step ? step.label : r.stepId}</span>
        <span class="profile-step-score" style="color:${stepColor}">${stepScore}/100 ${stepGrade}</span>
        <button class="btn small rerecord-btn" data-step-idx="${i}" data-step-id="${r.stepId}">Re-record</button>
        <span class="profile-step-toggle">▸</span>
      </div>
      <div class="profile-step-detail hidden" id="profile-step-detail-${i}"></div>
      <div class="rerecord-panel hidden" id="rerecord-panel-${i}"></div>
    </div>`;
  });
  html += `</div>`;

  // Export buttons
  html += `<div class="export-buttons">
    <button class="btn primary" id="btn-share-profile">Send to a Friend</button>
    <button class="btn" id="btn-export-json">Export Data (.json)</button>
    <button class="btn" id="btn-export-html">Download Report (HTML)</button>
    <button class="btn" id="btn-export-text">Copy Summary to Clipboard</button>
  </div>`;

  container.innerHTML = html;

  // Wire export buttons
  const btnShare = container.querySelector('#btn-share-profile');
  const btnExportJson = container.querySelector('#btn-export-json');
  const btnExportHtml = container.querySelector('#btn-export-html');
  const btnExportText = container.querySelector('#btn-export-text');

  if (btnShare) {
    btnShare.addEventListener('click', () => {
      shareProfile(profile, name);
    });
  }
  if (btnExportJson) {
    btnExportJson.addEventListener('click', () => {
      downloadProfileJson(profile, name);
    });
  }
  if (btnExportHtml) {
    btnExportHtml.addEventListener('click', () => {
      downloadHtmlReport(profile, name);
    });
  }
  if (btnExportText) {
    btnExportText.addEventListener('click', () => {
      copyToClipboard(generateTextSummary(profile, name), btnExportText, 'Copy Summary to Clipboard');
    });
  }

  // Wire up expand/collapse and render charts lazily
  container.querySelectorAll('.profile-step-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.rerecord-btn')) return;
      const targetId = header.dataset.toggle;
      const detail = container.querySelector(`#${targetId}`);
      const toggle = header.querySelector('.profile-step-toggle');
      if (detail.classList.contains('hidden')) {
        detail.classList.remove('hidden');
        toggle.textContent = '▾';
        if (!detail.dataset.rendered) {
          const idx = parseInt(targetId.replace('profile-step-detail-', ''), 10);
          const r = stepResults[idx];
          const a = r.analysis;
          const step = PROFILE_STEPS.find(s => s.id === r.stepId);
          renderSingleAnalysisInto(a, detail, null, null, buildRefFreqsForStep(step));
          detail.dataset.rendered = 'true';
        }
      } else {
        detail.classList.add('hidden');
        toggle.textContent = '▸';
      }
    });
  });

  // Wire re-record buttons
  container.querySelectorAll('.rerecord-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.stepIdx, 10);
      const stepId = btn.dataset.stepId;
      const panel = container.querySelector(`#rerecord-panel-${idx}`);
      if (!panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        closeMic();
        return;
      }
      openRerecordPanel(panel, idx, stepId, profile, name, container, entryId);
    });
  });
}

function openRerecordPanel(panel, stepIdx, stepId, profile, name, reportContainer, entryId) {
  const step = PROFILE_STEPS.find(s => s.id === stepId);
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="rerecord-content">
      <p class="rerecord-instruction">${step ? step.instruction : 'Record this step again.'}</p>
      ${step && step.type === 'chord' && CHORD_DIAGRAMS[step.id] ? '<div class="wizard-diagram"><canvas class="rr-diagram"></canvas></div>' : ''}
      ${step && step.type === 'string' && STRING_DIAGRAMS[step.id] ? '<div class="wizard-diagram"><canvas class="rr-diagram"></canvas></div>' : ''}
      <div class="rerecord-controls">
        <button class="btn primary rr-record">Record</button>
        <button class="btn rr-cancel">Cancel</button>
      </div>
      <div class="level-meter hidden rr-level"><div class="level-meter-fill"></div><span class="level-meter-label"></span></div>
      <div class="rr-status"></div>
    </div>`;

  // Draw diagram if present
  const diagCanvas = panel.querySelector('.rr-diagram');
  if (diagCanvas && step) {
    if (step.type === 'chord' && CHORD_DIAGRAMS[step.id]) {
      drawChordDiagram(diagCanvas, CHORD_DIAGRAMS[step.id]);
    } else if (step.type === 'string' && STRING_DIAGRAMS[step.id]) {
      drawStringDiagram(diagCanvas, STRING_DIAGRAMS[step.id].stringIndex);
    }
  }

  const btnRec = panel.querySelector('.rr-record');
  const btnCancel = panel.querySelector('.rr-cancel');
  const rrLevel = panel.querySelector('.rr-level');
  const rrFill = rrLevel.querySelector('.level-meter-fill');
  const rrLabel = rrLevel.querySelector('.level-meter-label');
  const rrStatus = panel.querySelector('.rr-status');

  btnCancel.addEventListener('click', () => {
    closeMic();
    panel.classList.add('hidden');
    panel.innerHTML = '';
  });

  async function processRerecording() {
    btnRec.textContent = 'Record';
    btnRec.classList.remove('recording');
    rrLevel.classList.add('hidden');
    rrStatus.textContent = 'Processing…';
    try {
      const { audioBuffer } = await finishRecording();
      closeMic();
      rrStatus.textContent = 'Analyzing…';
      await new Promise(r => setTimeout(r, 50));
      const newAnalysis = analyzeAudio(audioBuffer);
      newAnalysis.detectedNote = hzToNote(newAnalysis.fundamental);
      newAnalysis.scores = computeScores(newAnalysis);
      newAnalysis.name = `${name} — ${step ? step.label : stepId}`;

      // Replace step in profile
      profile.stepResults[stepIdx] = { stepId, analysis: newAnalysis };

      // Recompute profile scores
      const recomputed = computeProfile(profile.stepResults);
      Object.assign(profile, recomputed);

      if (entryId) {
        const entry = profiles.find(p => p.id === entryId);
        if (entry) {
          entry.profile = profile;
          entry.timestamp = new Date().toISOString();
          persistProfile(entry).catch(e => console.warn('Save failed:', e));
        }
      }

      // Re-render the entire report
      renderProfileReport(profile, name, reportContainer, entryId);
      setTimeout(() => reportContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      closeMic();
      rrStatus.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  }

  btnRec.addEventListener('click', async () => {
    const recState = getState();
    if (recState === 'listening' || recState === 'recording' || recState === 'calibrating') {
      manualStop();
      await processRerecording();
    } else {
      try {
        rrLevel.classList.remove('hidden');
        await openMic({
          onLevel(rms, st, meta) {
            const threshold = meta?.threshold ?? 0.04;
            const meterMax = Math.max(threshold * 4, 0.03);
            const pct = Math.min(rms / meterMax, 1) * 100;
            rrFill.style.width = `${pct}%`;
            rrFill.className = 'level-meter-fill' + (st === 'recording' ? ' active' : '');
            const threshPct = Math.min(threshold / meterMax, 1) * 100;
            rrLevel.style.setProperty('--threshold-pct', `${threshPct}%`);
            rrLabel.textContent = st === 'listening' ? 'Waiting for sound…' : 'Recording…';
          },
          async onAutoStop() {
            await processRerecording();
          },
        });
        btnRec.textContent = 'Stop';
        btnRec.classList.add('recording');
        rrStatus.textContent = 'Listening — play when ready…';
      } catch (err) {
        rrStatus.textContent = 'Mic access denied.';
        rrLevel.classList.add('hidden');
      }
    }
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Clipboard helper ──────────────────────────────────────────────────

function copyToClipboard(text, btn, resetLabel) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = resetLabel; }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = resetLabel; }, 2000);
  });
}

// ── Profile JSON Export / Import ──────────────────────────────────────

function buildExportPayload(profile, name) {
  return {
    _format: 'guitar-tone-tools-profile',
    _version: 1,
    name,
    exportedAt: new Date().toISOString(),
    profile: serialiseProfile(profile),
  };
}

function downloadProfileJson(profile, name) {
  const payload = buildExportPayload(profile, name);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guitar-profile-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importProfileFromFile(file) {
  await storageReady;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (data._format !== 'guitar-tone-tools-profile' || !data.profile || !data.name) {
          reject(new Error('This file is not a valid Guitar Tone Tools profile.'));
          return;
        }
        const prof = data.profile;
        if (prof.stepResults) {
          prof.stepResults = prof.stepResults.map(r => ({
            stepId: r.stepId,
            analysis: hydrateAnalysis(r.analysis),
          }));
        }
        const entry = {
          id: Date.now().toString(36),
          name: data.name,
          timestamp: data.exportedAt || new Date().toISOString(),
          profile: prof,
        };
        profiles.push(entry);
        await persistProfile(entry).catch(e => console.warn('IndexedDB save failed:', e));
        resolve(entry);
      } catch (e) {
        reject(new Error('Could not read profile file: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

// ── Share (Web Share API + mailto fallback) ───────────────────────────

async function shareProfile(profile, name) {
  const textSummary = generateTextSummary(profile, name);
  const payload = buildExportPayload(profile, name);
  const jsonStr = JSON.stringify(payload, null, 2);
  const fileName = `guitar-profile-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  const jsonFile = new File([jsonStr], fileName, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [jsonFile] })) {
    try {
      await navigator.share({
        title: `Guitar Profile — ${name}`,
        text: textSummary,
        files: [jsonFile],
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  // Fallback: try share without file
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Guitar Profile — ${name}`,
        text: textSummary + `\n\n(Ask them to export the .json file from the app for a full import)`,
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  // Final fallback: mailto
  const subject = encodeURIComponent(`Guitar Profile — ${name}`);
  const body = encodeURIComponent(textSummary + '\n\n(The .json data file is attached — import it at https://thecodewrangler.github.io/guitar-tone-tools/)');
  downloadProfileJson(profile, name);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

// ── Report Export ──────────────────────────────────────────────────────

function generateTextSummary(profile, name) {
  const { overall, stringScores, chordScores, categoryScores, strengths, weaknesses, stepResults } = profile;
  const grade = scoreGrade(overall.overall);
  const dims = ['sustain', 'harmonics', 'harmonicSustain', 'balance', 'inharmonicity', 'clarity', 'dynamicRange', 'upperHarmonics', 'attackClarity', 'bodyResonance'];
  const catLabels = { bass: 'Bass (E2, A2)', mid: 'Mid (D3, G3)', treble: 'Treble (B3, E4)' };
  const date = new Date().toLocaleDateString();

  let t = '';
  t += `Guitar Tone Profile — ${name}\n`;
  t += `Generated ${date} by Guitar Tone Tools\n`;
  t += `${'═'.repeat(48)}\n\n`;
  t += `OVERALL: ${overall.overall}/100  (${grade})\n\n`;

  t += `Score Breakdown:\n`;
  for (const d of dims) t += `  ${(SCORE_LABELS[d] + ':').padEnd(22)} ${overall[d]}/100\n`;
  t += '\n';

  if (strengths.length) {
    t += `Strengths:\n`;
    for (const s of strengths) t += `  ✓ ${SCORE_LABELS[s.dim]} — ${s.val}/100\n`;
    t += '\n';
  }
  if (weaknesses.length) {
    t += `Areas for Improvement:\n`;
    for (const w of weaknesses) t += `  ✗ ${SCORE_LABELS[w.dim]} — ${w.val}/100\n`;
    t += '\n';
  }

  t += `String Categories:\n`;
  for (const [cat, label] of Object.entries(catLabels)) {
    const sc = categoryScores[cat];
    if (!sc) continue;
    t += `  ${label}: ${sc.overall}/100\n`;
  }
  t += '\n';

  if (chordScores) {
    t += `Chord Performance: ${chordScores.overall}/100\n\n`;
  }

  t += `Individual Steps:\n`;
  stepResults.forEach((r, i) => {
    const step = PROFILE_STEPS.find(s => s.id === r.stepId);
    const sc = r.analysis.scores ? r.analysis.scores.overall : '—';
    t += `  ${(i + 1 + '.').padEnd(4)} ${(step ? step.label : r.stepId).padEnd(26)} ${sc}/100\n`;
  });
  t += '\n';
  t += `${'─'.repeat(48)}\n`;
  t += `https://thecodewrangler.github.io/guitar-tone-tools/\n`;

  return t;
}

function downloadHtmlReport(profile, name) {
  const { overall, stringScores, chordScores, categoryScores, strengths, weaknesses, stepResults } = profile;
  const grade = scoreGrade(overall.overall);
  const dims = ['sustain', 'harmonics', 'harmonicSustain', 'balance', 'inharmonicity', 'clarity', 'dynamicRange', 'upperHarmonics', 'attackClarity', 'bodyResonance'];
  const catLabels = { bass: 'Bass Strings (E2, A2)', mid: 'Mid Strings (D3, G3)', treble: 'Treble Strings (B3, E4)' };
  const date = new Date().toLocaleDateString();
  const overallColor = overall.overall >= 75 ? '#22c55e' : overall.overall >= 50 ? '#eab308' : '#ef4444';

  let dimRows = '';
  for (const d of dims) {
    dimRows += `<tr><td>${SCORE_LABELS[d]}</td><td>${SCORE_DESCRIPTIONS[d]}</td><td style="font-weight:700;text-align:center">${overall[d]}</td></tr>`;
  }

  let strengthsHtml = '';
  if (strengths.length) {
    strengthsHtml = `<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:8px;margin:8px 0">
      <strong>Strengths</strong><ul style="margin:6px 0 0">${strengths.map(s => `<li>${SCORE_LABELS[s.dim]} — ${s.val}/100</li>`).join('')}</ul></div>`;
  }
  let weaknessHtml = '';
  if (weaknesses.length) {
    weaknessHtml = `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:8px;margin:8px 0">
      <strong>Areas for Improvement</strong><ul style="margin:6px 0 0">${weaknesses.map(w => `<li>${SCORE_LABELS[w.dim]} — ${w.val}/100</li>`).join('')}</ul></div>`;
  }

  let catHtml = '';
  for (const [cat, label] of Object.entries(catLabels)) {
    const sc = categoryScores[cat];
    if (!sc) continue;
    let catRows = '';
    for (const d of [...dims, 'overall']) {
      catRows += `<tr><td>${SCORE_LABELS[d] || 'Overall'}</td><td style="text-align:center;font-weight:700">${sc[d]}</td></tr>`;
    }
    catHtml += `<div style="flex:1;min-width:200px"><h4 style="margin:0 0 6px">${label}</h4>
      <table style="width:100%;border-collapse:collapse"><tbody>${catRows}</tbody></table></div>`;
  }

  let chordHtml = '';
  if (chordScores) {
    let chordRows = '';
    for (const d of [...dims, 'overall']) {
      chordRows += `<tr><td>${SCORE_LABELS[d] || 'Overall'}</td><td style="text-align:center;font-weight:700">${chordScores[d]}</td></tr>`;
    }
    chordHtml = `<h3>Chord Performance</h3><table style="width:100%;max-width:400px;border-collapse:collapse"><tbody>${chordRows}</tbody></table>`;
  }

  let stepsHtml = '';
  stepResults.forEach((r, i) => {
    const step = PROFILE_STEPS.find(s => s.id === r.stepId);
    const sc = r.analysis.scores ? r.analysis.scores.overall : '—';
    const gr = r.analysis.scores ? scoreGrade(r.analysis.scores.overall) : '';
    const c = (r.analysis.scores && r.analysis.scores.overall >= 75) ? '#22c55e'
      : (r.analysis.scores && r.analysis.scores.overall >= 50) ? '#eab308' : '#ef4444';
    stepsHtml += `<tr><td style="text-align:center">${i + 1}</td><td>${step ? step.label : r.stepId}</td><td style="color:${c};font-weight:700;text-align:center">${sc}/100</td><td style="text-align:center">${gr}</td></tr>`;
  });

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guitar Profile — ${name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;max-width:720px;margin:0 auto}
h1,h2,h3,h4{color:#f8fafc}
h1{font-size:1.6rem;margin-bottom:4px}
h2{font-size:1.2rem;margin:20px 0 8px}
h3{font-size:1rem;margin:20px 0 8px}
table{width:100%;border-collapse:collapse;margin:8px 0 16px}
td,th{padding:6px 10px;border-bottom:1px solid #334155;text-align:left;font-size:.9rem}
th{color:#94a3b8;font-weight:600}
.hero{text-align:center;padding:24px 0}
.hero-score{font-size:3.5rem;font-weight:800;line-height:1}
.hero-grade{font-size:1.1rem;color:#94a3b8;margin-top:4px}
.cats{display:flex;gap:16px;flex-wrap:wrap}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #334155;text-align:center;font-size:.8rem;color:#64748b}
.footer a{color:#60a5fa}
@media print{body{background:#fff;color:#1e293b}h1,h2,h3,h4{color:#0f172a}td,th{border-color:#cbd5e1}.hero-grade{color:#64748b}.footer{color:#94a3b8}}
</style></head><body>
<h1>🎸 Guitar Tone Profile</h1>
<p style="color:#94a3b8">${name} — ${date}</p>

<div class="hero">
  <div class="hero-score" style="color:${overallColor}">${overall.overall}</div>
  <div class="hero-grade">${grade}</div>
</div>

<h2>Score Breakdown</h2>
<table><thead><tr><th>Dimension</th><th>Description</th><th style="text-align:center">Score</th></tr></thead><tbody>${dimRows}</tbody></table>

${strengthsHtml}${weaknessHtml}

<h2>String Category Breakdown</h2>
<div class="cats">${catHtml}</div>

${chordHtml}

<h3>Individual Step Results</h3>
<table><thead><tr><th style="text-align:center">#</th><th>Step</th><th style="text-align:center">Score</th><th style="text-align:center">Grade</th></tr></thead><tbody>${stepsHtml}</tbody></table>

<div class="footer">Generated by <a href="https://thecodewrangler.github.io/guitar-tone-tools/">Guitar Tone Tools</a></div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guitar-profile-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Single Recording Export ────────────────────────────────────────────

function generateRecordingTextSummary(a, guitarName, chord) {
  const scores = a.scores;
  const grade = scoreGrade(scores.overall);
  const dims = ['sustain', 'harmonics', 'harmonicSustain', 'balance', 'inharmonicity', 'clarity', 'dynamicRange', 'upperHarmonics', 'attackClarity', 'bodyResonance'];
  const date = new Date().toLocaleDateString();
  const note = a.detectedNote ? a.detectedNote.name : '—';

  let t = '';
  t += `Guitar Tone Report — ${guitarName}\n`;
  t += `Generated ${date} by Guitar Tone Tools\n`;
  t += `${'═'.repeat(48)}\n\n`;
  t += `Played: ${chord || 'Unknown'}  |  Detected: ${note}  |  ${a.fundamental} Hz  |  ${a.duration}s\n\n`;
  t += `OVERALL: ${scores.overall}/100  (${grade})\n\n`;
  t += `Score Breakdown:\n`;
  for (const d of dims) t += `  ${(SCORE_LABELS[d] + ':').padEnd(22)} ${scores[d]}/100\n`;
  t += '\n';
  t += `Frequency Bands:\n`;
  if (a.binPowers) {
    for (const [band, pct] of Object.entries(a.binPowers)) {
      t += `  ${(band + ':').padEnd(14)} ${(pct * 100).toFixed(1)}%\n`;
    }
  }
  t += '\n';
  t += `${'─'.repeat(48)}\n`;
  t += `https://thecodewrangler.github.io/guitar-tone-tools/\n`;
  return t;
}

function downloadRecordingHtmlReport(a, guitarName, chord) {
  const scores = a.scores;
  const grade = scoreGrade(scores.overall);
  const dims = ['sustain', 'harmonics', 'harmonicSustain', 'balance', 'inharmonicity', 'clarity', 'dynamicRange', 'upperHarmonics', 'attackClarity', 'bodyResonance'];
  const date = new Date().toLocaleDateString();
  const note = a.detectedNote ? a.detectedNote.name : '—';
  const overallColor = scores.overall >= 75 ? '#22c55e' : scores.overall >= 50 ? '#eab308' : '#ef4444';

  let dimRows = '';
  for (const d of dims) {
    dimRows += `<tr><td>${SCORE_LABELS[d]}</td><td>${SCORE_DESCRIPTIONS[d]}</td><td style="font-weight:700;text-align:center">${scores[d]}</td></tr>`;
  }

  let binRows = '';
  if (a.binPowers) {
    for (const [band, pct] of Object.entries(a.binPowers)) {
      const w = Math.round(pct * 100);
      binRows += `<tr><td>${band}</td><td><div style="background:#334155;border-radius:4px;overflow:hidden"><div style="background:#60a5fa;height:18px;width:${w}%"></div></div></td><td style="text-align:right;font-weight:700">${(pct * 100).toFixed(1)}%</td></tr>`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guitar Report — ${guitarName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;max-width:720px;margin:0 auto}
h1,h2,h3{color:#f8fafc}
h1{font-size:1.6rem;margin-bottom:4px}
h2{font-size:1.2rem;margin:20px 0 8px}
h3{font-size:1rem;margin:16px 0 8px}
table{width:100%;border-collapse:collapse;margin:8px 0 16px}
td,th{padding:6px 10px;border-bottom:1px solid #334155;text-align:left;font-size:.9rem}
th{color:#94a3b8;font-weight:600}
.hero{text-align:center;padding:24px 0}
.hero-score{font-size:3.5rem;font-weight:800;line-height:1}
.hero-grade{font-size:1.1rem;color:#94a3b8;margin-top:4px}
.meta{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:12px 0;color:#94a3b8;font-size:.95rem}
.meta span{background:#1e293b;padding:4px 12px;border-radius:6px}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #334155;text-align:center;font-size:.8rem;color:#64748b}
.footer a{color:#60a5fa}
@media print{body{background:#fff;color:#1e293b}h1,h2,h3{color:#0f172a}td,th{border-color:#cbd5e1}.meta span{background:#f1f5f9}.hero-grade{color:#64748b}.footer{color:#94a3b8}}
</style></head><body>
<h1>🎸 Guitar Tone Report</h1>
<p style="color:#94a3b8">${guitarName} — ${date}</p>

<div class="meta">
  <span>Played: <strong>${chord || 'Unknown'}</strong></span>
  <span>Detected: <strong>${note}</strong></span>
  <span>${a.fundamental} Hz</span>
  <span>${a.duration}s</span>
</div>

<div class="hero">
  <div class="hero-score" style="color:${overallColor}">${scores.overall}</div>
  <div class="hero-grade">${grade}</div>
</div>

<h2>Score Breakdown</h2>
<table><thead><tr><th>Dimension</th><th>Description</th><th style="text-align:center">Score</th></tr></thead><tbody>${dimRows}</tbody></table>

<h2>Frequency Band Distribution</h2>
<table><thead><tr><th>Band</th><th>Energy</th><th style="text-align:right">%</th></tr></thead><tbody>${binRows}</tbody></table>

<div class="footer">Generated by <a href="https://thecodewrangler.github.io/guitar-tone-tools/">Guitar Tone Tools</a></div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `guitar-report-${guitarName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ── Compare ────────────────────────────────────────────────────────────

function renderCompare() {
  const container = $('#compare-content');
  container.innerHTML = '';

  const hasRecordings = guitars.length >= 2;
  const hasProfiles = profiles.length >= 2;
  const hasAny = guitars.length + profiles.length >= 2;

  if (!hasAny) {
    container.innerHTML = `<p class="hint">Record or upload at least 2 guitars, or create at least 2 profiles, to start comparing.</p>`;
    return;
  }

  // Mode tabs: Recordings | Profiles
  const modeDiv = document.createElement('div');
  modeDiv.className = 'compare-mode-tabs';
  modeDiv.innerHTML = `
    <button class="btn compare-mode-btn ${hasRecordings ? 'active' : ''}" data-mode="recordings" ${!hasRecordings ? 'disabled' : ''}>
      Compare Recordings${guitars.length > 0 ? ` (${guitars.length})` : ''}
    </button>
    <button class="btn compare-mode-btn ${!hasRecordings && hasProfiles ? 'active' : ''}" data-mode="profiles" ${!hasProfiles ? 'disabled' : ''}>
      Compare Profiles${profiles.length > 0 ? ` (${profiles.length})` : ''}
    </button>
  `;
  container.appendChild(modeDiv);

  const compareBody = document.createElement('div');
  compareBody.id = 'compare-body';
  container.appendChild(compareBody);

  const defaultMode = hasRecordings ? 'recordings' : 'profiles';
  renderCompareMode(defaultMode, compareBody);

  modeDiv.querySelectorAll('.compare-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modeDiv.querySelectorAll('.compare-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCompareMode(btn.dataset.mode, compareBody);
    });
  });
}

function renderCompareMode(mode, container) {
  container.innerHTML = '';
  if (mode === 'recordings') {
    renderRecordingCompare(container);
  } else {
    renderProfileCompare(container);
  }
}

function renderRecordingCompare(container) {
  if (guitars.length < 2) {
    container.innerHTML = `<p class="hint">Record or upload at least 2 guitars to start comparing.</p>`;
    return;
  }

  const chordGroups = {};
  for (const g of guitars) {
    const key = g.chord || 'Untagged';
    if (!chordGroups[key]) chordGroups[key] = [];
    chordGroups[key].push(g);
  }

  const filterDiv = document.createElement('div');
  filterDiv.className = 'compare-filter';
  filterDiv.innerHTML = `<label class="compare-filter-label">Filter by chord/note:</label>`;
  const filterSelect = document.createElement('select');
  filterSelect.id = 'compare-chord-filter';
  filterSelect.innerHTML = `<option value="all">All recordings</option>`;
  for (const chord of Object.keys(chordGroups)) {
    const count = chordGroups[chord].length;
    filterSelect.innerHTML += `<option value="${chord}">${chord} (${count})</option>`;
  }
  filterDiv.appendChild(filterSelect);
  container.appendChild(filterDiv);

  const warnDiv = document.createElement('div');
  warnDiv.id = 'compare-warning';
  container.appendChild(warnDiv);

  const form = document.createElement('div');
  form.className = 'compare-selector';
  form.id = 'compare-checkboxes';
  container.appendChild(form);

  const output = document.createElement('div');
  output.id = 'compare-output';
  container.appendChild(output);

  function renderCheckboxes(filteredGuitars) {
    form.innerHTML = '';
    filteredGuitars.forEach(g => {
      const label = document.createElement('label');
      label.className = 'compare-check';
      const chordTag = g.chord ? ` <small>(${g.chord})</small>` : '';
      label.innerHTML = `<input type="checkbox" value="${g.id}" checked> ${g.name}${chordTag}`;
      form.appendChild(label);
    });
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = 'Compare Selected';
    form.appendChild(btn);

    btn.addEventListener('click', () => {
      const checked = [...form.querySelectorAll('input:checked')].map(i => i.value);
      const selected = guitars.filter(g => checked.includes(g.id));
      if (selected.length < 2) { output.innerHTML = '<p class="hint">Select at least 2.</p>'; return; }
      runComparison(selected, output, warnDiv);
    });

    if (filteredGuitars.length >= 2) {
      runComparison(filteredGuitars, output, warnDiv);
    } else {
      output.innerHTML = '<p class="hint">Need at least 2 recordings with this chord to compare.</p>';
      warnDiv.innerHTML = '';
    }
  }

  filterSelect.addEventListener('change', () => {
    const val = filterSelect.value;
    const filtered = val === 'all' ? guitars : guitars.filter(g => (g.chord || 'Untagged') === val);
    renderCheckboxes(filtered);
  });

  renderCheckboxes(guitars);
}

function renderProfileCompare(container) {
  if (profiles.length < 2) {
    container.innerHTML = `<p class="hint">Create at least 2 guitar profiles to compare them.</p>`;
    return;
  }

  const form = document.createElement('div');
  form.className = 'compare-selector';
  profiles.forEach(p => {
    const label = document.createElement('label');
    label.className = 'compare-check';
    const score = p.profile.overall.overall;
    label.innerHTML = `<input type="checkbox" value="${p.id}" checked> ${p.name} <small>(${score}/100)</small>`;
    form.appendChild(label);
  });
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.textContent = 'Compare Selected';
  form.appendChild(btn);
  container.appendChild(form);

  const output = document.createElement('div');
  output.id = 'compare-profile-output';
  container.appendChild(output);

  function doCompare() {
    const checked = [...form.querySelectorAll('input:checked')].map(i => i.value);
    const selected = profiles.filter(p => checked.includes(p.id));
    if (selected.length < 2) {
      output.innerHTML = '<p class="hint">Select at least 2 profiles.</p>';
      return;
    }
    renderProfileComparison(selected, output);
  }

  btn.addEventListener('click', doCompare);
  doCompare();
}

function renderProfileComparison(selected, container) {
  container.innerHTML = '';

  const scoreKeys = Object.keys(SCORE_LABELS);
  const table = document.createElement('table');
  table.className = 'compare-table';

  let thead = `<tr><th>Guitar</th>`;
  for (const key of scoreKeys) thead += `<th>${SCORE_LABELS[key]}</th>`;
  thead += `</tr>`;

  const bests = {};
  for (const key of scoreKeys) {
    bests[key] = Math.max(...selected.map(p => p.profile.overall[key]));
  }

  let tbody = '';
  for (const p of selected) {
    tbody += `<tr><td><strong>${p.name}</strong></td>`;
    for (const key of scoreKeys) {
      const val = p.profile.overall[key];
      const isBest = val === bests[key] && selected.length > 1;
      const color = val >= 75 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--danger)';
      tbody += `<td style="color:${color};${isBest ? 'font-weight:700' : ''}">${val}${isBest ? ' ★' : ''}</td>`;
    }
    tbody += `</tr>`;
  }

  table.innerHTML = `<thead>${thead}</thead><tbody>${tbody}</tbody>`;
  container.appendChild(table);

  // Category comparison
  const cats = ['bass', 'mid', 'treble'];
  const catLabels = { bass: 'Bass Strings', mid: 'Mid Strings', treble: 'Treble Strings' };
  for (const cat of cats) {
    const hasAll = selected.every(p => p.profile.categoryScores[cat]);
    if (!hasAll) continue;
    const h = document.createElement('h3');
    h.className = 'subsection-title';
    h.textContent = catLabels[cat];
    container.appendChild(h);

    const catTable = document.createElement('table');
    catTable.className = 'compare-table';
    let catThead = `<tr><th>Guitar</th>`;
    for (const key of scoreKeys) catThead += `<th>${SCORE_LABELS[key]}</th>`;
    catThead += `</tr>`;

    let catTbody = '';
    for (const p of selected) {
      const sc = p.profile.categoryScores[cat];
      catTbody += `<tr><td><strong>${p.name}</strong></td>`;
      for (const key of scoreKeys) {
        const val = sc[key] ?? '—';
        const color = typeof val === 'number'
          ? (val >= 75 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--danger)')
          : '';
        catTbody += `<td style="color:${color}">${val}</td>`;
      }
      catTbody += `</tr>`;
    }
    catTable.innerHTML = `<thead>${catThead}</thead><tbody>${catTbody}</tbody>`;
    container.appendChild(catTable);
  }

  // Individual score cards
  const h2 = document.createElement('h2');
  h2.className = 'section-title';
  h2.textContent = 'Individual Profile Breakdowns';
  container.appendChild(h2);

  for (const p of selected) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<h3 class="subsection-title">${p.name}</h3>` + renderScoreCard(p.profile.overall);
    container.appendChild(wrapper);
  }

  // ── Step-by-step chart comparison ────────────────────────────────
  const stepTitle = document.createElement('h2');
  stepTitle.className = 'section-title';
  stepTitle.textContent = 'Step-by-Step Comparison';
  container.appendChild(stepTitle);

  const stepHint = document.createElement('p');
  stepHint.style.cssText = 'color:var(--text-dim);font-size:0.85rem;margin-bottom:1rem;';
  stepHint.textContent = 'Click any step to expand the comparative charts.';
  container.appendChild(stepHint);

  const stepList = document.createElement('div');
  stepList.className = 'profile-steps-list';
  container.appendChild(stepList);

  for (const step of PROFILE_STEPS) {
    const perGuitar = selected.map(p => {
      const r = p.profile.stepResults && p.profile.stepResults.find(sr => sr.stepId === step.id);
      return r ? { name: p.name, analysis: r.analysis } : null;
    }).filter(Boolean);

    if (perGuitar.length < 2) continue;

    const item = document.createElement('div');
    item.className = 'profile-step-item';

    const scoreInfo = perGuitar.map(g => {
      const sc = g.analysis.scores ? g.analysis.scores.overall : '—';
      const color = typeof sc === 'number' ? (sc >= 75 ? 'var(--green)' : sc >= 50 ? 'var(--amber)' : 'var(--danger)') : '';
      return `<span style="color:${color};font-weight:700;margin-left:0.4rem;">${g.name}: ${sc}</span>`;
    }).join('  ');

    item.innerHTML = `
      <div class="profile-step-header" data-toggle="cmp-step-${step.id}">
        <span class="profile-step-num">${step.id}</span>
        <span class="profile-step-name">${step.label}</span>
        <span style="font-size:0.8rem;">${scoreInfo}</span>
        <span class="profile-step-toggle">▸</span>
      </div>
      <div id="cmp-step-${step.id}" class="profile-step-detail hidden"></div>`;
    stepList.appendChild(item);

    const header = item.querySelector('.profile-step-header');
    header.addEventListener('click', () => {
      const detail = item.querySelector(`#cmp-step-${step.id}`);
      const toggle = header.querySelector('.profile-step-toggle');
      if (detail.classList.contains('hidden')) {
        detail.classList.remove('hidden');
        toggle.textContent = '▾';
        if (!detail.dataset.rendered) {
          detail.dataset.rendered = 'true';
          renderStepComparison(perGuitar, step, detail);
        }
      } else {
        detail.classList.add('hidden');
        toggle.textContent = '▸';
      }
    });
  }
}

function renderStepComparison(perGuitar, step, container) {
  const analyses = perGuitar.map(g => ({ ...g.analysis, name: g.name }));
  const refFreqs = buildRefFreqsForStep(step);

  // Score comparison table for this step
  const hasScores = analyses.every(a => a.scores);
  if (hasScores) {
    const scoreKeys = Object.keys(SCORE_LABELS);
    const bests = {};
    for (const key of scoreKeys) bests[key] = Math.max(...analyses.map(a => a.scores[key]));

    const table = document.createElement('table');
    table.className = 'compare-table';
    let thead = `<tr><th>Guitar</th>`;
    for (const key of scoreKeys) thead += `<th>${SCORE_LABELS[key]}</th>`;
    thead += `</tr>`;

    let tbody = '';
    for (const a of analyses) {
      tbody += `<tr><td><strong>${a.name}</strong></td>`;
      for (const key of scoreKeys) {
        const val = a.scores[key];
        const isBest = val === bests[key] && analyses.length > 1;
        const color = val >= 75 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--danger)';
        tbody += `<td style="color:${color};${isBest ? 'font-weight:700' : ''}">${val}${isBest ? ' ★' : ''}</td>`;
      }
      tbody += `</tr>`;
    }
    table.innerHTML = `<thead>${thead}</thead><tbody>${tbody}</tbody>`;
    container.appendChild(table);
  }

  // Comparison charts
  const chartDefs = [
    (c) => drawFFTOverlay(c, analyses, refFreqs),
    (c) => drawBinPowerCompare(c, analyses),
  ];

  if (analyses.length === 2) {
    chartDefs.push((c) => drawMirrorFFT(c, analyses[0], analyses[1]));
  }

  const hasDecay = analyses.filter(a => a.harmonicDecay && a.harmonicDecay.harmonics && a.harmonicDecay.harmonics.length).length >= 2;
  if (hasDecay) {
    chartDefs.push((c) => drawDecayRateCompare(c, analyses));
  }

  for (const draw of chartDefs) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    container.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
  }

  if (hasDecay) {
    mountHarmonicDecayCompareChart(container, analyses);
  }

  // Side-by-side spectrograms
  const specGuitars = analyses.filter(a => a.stft);
  if (specGuitars.length >= 2) {
    const specTitle = document.createElement('h4');
    specTitle.className = 'subsection-title';
    specTitle.textContent = 'Spectrograms';
    container.appendChild(specTitle);
    for (const a of specGuitars) {
      const sc = document.createElement('canvas');
      sc.className = 'chart-canvas-tall';
      container.appendChild(sc);
      requestAnimationFrame(() => drawSpectrogram(sc, a.stft, `${a.name} — Spectrogram`, refFreqs));
    }
  }
}

function runComparison(selected, output, warnDiv) {
  const chords = [...new Set(selected.map(g => g.chord || 'Untagged'))];
  if (chords.length > 1) {
    warnDiv.innerHTML = `<div class="compare-warn">
      These recordings use different chords/notes (${chords.join(', ')}). 
      For a fair comparison, filter to a single chord above.
    </div>`;
  } else {
    warnDiv.innerHTML = '';
  }

  const refFreqs = chords.length === 1 ? buildRefFreqs(chords[0]) : null;
  renderComparison(selected.map(g => g.analysis), output, refFreqs);
}

function renderComparison(analyses, container, refFreqs = null) {
  container.innerHTML = '';

  const hasScores = analyses.every(a => a.scores);
  if (hasScores) {
    const scoreKeys = Object.keys(SCORE_LABELS);
    const table = document.createElement('table');
    table.className = 'compare-table';

    let thead = `<tr><th>Guitar</th>`;
    for (const key of scoreKeys) thead += `<th>${SCORE_LABELS[key]}</th>`;
    thead += `</tr>`;

    let tbody = '';
    const bests = {};
    for (const key of scoreKeys) {
      bests[key] = Math.max(...analyses.map(a => a.scores[key]));
    }

    for (const a of analyses) {
      tbody += `<tr><td><strong>${a.name}</strong></td>`;
      for (const key of scoreKeys) {
        const val = a.scores[key];
        const isBest = val === bests[key] && analyses.length > 1;
        const color = val >= 75 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--danger)';
        tbody += `<td style="color:${color};${isBest ? 'font-weight:700' : ''}">${val}${isBest ? ' ★' : ''}</td>`;
      }
      tbody += `</tr>`;
    }

    table.innerHTML = `<thead>${thead}</thead><tbody>${tbody}</tbody>`;
    container.appendChild(table);
  }

  const sigTable = document.createElement('table');
  sigTable.className = 'compare-table';
  sigTable.innerHTML = `
    <thead>
      <tr>
        <th>Guitar</th><th>Note</th><th>Fundamental</th><th>Duration</th><th>Damping</th>
        ${Object.keys(analyses[0].binPowers).map(b => `<th>${b}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${analyses.map(a => `<tr>
        <td><strong>${a.name}</strong></td>
        <td>${a.detectedNote ? a.detectedNote.name : '—'}</td>
        <td>${a.fundamental} Hz</td>
        <td>${a.duration} s</td>
        <td>${a.dampingFactor ?? '—'}</td>
        ${Object.values(a.binPowers).map(v => `<td>${v}%</td>`).join('')}
      </tr>`).join('')}
    </tbody>
  `;
  container.appendChild(sigTable);

  const chartDefs = [
    (c) => drawFFTOverlay(c, analyses, refFreqs),
    (c) => drawBinPowerCompare(c, analyses),
  ];

  if (analyses.length === 2) {
    chartDefs.push((c) => drawMirrorFFT(c, analyses[0], analyses[1]));
  }

  const hasDecay = analyses.filter(a => a.harmonicDecay && a.harmonicDecay.harmonics && a.harmonicDecay.harmonics.length).length >= 2;
  if (hasDecay) {
    chartDefs.push((c) => drawDecayRateCompare(c, analyses));
  }

  for (const draw of chartDefs) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    container.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
  }

  if (hasDecay) {
    mountHarmonicDecayCompareChart(container, analyses);
  }

  if (hasScores) {
    const h3 = document.createElement('h2');
    h3.className = 'section-title';
    h3.textContent = 'Individual Score Breakdowns';
    container.appendChild(h3);

    for (const a of analyses) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `<h3 class="subsection-title">${a.name}</h3>` + renderScoreCard(a.scores);
      container.appendChild(wrapper);
    }
  }
}

// ── Library ────────────────────────────────────────────────────────────

function renderLibrary() {
  const container = $('#library-content');
  container.innerHTML = '';

  // Import bar (always visible)
  const importBar = document.createElement('div');
  importBar.className = 'import-bar';
  importBar.innerHTML = `
    <button class="btn" id="btn-import-profile">Import a Friend's Profile (.json)</button>
    <input type="file" id="import-profile-input" accept=".json" class="hidden" />
    <span id="import-status"></span>`;
  container.appendChild(importBar);

  const btnImport = importBar.querySelector('#btn-import-profile');
  const fileInput = importBar.querySelector('#import-profile-input');
  const importStatus = importBar.querySelector('#import-status');

  btnImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    importStatus.textContent = 'Importing…';
    importStatus.style.color = '';
    try {
      const entry = await importProfileFromFile(file);
      importStatus.textContent = `Imported "${entry.name}" — ${entry.profile.overall.overall}/100!`;
      importStatus.style.color = 'var(--green)';
      renderLibrary();
    } catch (err) {
      importStatus.textContent = err.message;
      importStatus.style.color = 'var(--danger)';
    }
    fileInput.value = '';
  });

  if (guitars.length === 0 && profiles.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No saved recordings or profiles yet. Record from Quick Analyze or build a Profile, or import a friend\'s profile above.';
    container.appendChild(hint);
    return;
  }

  // Profiles section
  if (profiles.length > 0) {
    const profileHeader = document.createElement('h2');
    profileHeader.className = 'section-title';
    profileHeader.textContent = 'Guitar Profiles';
    container.appendChild(profileHeader);

    const profileList = document.createElement('div');
    profileList.className = 'library-list';

    profiles.forEach(p => {
      const score = p.profile.overall.overall;
      const grade = scoreGrade(score);
      const scoreColor = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--danger)';
      const dateStr = new Date(p.timestamp).toLocaleDateString();
      const card = document.createElement('div');
      card.className = 'library-card';
      card.innerHTML = `
        <div class="library-card-header">
          <h3>${p.name} <span class="library-badge profile-badge">Profile</span></h3>
          <div>
            <span class="library-score" style="color:${scoreColor}">${score}/100</span>
            <button class="btn small primary" data-action="share-profile" data-id="${p.id}">Send</button>
            <button class="btn small" data-action="export-profile-json" data-id="${p.id}">Export</button>
            <button class="btn small" data-action="view-profile" data-id="${p.id}">View</button>
            <button class="btn small danger" data-action="delete-profile" data-id="${p.id}">Delete</button>
          </div>
        </div>
        <div class="library-card-meta">
          ${grade} · ${dateStr} · 10 steps
        </div>
        <div class="library-card-detail hidden" id="profile-detail-${p.id}"></div>
      `;
      profileList.appendChild(card);
    });
    container.appendChild(profileList);
  }

  // Recordings section
  if (guitars.length > 0) {
    const recHeader = document.createElement('h2');
    recHeader.className = 'section-title';
    recHeader.textContent = 'Individual Recordings';
    container.appendChild(recHeader);

    const recList = document.createElement('div');
    recList.className = 'library-list';

    guitars.forEach(g => {
      const score = g.analysis.scores ? g.analysis.scores.overall : '—';
      const grade = g.analysis.scores ? scoreGrade(g.analysis.scores.overall) : '';
      const chordTag = g.chord ? g.chord : 'Untagged';
      const card = document.createElement('div');
      card.className = 'library-card';
      card.innerHTML = `
        <div class="library-card-header">
          <h3>${g.name}</h3>
          <div>
            <span class="library-score">${score}/100</span>
            <button class="btn small" data-action="view" data-id="${g.id}">View</button>
            <button class="btn small danger" data-action="delete" data-id="${g.id}">Delete</button>
          </div>
        </div>
        <div class="library-card-meta">
          ${chordTag} · ${g.analysis.detectedNote ? g.analysis.detectedNote.name : '—'} · 
          ${g.analysis.fundamental} Hz · ${g.analysis.duration}s · ${grade}
        </div>
        <div class="library-card-detail hidden" id="detail-${g.id}"></div>
      `;
      recList.appendChild(card);
    });
    container.appendChild(recList);
  }

  // Storage usage indicator (async, appended when ready)
  const storageInfo = document.createElement('div');
  storageInfo.className = 'storage-info';
  container.appendChild(storageInfo);
  estimateStorageUsage().then(est => {
    if (!est) return;
    const usedMB = (est.usage / (1024 * 1024)).toFixed(1);
    const quotaMB = (est.quota / (1024 * 1024)).toFixed(0);
    const pct = est.quota > 0 ? ((est.usage / est.quota) * 100).toFixed(1) : 0;
    storageInfo.innerHTML = `Storage: ${usedMB} MB used of ${quotaMB} MB available (${pct}%)`;
  }).catch(() => {});
}

$('#library-content').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'delete') {
    guitars = guitars.filter(g => g.id !== id);
    idbDeleteGuitar(id).catch(e => console.warn('Delete failed:', e));
    renderLibrary();
  } else if (action === 'view') {
    const detail = $(`#detail-${id}`);
    if (!detail) return;
    if (!detail.classList.contains('hidden')) {
      detail.classList.add('hidden');
      return;
    }
    detail.classList.remove('hidden');
    const g = guitars.find(g => g.id === id);
    if (g && !detail.dataset.rendered) {
      renderSingleAnalysisInto(g.analysis, detail, g.name, g.chord);
      detail.dataset.rendered = 'true';
    }
  } else if (action === 'share-profile') {
    const p = profiles.find(p => p.id === id);
    if (p) shareProfile(p.profile, p.name);
  } else if (action === 'export-profile-json') {
    const p = profiles.find(p => p.id === id);
    if (p) downloadProfileJson(p.profile, p.name);
  } else if (action === 'delete-profile') {
    profiles = profiles.filter(p => p.id !== id);
    idbDeleteProfile(id).catch(e => console.warn('Delete failed:', e));
    renderLibrary();
  } else if (action === 'view-profile') {
    const detail = $(`#profile-detail-${id}`);
    if (!detail) return;
    if (!detail.classList.contains('hidden')) {
      detail.classList.add('hidden');
      return;
    }
    detail.classList.remove('hidden');
    const p = profiles.find(p => p.id === id);
    if (p && !detail.dataset.rendered) {
      renderProfileReport(p.profile, p.name, detail, p.id);
      detail.dataset.rendered = 'true';
    }
  }
});

function renderSingleAnalysisInto(a, container, guitarName, chord, refFreqs) {
  if (a.scores) {
    const div = document.createElement('div');
    div.innerHTML = renderScoreCard(a.scores);
    container.appendChild(div);
  }

  const fftRef = refFreqs || buildRefFreqs(chord) || null;
  const charts = [
    (c) => drawWaveform(c, a.waveform.samples, a.waveform.sr, `${a.name} — Waveform`),
    (c) => drawFFT(c, a.fft.frequencies, a.fft.magnitudes, `${a.name} — Frequency Spectrum`, '#7c3aed', fftRef),
    (c) => drawBinPowers(c, a.binPowers, `${a.name} — Bin Power`),
    (c) => drawDamping(c, a.damping.envelope, a.damping.times, `${a.name} — Amplitude Decay`),
  ];
  for (const draw of charts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    container.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
  }
  if (a.stft) {
    const sc = document.createElement('canvas');
    sc.className = 'chart-canvas-tall';
    container.appendChild(sc);
    requestAnimationFrame(() => drawSpectrogram(sc, a.stft, `${a.name} — Spectrogram`, fftRef));
  }
  if (a.harmonicDecay) {
    mountHarmonicDecayChart(container, a.harmonicDecay, `${a.name} — Harmonic Decay`);
  }

  if (guitarName && a.scores) {
    const exportDiv = document.createElement('div');
    exportDiv.className = 'export-buttons';
    exportDiv.innerHTML = `
      <button class="btn primary btn-export-rec-html">Download Report (HTML)</button>
      <button class="btn btn-export-rec-text">Copy Summary to Clipboard</button>`;
    container.appendChild(exportDiv);

    exportDiv.querySelector('.btn-export-rec-html').addEventListener('click', () => {
      downloadRecordingHtmlReport(a, guitarName, chord);
    });
    const btnText = exportDiv.querySelector('.btn-export-rec-text');
    btnText.addEventListener('click', () => {
      const text = generateRecordingTextSummary(a, guitarName, chord);
      navigator.clipboard.writeText(text).then(() => {
        btnText.textContent = 'Copied!';
        setTimeout(() => { btnText.textContent = 'Copy Summary to Clipboard'; }, 2000);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btnText.textContent = 'Copied!';
        setTimeout(() => { btnText.textContent = 'Copy Summary to Clipboard'; }, 2000);
      });
    });
  }
}

// ── Init ───────────────────────────────────────────────────────────────

(async function init() {
  let storageOk = false;
  try {
    await initStorage();
    guitars = hydrateGuitarList(await loadAllGuitars());
    profiles = hydrateProfileList(await loadAllProfiles());
    storageOk = true;
  } catch (e) {
    console.warn('IndexedDB init failed, starting with empty state:', e);
  }
  _readyResolve();
  renderLibrary();
  if (!storageOk) {
    const banner = document.createElement('div');
    banner.className = 'save-status save-error';
    banner.style.margin = '1rem';
    banner.textContent = '⚠ Storage unavailable — profiles will only last until you close this tab. Check your browser privacy settings.';
    document.querySelector('.app')?.prepend(banner);
  }
})();
