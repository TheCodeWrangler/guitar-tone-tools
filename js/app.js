/**
 * Main application controller — wires the UI to the recorder, analysis, and scoring engines.
 * All guitar data is persisted in localStorage so comparisons survive reloads.
 */
import { startRecording, stopRecording, isRecording, loadAudioFile } from './recorder.js';
import { analyzeAudio } from './analysis.js';
import {
  computeScores, hzToNote, CHORD_PRESETS, SCORE_LABELS, SCORE_DESCRIPTIONS, scoreGrade,
} from './scoring.js';
import {
  drawWaveform, drawFFT, drawBinPowers, drawDamping,
  drawFFTOverlay, drawBinPowerCompare, drawMirrorFFT,
} from './charts.js';
import { PROFILE_STEPS, STRING_CATEGORIES, computeProfile } from './profile.js';

// ── State ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gtt_guitars';
const PROFILE_STORAGE_KEY = 'gtt_profiles';

let guitars = loadGuitars();
let profiles = loadProfiles();
let currentAnalysis = null;
let currentBlob = null;

function loadGuitars() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveGuitars() {
  const serialisable = guitars.map(g => ({
    id: g.id,
    name: g.name,
    chord: g.chord || '',
    analysis: serialiseAnalysis(g.analysis),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisable));
}

function loadProfiles() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProfiles() {
  const serialisable = profiles.map(p => ({
    id: p.id,
    name: p.name,
    timestamp: p.timestamp,
    profile: serialiseProfile(p.profile),
  }));
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(serialisable));
}

function serialiseAnalysis(a) {
  if (!a || !a.fft) return a;

  // Cap stored FFT to 5kHz range to save space (especially for profiles with 10 recordings)
  let freqs = a.fft.frequencies;
  let mags = a.fft.magnitudes;
  let maxIdx = freqs.length;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] > 6000) { maxIdx = i; break; }
  }

  return {
    ...a,
    fft: {
      frequencies: Array.from(freqs.slice(0, maxIdx)),
      magnitudes: Array.from(mags.slice(0, maxIdx)),
    },
    waveform: {
      samples: Array.from(a.waveform.samples.slice(0, 10000)),
      sr: a.waveform.sr,
    },
    damping: {
      envelope: Array.from(a.damping.envelope),
      times: Array.from(a.damping.times),
    },
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

guitars = guitars.map(g => {
  if (g.analysis && g.analysis.fft) {
    g.analysis = hydrateAnalysis(g.analysis);
    if (!g.chord) g.chord = '';
  }
  return g;
});

profiles = profiles.map(p => {
  if (p.profile && p.profile.stepResults) {
    p.profile.stepResults = p.profile.stepResults.map(r => ({
      stepId: r.stepId,
      analysis: hydrateAnalysis(r.analysis),
    }));
  }
  return p;
});

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

btnRecord.addEventListener('click', async () => {
  if (isRecording()) {
    btnRecord.textContent = 'Record';
    btnRecord.classList.remove('recording');
    recStatus.textContent = 'Processing audio...';
    try {
      const { audioBuffer, blob } = await stopRecording();
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
      recStatus.textContent = `Error processing recording: ${err.message}`;
      console.error(err);
      recStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    try {
      await startRecording();
      btnRecord.textContent = 'Stop';
      btnRecord.classList.add('recording');
      recStatus.textContent = 'Recording... play your chord and click Stop when done.';
      audioPlayer.classList.add('hidden');
      btnAnalyze.classList.add('hidden');
      noteDetection.classList.add('hidden');
      analysisOut.innerHTML = '';
    } catch (err) {
      recStatus.textContent = 'Microphone access denied. Please allow mic access and try again.';
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
    guitars.push({ id, name, chord, analysis: currentAnalysis });
    try { saveGuitars(); } catch (e) { console.warn('localStorage save failed:', e); }

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

  const charts = [
    (c) => drawWaveform(c, a.waveform.samples, a.waveform.sr, `${a.name} — Waveform`),
    (c) => drawFFT(c, a.fft.frequencies, a.fft.magnitudes, `${a.name} — Frequency Spectrum`),
    (c) => drawBinPowers(c, a.binPowers, `${a.name} — Bin Power`),
    (c) => drawDamping(c, a.damping.envelope, a.damping.times, `${a.name} — Amplitude Decay`),
  ];

  for (const draw of charts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    analysisOut.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
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

function renderWizardStep() {
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
      <div class="wizard-step-controls">
        <button id="wiz-record" class="btn primary">Record</button>
        <button id="wiz-rerecord" class="btn hidden">Re-record</button>
      </div>
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

  let stepAnalysis = null;

  async function doRecord() {
    if (isRecording()) {
      wizRecord.textContent = 'Record';
      wizRecord.classList.remove('recording');
      wizStatus.textContent = 'Processing audio...';
      try {
        const { audioBuffer, blob } = await stopRecording();
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
        wizStatus.textContent = `Error: ${err.message}`;
        console.error(err);
      }
    } else {
      try {
        await startRecording();
        wizRecord.textContent = 'Stop';
        wizRecord.classList.add('recording');
        wizStatus.textContent = 'Recording... play and click Stop when done.';
        wizAudio.classList.add('hidden');
        wizNote.classList.add('hidden');
        wizNext.disabled = true;
        wizRerecord.classList.add('hidden');
      } catch (err) {
        wizStatus.textContent = 'Microphone access denied. Please allow mic access.';
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
    profileStepResults[profileCurrentStep] = {
      stepId: step.id,
      analysis: stepAnalysis,
    };
    profileCurrentStep++;
    if (profileCurrentStep < total) {
      renderWizardStep();
      setTimeout(() => wizardContent.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else {
      finishProfile();
    }
  });
}

function renderWizardNoteDetection(analysis, step, container) {
  const note = analysis.detectedNote;
  const expectedNote = hzToNote(step.hz);

  container.classList.remove('hidden');
  let html = `<span class="note-badge">Detected: <strong>${note.name}</strong> (${analysis.fundamental} Hz`;
  if (note.cents !== 0) html += `, ${note.cents > 0 ? '+' : ''}${note.cents} cents`;
  html += `)</span>`;

  if (note.note === expectedNote.note && Math.abs(note.octave - expectedNote.octave) <= 1) {
    html += `<span class="note-match good">Matches expected ${expectedNote.name}</span>`;
  } else {
    html += `<span class="note-match warn">Expected ${expectedNote.name} — detected ${note.name}. Consider re-recording.</span>`;
  }
  container.innerHTML = html;
}

function finishProfile() {
  try {
    const name = profileNameInput.value.trim();

    // Compact step results — ensure no sparse slots
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

    try {
      saveProfiles();
    } catch (storageErr) {
      console.warn('Could not save to localStorage:', storageErr);
    }

    wizardContent.classList.add('hidden');
    wizardContent.innerHTML = '';
    profileReport.classList.remove('hidden');
    renderProfileReport(profile, name, profileReport);

    btnStartProfile.disabled = false;
    profileNameInput.disabled = false;
    btnStartProfile.textContent = 'Start New Profile';

    // Scroll report into view (critical on mobile)
    setTimeout(() => profileReport.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } catch (err) {
    console.error('Profile generation failed:', err);
    wizardContent.innerHTML = `<div class="compare-warn">Error generating report: ${err.message}. Check console for details.</div>`;
    btnStartProfile.disabled = false;
    profileNameInput.disabled = false;
  }
}

// ── Profile Report ─────────────────────────────────────────────────────

function renderProfileReport(profile, name, container) {
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

  // Individual step results (expandable)
  html += `<h3 class="subsection-title">Individual Step Results</h3>`;
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
        <span class="profile-step-toggle">▸</span>
      </div>
      <div class="profile-step-detail hidden" id="profile-step-detail-${i}"></div>
    </div>`;
  });
  html += `</div>`;

  container.innerHTML = html;

  // Wire up expand/collapse and render charts lazily
  container.querySelectorAll('.profile-step-header').forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.toggle;
      const detail = container.querySelector(`#${targetId}`);
      const toggle = header.querySelector('.profile-step-toggle');
      if (detail.classList.contains('hidden')) {
        detail.classList.remove('hidden');
        toggle.textContent = '▾';
        if (!detail.dataset.rendered) {
          const idx = parseInt(targetId.replace('profile-step-detail-', ''), 10);
          const a = stepResults[idx].analysis;
          renderSingleAnalysisInto(a, detail);
          detail.dataset.rendered = 'true';
        }
      } else {
        detail.classList.add('hidden');
        toggle.textContent = '▸';
      }
    });
  });
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

  renderComparison(selected.map(g => g.analysis), output);
}

function renderComparison(analyses, container) {
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
    (c) => drawFFTOverlay(c, analyses),
    (c) => drawBinPowerCompare(c, analyses),
  ];

  if (analyses.length === 2) {
    chartDefs.push((c) => drawMirrorFFT(c, analyses[0], analyses[1]));
  }

  for (const draw of chartDefs) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    container.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
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

  if (guitars.length === 0 && profiles.length === 0) {
    container.innerHTML = '<p class="hint">No saved recordings or profiles yet. Record from Quick Analyze or build a Profile.</p>';
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

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'delete') {
      guitars = guitars.filter(g => g.id !== id);
      saveGuitars();
      renderLibrary();
    } else if (action === 'view') {
      const detail = $(`#detail-${id}`);
      if (!detail.classList.contains('hidden')) {
        detail.classList.add('hidden');
        return;
      }
      detail.classList.remove('hidden');
      const g = guitars.find(g => g.id === id);
      if (g && !detail.dataset.rendered) {
        renderSingleAnalysisInto(g.analysis, detail);
        detail.dataset.rendered = 'true';
      }
    } else if (action === 'delete-profile') {
      profiles = profiles.filter(p => p.id !== id);
      saveProfiles();
      renderLibrary();
    } else if (action === 'view-profile') {
      const detail = $(`#profile-detail-${id}`);
      if (!detail.classList.contains('hidden')) {
        detail.classList.add('hidden');
        return;
      }
      detail.classList.remove('hidden');
      const p = profiles.find(p => p.id === id);
      if (p && !detail.dataset.rendered) {
        renderProfileReport(p.profile, p.name, detail);
        detail.dataset.rendered = 'true';
      }
    }
  });
}

function renderSingleAnalysisInto(a, container) {
  if (a.scores) {
    const div = document.createElement('div');
    div.innerHTML = renderScoreCard(a.scores);
    container.appendChild(div);
  }

  const charts = [
    (c) => drawWaveform(c, a.waveform.samples, a.waveform.sr, `${a.name} — Waveform`),
    (c) => drawFFT(c, a.fft.frequencies, a.fft.magnitudes, `${a.name} — Frequency Spectrum`),
    (c) => drawBinPowers(c, a.binPowers, `${a.name} — Bin Power`),
    (c) => drawDamping(c, a.damping.envelope, a.damping.times, `${a.name} — Amplitude Decay`),
  ];
  for (const draw of charts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    container.appendChild(canvas);
    requestAnimationFrame(() => draw(canvas));
  }
}

// ── Init ───────────────────────────────────────────────────────────────

renderLibrary();
