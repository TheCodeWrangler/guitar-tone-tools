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

// ── State ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gtt_guitars';
let guitars = loadGuitars();
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
    analysis: {
      ...g.analysis,
      fft: {
        frequencies: Array.from(g.analysis.fft.frequencies),
        magnitudes: Array.from(g.analysis.fft.magnitudes),
      },
      waveform: {
        samples: Array.from(g.analysis.waveform.samples),
        sr: g.analysis.waveform.sr,
      },
      damping: {
        envelope: Array.from(g.analysis.damping.envelope),
        times: Array.from(g.analysis.damping.times),
      },
    },
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisable));
}

guitars = guitars.map(g => {
  if (g.analysis && g.analysis.fft) {
    g.analysis.fft.frequencies = new Float32Array(g.analysis.fft.frequencies);
    g.analysis.fft.magnitudes  = new Float32Array(g.analysis.fft.magnitudes);
    g.analysis.waveform.samples = new Float32Array(g.analysis.waveform.samples);
    // Backfill scores for old entries
    if (!g.analysis.scores) {
      g.analysis.scores = computeScores(g.analysis);
    }
    if (!g.analysis.detectedNote) {
      g.analysis.detectedNote = hzToNote(g.analysis.fundamental);
    }
    if (!g.chord) g.chord = '';
  }
  return g;
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
    } catch (err) {
      recStatus.textContent = `Error processing recording: ${err.message}`;
      console.error(err);
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
  const name = inputName.value.trim();
  if (!name) { recStatus.textContent = 'Please enter a guitar name.'; return; }
  if (!chordSelect.value) { recStatus.textContent = 'Please select what you played (chord or note).'; return; }
  if (!currentAnalysis) return;

  currentAnalysis.name = name;
  const chord = chordSelect.value;

  const id = Date.now().toString(36);
  guitars.push({ id, name, chord, analysis: currentAnalysis });
  saveGuitars();

  renderSingleAnalysis(currentAnalysis);
  recStatus.textContent = `"${name}" (${chord}) saved with a score of ${currentAnalysis.scores.overall}/100! Compare it on the Compare page.`;
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

  // Score card
  if (a.scores) {
    const scoreSection = document.createElement('div');
    scoreSection.innerHTML = `<h2 class="section-title">Tone Quality Score</h2>` + renderScoreCard(a.scores);
    analysisOut.appendChild(scoreSection);
  }

  // Detected note
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

  // Bin powers
  const binRow = document.createElement('div');
  binRow.className = 'metrics-grid bins';
  for (const [b, v] of Object.entries(a.binPowers)) {
    binRow.innerHTML += `<div class="metric"><span class="metric-value">${v}%</span><span class="metric-label">${b}</span></div>`;
  }
  analysisOut.appendChild(binRow);

  // Charts
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

// ── Compare ────────────────────────────────────────────────────────────

function renderCompare() {
  const container = $('#compare-content');
  container.innerHTML = '';

  if (guitars.length < 2) {
    container.innerHTML = `<p class="hint">Record or upload at least 2 guitars to start comparing.</p>`;
    return;
  }

  // Group by chord
  const chordGroups = {};
  for (const g of guitars) {
    const key = g.chord || 'Untagged';
    if (!chordGroups[key]) chordGroups[key] = [];
    chordGroups[key].push(g);
  }

  // Chord filter
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

  // Warning area
  const warnDiv = document.createElement('div');
  warnDiv.id = 'compare-warning';
  container.appendChild(warnDiv);

  // Checkboxes
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

function runComparison(selected, output, warnDiv) {
  // Check for chord mismatch
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

  // Score comparison table
  const hasScores = analyses.every(a => a.scores);
  if (hasScores) {
    const scoreKeys = Object.keys(SCORE_LABELS);
    const table = document.createElement('table');
    table.className = 'compare-table';

    let thead = `<tr><th>Guitar</th>`;
    for (const key of scoreKeys) thead += `<th>${SCORE_LABELS[key]}</th>`;
    thead += `</tr>`;

    let tbody = '';
    // Find best score in each column for highlighting
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

  // Signal comparison table
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

  // Charts
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

  // Individual score cards
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

  if (guitars.length === 0) {
    container.innerHTML = '<p class="hint">No saved recordings yet. Record or upload from the Analyze page.</p>';
    return;
  }

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
    container.appendChild(card);
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'delete') {
      guitars = guitars.filter(g => g.id !== id);
      saveGuitars();
      renderLibrary();
    } else if (btn.dataset.action === 'view') {
      const detail = $(`#detail-${id}`);
      if (!detail.classList.contains('hidden')) {
        detail.classList.add('hidden');
        return;
      }
      detail.classList.remove('hidden');
      const g = guitars.find(g => g.id === id);
      if (g) {
        detail.innerHTML = '';
        renderSingleAnalysisInto(g.analysis, detail);
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
