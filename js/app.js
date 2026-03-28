/**
 * Main application controller — wires the UI to the recorder and analysis engine.
 * All guitar data is persisted in localStorage so comparisons survive reloads.
 */
import { startRecording, stopRecording, isRecording, loadAudioFile } from './recorder.js';
import { analyzeAudio } from './analysis.js';
import {
  drawWaveform, drawFFT, drawBinPowers, drawDamping,
  drawFFTOverlay, drawBinPowerCompare, drawMirrorFFT,
} from './charts.js';

// ── State ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gtt_guitars';
let guitars = loadGuitars();         // { id, name, analysis, blobUrl }[]
let currentAnalysis = null;
let currentBlob = null;

function loadGuitars() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveGuitars() {
  // Strip non-serialisable fields (typed arrays → regular arrays) for storage
  const serialisable = guitars.map(g => ({
    id: g.id,
    name: g.name,
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

// Restore typed arrays on load
guitars = guitars.map(g => {
  if (g.analysis && g.analysis.fft) {
    g.analysis.fft.frequencies = new Float32Array(g.analysis.fft.frequencies);
    g.analysis.fft.magnitudes  = new Float32Array(g.analysis.fft.magnitudes);
    g.analysis.waveform.samples = new Float32Array(g.analysis.waveform.samples);
    g.analysis.damping.envelope = g.analysis.damping.envelope;
    g.analysis.damping.times    = g.analysis.damping.times;
  }
  return g;
});

// ── DOM references ─────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Nav
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

const btnRecord   = $('#btn-record');
const btnUpload   = $('#btn-upload');
const fileInput   = $('#file-input');
const btnAnalyze  = $('#btn-analyze');
const inputName   = $('#guitar-name');
const audioPlayer = $('#audio-player');
const recStatus   = $('#rec-status');
const analysisOut = $('#analysis-output');

btnRecord.addEventListener('click', async () => {
  if (isRecording()) {
    btnRecord.textContent = 'Record';
    btnRecord.classList.remove('recording');
    recStatus.textContent = 'Processing...';
    const { audioBuffer, blob } = await stopRecording();
    currentAnalysis = analyzeAudio(audioBuffer);
    currentBlob = blob;
    audioPlayer.src = URL.createObjectURL(blob);
    audioPlayer.classList.remove('hidden');
    btnAnalyze.classList.remove('hidden');
    recStatus.textContent = `Recorded ${currentAnalysis.duration}s — enter a name and click Analyze.`;
  } else {
    try {
      await startRecording();
      btnRecord.textContent = 'Stop';
      btnRecord.classList.add('recording');
      recStatus.textContent = 'Recording... play your chord and click Stop when done.';
      audioPlayer.classList.add('hidden');
      btnAnalyze.classList.add('hidden');
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
  recStatus.textContent = 'Loading file...';
  const { audioBuffer, blob } = await loadAudioFile(file);
  currentAnalysis = analyzeAudio(audioBuffer);
  currentBlob = blob;
  audioPlayer.src = URL.createObjectURL(blob);
  audioPlayer.classList.remove('hidden');
  btnAnalyze.classList.remove('hidden');
  recStatus.textContent = `Loaded "${file.name}" (${currentAnalysis.duration}s) — enter a name and click Analyze.`;
  if (!inputName.value) inputName.value = file.name.replace(/\.\w+$/, '');
});

btnAnalyze.addEventListener('click', () => {
  const name = inputName.value.trim();
  if (!name) { recStatus.textContent = 'Please enter a guitar name first.'; return; }
  if (!currentAnalysis) return;

  currentAnalysis.name = name;

  // Save
  const id = Date.now().toString(36);
  guitars.push({ id, name, analysis: currentAnalysis });
  saveGuitars();

  renderSingleAnalysis(currentAnalysis);
  recStatus.textContent = `"${name}" saved! You can now compare it on the Compare page.`;
});

function renderSingleAnalysis(a) {
  analysisOut.innerHTML = '';

  // Metrics
  const metrics = document.createElement('div');
  metrics.className = 'metrics-grid';
  metrics.innerHTML = `
    <div class="metric"><span class="metric-value">${a.fundamental} Hz</span><span class="metric-label">Fundamental</span></div>
    <div class="metric"><span class="metric-value">${a.duration} s</span><span class="metric-label">Duration</span></div>
    <div class="metric"><span class="metric-value">${a.sampleRate} Hz</span><span class="metric-label">Sample Rate</span></div>
    <div class="metric"><span class="metric-value">${a.dampingFactor ?? '—'}</span><span class="metric-label">Damping Factor</span></div>
  `;
  analysisOut.appendChild(metrics);

  // Bin powers
  const binRow = document.createElement('div');
  binRow.className = 'metrics-grid bins';
  for (const [b, v] of Object.entries(a.binPowers)) {
    binRow.innerHTML += `<div class="metric"><span class="metric-value">${v}%</span><span class="metric-label">${b}</span></div>`;
  }
  analysisOut.appendChild(binRow);

  // Charts
  const charts = [
    { draw: (c) => drawWaveform(c, a.waveform.samples, a.waveform.sr, `${a.name} — Waveform`) },
    { draw: (c) => drawFFT(c, a.fft.frequencies, a.fft.magnitudes, `${a.name} — Frequency Spectrum`) },
    { draw: (c) => drawBinPowers(c, a.binPowers, `${a.name} — Bin Power`) },
    { draw: (c) => drawDamping(c, a.damping.envelope, a.damping.times, `${a.name} — Amplitude Decay`) },
  ];

  for (const { draw } of charts) {
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

  // Checkboxes
  const form = document.createElement('div');
  form.className = 'compare-selector';
  guitars.forEach(g => {
    const label = document.createElement('label');
    label.className = 'compare-check';
    label.innerHTML = `<input type="checkbox" value="${g.id}" checked> ${g.name}`;
    form.appendChild(label);
  });
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.textContent = 'Compare Selected';
  form.appendChild(btn);
  container.appendChild(form);

  const output = document.createElement('div');
  output.id = 'compare-output';
  container.appendChild(output);

  btn.addEventListener('click', () => {
    const checked = [...form.querySelectorAll('input:checked')].map(i => i.value);
    const selected = guitars.filter(g => checked.includes(g.id));
    if (selected.length < 2) { output.innerHTML = '<p class="hint">Select at least 2.</p>'; return; }
    renderComparison(selected.map(g => g.analysis), output);
  });

  // Auto-run
  renderComparison(guitars.map(g => g.analysis), output);
}

function renderComparison(analyses, container) {
  container.innerHTML = '';

  // Summary table
  const table = document.createElement('table');
  table.className = 'compare-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Guitar</th><th>Fundamental</th><th>Duration</th><th>Damping</th>
        ${Object.keys(analyses[0].binPowers).map(b => `<th>${b}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${analyses.map(a => `<tr>
        <td><strong>${a.name}</strong></td>
        <td>${a.fundamental} Hz</td>
        <td>${a.duration} s</td>
        <td>${a.dampingFactor ?? '—'}</td>
        ${Object.values(a.binPowers).map(v => `<td>${v}%</td>`).join('')}
      </tr>`).join('')}
    </tbody>
  `;
  container.appendChild(table);

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
    const card = document.createElement('div');
    card.className = 'library-card';
    card.innerHTML = `
      <div class="library-card-header">
        <h3>${g.name}</h3>
        <div>
          <button class="btn small" data-action="view" data-id="${g.id}">View</button>
          <button class="btn small danger" data-action="delete" data-id="${g.id}">Delete</button>
        </div>
      </div>
      <div class="library-card-meta">
        Fundamental: ${g.analysis.fundamental} Hz · Duration: ${g.analysis.duration}s · Damping: ${g.analysis.dampingFactor ?? '—'}
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
