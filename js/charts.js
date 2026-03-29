/**
 * Chart rendering using Canvas 2D — no external dependencies.
 */

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const BIN_COLORS = { bass: '#3b82f6', mid: '#10b981', highmid: '#f59e0b', uppermid: '#ef4444', presence: '#8b5cf6', brillance: '#ec4899' };

function themeColors() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    axis:  dark ? '#475569' : '#c4c6cc',
    grid:  dark ? '#334155' : '#dddee2',
    label: dark ? '#94a3b8' : '#787d8a',
    text:  dark ? '#e2e8f0' : '#2e3039',
  };
}

function safeMax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

const DB_ABS_FLOOR = -80;
const LOG_MIN_FREQ = 50;
const LOG_MAX_FREQ = 5000;
const LOG_MIN = Math.log10(LOG_MIN_FREQ);
const LOG_MAX = Math.log10(LOG_MAX_FREQ);
const LOG_RANGE = LOG_MAX - LOG_MIN;
const FREQ_TICKS = [50, 100, 200, 500, 1000, 2000, 5000];

function magToDb(mag) {
  if (mag <= 0) return DB_ABS_FLOOR;
  const db = 20 * Math.log10(mag);
  return db < DB_ABS_FLOOR ? DB_ABS_FLOOR : db;
}

function computeDbFloor(frequencies, magnitudes, peakDb) {
  let minDb = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] < LOG_MIN_FREQ) continue;
    if (frequencies[i] > LOG_MAX_FREQ) break;
    if (magnitudes[i] > 0) {
      const db = 20 * Math.log10(magnitudes[i]) - peakDb;
      if (db < minDb) minDb = db;
    }
  }
  const floor = Math.floor(minDb / 5) * 5 - 2;
  return Math.max(floor, -80);
}

function freqToX(freq, ox, plotW) {
  if (freq <= 0) return ox;
  const logF = Math.log10(Math.max(freq, LOG_MIN_FREQ));
  return ox + ((logF - LOG_MIN) / LOG_RANGE) * plotW;
}

function drawRefLines(ctx, referenceFreqs, ox, plotW, top, plotH) {
  if (!referenceFreqs || !referenceFreqs.length) return;
  const REF_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
  referenceFreqs.forEach((ref, ri) => {
    if (ref.hz > LOG_MAX_FREQ || ref.hz < LOG_MIN_FREQ) return;
    const x = freqToX(ref.hz, ox, plotW);
    ctx.strokeStyle = REF_COLORS[ri % REF_COLORS.length];
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = REF_COLORS[ri % REF_COLORS.length];
    ctx.font = 'bold 9px Inter, system-ui, sans-serif';
    const labelW = ctx.measureText(ref.name).width;
    const stagger = (ri % 2) * 12;
    ctx.fillText(ref.name, x - labelW / 2, top + 10 + stagger);
  });
}

function drawFreqTicks(ctx, ox, plotW, top, plotH) {
  const tc = themeColors();
  ctx.fillStyle = tc.label;
  ctx.font = '10px Inter, system-ui, sans-serif';
  for (const f of FREQ_TICKS) {
    const x = freqToX(f, ox, plotW);
    const label = f >= 1000 ? (f / 1000) + 'k' : String(f);
    ctx.fillText(label, x - ctx.measureText(label).width / 2, top + plotH + 14);
  }
}

function setupCanvas(canvas, title) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  ctx.fillStyle = isDark ? '#e2e8f0' : '#2e3039';
  ctx.font = 'bold 13px Inter, system-ui, sans-serif';
  ctx.fillText(title, 12, 20);

  return { ctx, w: rect.width, h: rect.height, isDark };
}

export function drawWaveform(canvas, samples, sr, title = 'Waveform') {
  const { ctx, w, h } = setupCanvas(canvas, title);
  const tc = themeColors();
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const plotW = w - 50;
  const ox = 40;

  // Axes
  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // Labels
  ctx.fillStyle = tc.label;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('Time (s)', ox + plotW / 2 - 20, h - 4);
  ctx.save();
  ctx.translate(12, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Amplitude', -25, 0);
  ctx.restore();

  // Downsample for drawing
  const maxPoints = Math.floor(plotW * 2);
  const step = Math.max(1, Math.floor(samples.length / maxPoints));
  const duration = samples.length / sr;

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  let maxAmp = 0;
  for (let i = 0; i < samples.length; i += step) {
    if (Math.abs(samples[i]) > maxAmp) maxAmp = Math.abs(samples[i]);
  }
  maxAmp = maxAmp || 1;

  for (let i = 0; i < samples.length; i += step) {
    const x = ox + (i / samples.length) * plotW;
    const y = top + plotH / 2 - (samples[i] / maxAmp) * (plotH / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Time ticks
  ctx.fillStyle = tc.label;
  ctx.font = '10px Inter, system-ui, sans-serif';
  for (let t = 0; t <= duration; t += Math.max(0.5, Math.round(duration / 6))) {
    const x = ox + (t / duration) * plotW;
    ctx.fillText(t.toFixed(1), x - 8, top + plotH + 14);
  }
}

export function drawFFT(canvas, frequencies, magnitudes, title = 'Frequency Spectrum (dB)', color = '#7c3aed', referenceFreqs = null) {
  const { ctx, w, h } = setupCanvas(canvas, title);
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const plotW = w - 56;
  const ox = 48;

  // Peak-normalize so tallest spike sits at 0 dB
  let peakMag = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= LOG_MIN_FREQ && frequencies[i] <= LOG_MAX_FREQ && magnitudes[i] > peakMag)
      peakMag = magnitudes[i];
  }
  const peakDb = peakMag > 0 ? 20 * Math.log10(peakMag) : 0;
  const dbFloor = computeDbFloor(frequencies, magnitudes, peakDb);
  const rangeDb = -dbFloor;

  function yFromMag(mag) {
    const db = magToDb(mag) - peakDb;
    const clamped = Math.max(db, dbFloor);
    return top + plotH - ((clamped - dbFloor) / rangeDb) * plotH;
  }

  const tc = themeColors();
  drawRefLines(ctx, referenceFreqs, ox, plotW, top, plotH);

  // Axes
  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // dB grid
  for (let db = 0; db >= dbFloor; db -= 10) {
    const y = top + plotH - ((db - dbFloor) / rangeDb) * plotH;
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = tc.label;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`${db}`, ox - 28, y + 4);
  }

  ctx.fillStyle = tc.label;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('Frequency (Hz)', ox + plotW / 2 - 35, h - 4);
  ctx.save();
  ctx.translate(10, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('dB', -6, 0);
  ctx.restore();

  // Spectrum curve (log-x)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < frequencies.length; i++) {
    const f = frequencies[i];
    if (f < LOG_MIN_FREQ) continue;
    if (f > LOG_MAX_FREQ) break;
    const x = freqToX(f, ox, plotW);
    const y = yFromMag(magnitudes[i]);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  drawFreqTicks(ctx, ox, plotW, top, plotH);
}

export function drawBinPowers(canvas, binPowers, title = 'Frequency Bin Power') {
  const { ctx, w, h } = setupCanvas(canvas, title);
  const tc = themeColors();
  const top = 36, bot = 36;
  const plotH = h - top - bot;
  const plotW = w - 60;
  const ox = 50;

  const bins = Object.keys(binPowers);
  const vals = Object.values(binPowers);
  const maxVal = Math.max(safeMax(vals), 1);
  const barW = plotW / bins.length - 8;

  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  bins.forEach((b, i) => {
    const x = ox + i * (barW + 8) + 4;
    const barH = (vals[i] / maxVal) * plotH;
    ctx.fillStyle = BIN_COLORS[b] || COLORS[i];
    ctx.fillRect(x, top + plotH - barH, barW, barH);

    ctx.fillStyle = tc.text;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`${vals[i]}%`, x + barW / 2 - 12, top + plotH - barH - 4);

    ctx.fillStyle = tc.label;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.save();
    ctx.translate(x + barW / 2 + 3, top + plotH + 14);
    ctx.fillText(b, 0, 0);
    ctx.restore();
  });
}

export function drawDamping(canvas, envelope, times, title = 'Amplitude Decay') {
  if (!envelope || !times || envelope.length < 2) return;
  const { ctx, w, h } = setupCanvas(canvas, title);
  const tc = themeColors();
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const plotW = w - 50;
  const ox = 40;

  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  ctx.fillStyle = tc.label;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('Time (s)', ox + plotW / 2 - 20, h - 4);

  const maxEnv = safeMax(envelope) || 1;
  const maxTime = times[times.length - 1];

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < envelope.length; i++) {
    const x = ox + (times[i] / maxTime) * plotW;
    const y = top + plotH - (envelope[i] / maxEnv) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── Comparison charts ──────────────────────────────────────────────────

export function drawFFTOverlay(canvas, analyses, referenceFreqs = null) {
  const { ctx, w, h } = setupCanvas(canvas, 'Frequency Spectrum Comparison (dB)');
  const top = 36, bot = 40;
  const plotH = h - top - bot;
  const plotW = w - 56;
  const ox = 48;

  // Dynamic floor across all analyses
  let globalMinDb = 0;
  for (const a of analyses) {
    const floor = computeDbFloor(a.fft.frequencies, a.fft.magnitudes, 0);
    if (floor < globalMinDb) globalMinDb = floor;
  }
  const dbFloor = globalMinDb;
  const rangeDb = -dbFloor;

  function yFromMag(mag) {
    const db = magToDb(mag);
    const clamped = Math.max(db, dbFloor);
    return top + plotH - ((clamped - dbFloor) / rangeDb) * plotH;
  }

  drawRefLines(ctx, referenceFreqs, ox, plotW, top, plotH);

  const tc = themeColors();

  // Axes
  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // dB grid
  for (let db = 0; db >= dbFloor; db -= 10) {
    const y = top + plotH - ((db - dbFloor) / rangeDb) * plotH;
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = tc.label;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`${db}`, ox - 28, y + 4);
  }

  ctx.fillStyle = tc.label;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('Frequency (Hz)', ox + plotW / 2 - 35, h - 18);

  analyses.forEach((a, ci) => {
    const { frequencies, magnitudes } = a.fft;
    ctx.strokeStyle = COLORS[ci % COLORS.length];
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < frequencies.length; i++) {
      const f = frequencies[i];
      if (f < LOG_MIN_FREQ) continue;
      if (f > LOG_MAX_FREQ) break;
      const x = freqToX(f, ox, plotW);
      const y = yFromMag(magnitudes[i]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  drawFreqTicks(ctx, ox, plotW, top, plotH);

  // Legend
  const legendY = h - 6;
  let legendX = ox;
  analyses.forEach((a, ci) => {
    ctx.fillStyle = COLORS[ci % COLORS.length];
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = tc.text;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(a.name, legendX + 16, legendY + 2);
    legendX += ctx.measureText(a.name).width + 32;
  });
}

export function drawBinPowerCompare(canvas, analyses) {
  const { ctx, w, h } = setupCanvas(canvas, 'Frequency Bin Power Comparison');
  const tc = themeColors();
  const top = 36, bot = 44;
  const plotH = h - top - bot;
  const plotW = w - 60;
  const ox = 50;

  const bins = Object.keys(analyses[0].binPowers);
  const n = analyses.length;
  const groupW = plotW / bins.length;
  const barW = (groupW - 8) / n;

  let maxVal = 1;
  for (const a of analyses) {
    for (const v of Object.values(a.binPowers)) {
      if (v > maxVal) maxVal = v;
    }
  }

  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  bins.forEach((b, bi) => {
    analyses.forEach((a, ci) => {
      const x = ox + bi * groupW + ci * barW + 4;
      const val = a.binPowers[b] || 0;
      const barH = (val / maxVal) * plotH;
      ctx.fillStyle = COLORS[ci % COLORS.length];
      ctx.fillRect(x, top + plotH - barH, barW - 1, barH);
    });

    ctx.fillStyle = tc.label;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(b, ox + bi * groupW + groupW / 2 - 15, top + plotH + 14);
  });

  // Legend
  const legendY = h - 6;
  let legendX = ox;
  analyses.forEach((a, ci) => {
    ctx.fillStyle = COLORS[ci % COLORS.length];
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = tc.text;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(a.name, legendX + 16, legendY + 2);
    legendX += ctx.measureText(a.name).width + 32;
  });
}

// ── Harmonic Decay Comparison Charts ──────────────────────────────────

export function drawDecayRateCompare(canvas, analyses) {
  const valid = analyses.filter(a => a.harmonicDecay && a.harmonicDecay.harmonics && a.harmonicDecay.harmonics.length);
  if (valid.length < 2) return;
  const { ctx, w, h } = setupCanvas(canvas, 'Harmonic Decay Rate Comparison');
  const tc = themeColors();
  const top = 36, bot = 44;
  const plotH = h - top - bot;
  const plotW = w - 60;
  const ox = 50;

  const maxH = Math.max(...valid.map(a => a.harmonicDecay.harmonics.length));
  const labels = [];
  for (let i = 0; i < maxH; i++) labels.push(i === 0 ? 'Fund.' : `${i + 1}×`);

  const n = valid.length;
  const groupW = plotW / labels.length;
  const barW = Math.min((groupW - 6) / n, 24);

  let maxRate = 1;
  for (const a of valid) {
    for (const harm of a.harmonicDecay.harmonics) {
      if (harm.decayRate && harm.decayRate > maxRate) maxRate = harm.decayRate;
    }
  }

  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // Y grid
  const yStep = maxRate <= 5 ? 1 : maxRate <= 20 ? 5 : 10;
  for (let v = 0; v <= maxRate; v += yStep) {
    const y = top + plotH - (v / maxRate) * plotH;
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = tc.label;
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillText(v.toFixed(v < 1 ? 1 : 0), ox - 24, y + 3);
  }

  labels.forEach((label, li) => {
    valid.forEach((a, ci) => {
      const harm = a.harmonicDecay.harmonics[li];
      const rate = harm && harm.decayRate && harm.decayRate > 0 ? harm.decayRate : 0;
      const x = ox + li * groupW + (groupW - n * barW) / 2 + ci * barW;
      const barH = (rate / maxRate) * plotH;
      ctx.fillStyle = COLORS[ci % COLORS.length];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, top + plotH - barH, barW - 1, barH);
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = tc.label;
    ctx.font = '9px Inter, system-ui, sans-serif';
    const lw = ctx.measureText(label).width;
    ctx.fillText(label, ox + li * groupW + groupW / 2 - lw / 2, top + plotH + 13);
  });

  // Y label
  ctx.save();
  ctx.translate(10, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tc.label;
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('Decay rate (1/s)', -35, 0);
  ctx.restore();

  // Legend
  const legendY = h - 4;
  let legendX = ox;
  ctx.font = '10px Inter, system-ui, sans-serif';
  valid.forEach((a, ci) => {
    ctx.fillStyle = COLORS[ci % COLORS.length];
    ctx.fillRect(legendX, legendY - 8, 10, 10);
    ctx.fillStyle = tc.text;
    ctx.fillText(a.name, legendX + 14, legendY);
    legendX += ctx.measureText(a.name).width + 28;
  });
}

export function drawHarmonicDecayCompare(canvas, analyses) {
  const valid = analyses.filter(a => a.harmonicDecay && a.harmonicDecay.harmonics && a.harmonicDecay.harmonics.length);
  if (valid.length < 2) return;
  const { ctx, w, h } = setupCanvas(canvas, 'Fundamental & Harmonic Sustain Comparison');
  const tc = themeColors();
  const top = 36, bot = 42;
  const plotH = h - top - bot;
  const plotW = w - 56;
  const ox = 48;

  let maxT = 0;
  let globalPeak = 0;
  for (const a of valid) {
    const hd = a.harmonicDecay;
    const t = hd.times[hd.times.length - 1];
    if (t > maxT) maxT = t;
    for (const harm of hd.harmonics) {
      for (const v of harm.amplitudes) { if (v > globalPeak) globalPeak = v; }
    }
  }
  if (maxT === 0) maxT = 1;
  if (globalPeak === 0) globalPeak = 1;

  const dbFloor = -50;

  // Axes
  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // dB grid
  for (let db = 0; db >= dbFloor; db -= 10) {
    const y = top + plotH * (-db / -dbFloor);
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = tc.label;
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillText(`${db}`, ox - 26, y + 3);
  }

  // Draw only fundamental (h=1) and 2nd harmonic for each guitar — keeps it readable
  const showHarmonics = [0, 1];
  const lineStyles = [[], [6, 4]];

  valid.forEach((a, gi) => {
    const hd = a.harmonicDecay;
    const baseColor = COLORS[gi % COLORS.length];

    showHarmonics.forEach((hi, si) => {
      if (hi >= hd.harmonics.length) return;
      const harm = hd.harmonics[hi];
      const alpha = hi === 0 ? 1.0 : 0.6;
      ctx.strokeStyle = baseColor;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = hi === 0 ? 2 : 1.2;
      ctx.setLineDash(lineStyles[si]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < harm.amplitudes.length; i++) {
        const x = ox + (hd.times[i] / maxT) * plotW;
        const mag = harm.amplitudes[i];
        const db = mag > 0 ? 20 * Math.log10(mag / globalPeak) : dbFloor;
        const clamped = Math.max(db, dbFloor);
        const y = top + plotH * (-clamped / -dbFloor);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  });

  // Time ticks
  ctx.fillStyle = tc.label;
  ctx.font = '9px Inter, system-ui, sans-serif';
  const tStep = maxT <= 2 ? 0.5 : maxT <= 4 ? 1 : 2;
  for (let t = 0; t <= maxT; t += tStep) {
    const x = ox + (t / maxT) * plotW;
    ctx.fillText(t.toFixed(1) + 's', x - 8, top + plotH + 13);
  }

  // Y-axis label
  ctx.save();
  ctx.translate(10, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tc.label;
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('dB', -6, 0);
  ctx.restore();

  // Legend
  const legendY = h - 4;
  let legendX = ox;
  ctx.font = '9px Inter, system-ui, sans-serif';
  valid.forEach((a, gi) => {
    const color = COLORS[gi % COLORS.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY - 3);
    ctx.lineTo(legendX + 14, legendY - 3);
    ctx.stroke();
    ctx.fillStyle = tc.text;
    ctx.fillText(a.name + ' (fund.)', legendX + 18, legendY);
    legendX += ctx.measureText(a.name + ' (fund.)').width + 28;

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(legendX, legendY - 3);
    ctx.lineTo(legendX + 14, legendY - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = tc.text;
    ctx.fillText('2×', legendX + 18, legendY);
    legendX += ctx.measureText('2×').width + 28;
  });
}

// ── Spectrogram ───────────────────────────────────────────────────────

const SPEC_STOPS = [
  [0.00,   2,   2,  12],
  [0.15,  30,   4,  70],
  [0.30,  90,  10,  90],
  [0.45, 160,  30,  70],
  [0.60, 210,  70,  30],
  [0.75, 240, 150,  20],
  [0.90, 255, 220,  80],
  [1.00, 255, 255, 220],
];

function spectrogramRGB(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < SPEC_STOPS.length - 1; i++) {
    if (t <= SPEC_STOPS[i + 1][0]) {
      const ratio = (t - SPEC_STOPS[i][0]) / (SPEC_STOPS[i + 1][0] - SPEC_STOPS[i][0]);
      return [
        Math.round(SPEC_STOPS[i][1] + ratio * (SPEC_STOPS[i + 1][1] - SPEC_STOPS[i][1])),
        Math.round(SPEC_STOPS[i][2] + ratio * (SPEC_STOPS[i + 1][2] - SPEC_STOPS[i][2])),
        Math.round(SPEC_STOPS[i][3] + ratio * (SPEC_STOPS[i + 1][3] - SPEC_STOPS[i][3])),
      ];
    }
  }
  return [255, 255, 220];
}

export function drawSpectrogram(canvas, stftData, title = 'Spectrogram', referenceFreqs = null) {
  if (!stftData || !stftData.data || !stftData.data.length) return;
  const { ctx, w, h } = setupCanvas(canvas, title);
  const tc = themeColors();
  const top = 36, bot = 30, left = 48, right = 54;
  const plotW = w - left - right;
  const plotH = h - top - bot;

  const { times, frequencies, numBins, data } = stftData;
  const numFrames = times.length;

  const minF = Math.max(frequencies[0] || 50, 50);
  const maxF = Math.min(frequencies[frequencies.length - 1] || 5000, 5000);
  const logMinF = Math.log10(minF);
  const logMaxF = Math.log10(maxF);
  const logRangeF = logMaxF - logMinF;

  let peak = 0;
  for (let i = 0; i < data.length; i++) { if (data[i] > peak) peak = data[i]; }
  if (peak === 0) peak = 1;

  const cellW = Math.ceil(plotW / numFrames) + 1;
  for (let t = 0; t < numFrames; t++) {
    const x = left + (t / numFrames) * plotW;
    for (let f = 0; f < numBins - 1; f++) {
      const freq = frequencies[f];
      const nextFreq = frequencies[f + 1];
      if (freq < minF || freq > maxF) continue;

      const logF = Math.log10(freq);
      const logFN = Math.log10(Math.min(nextFreq, maxF));
      const y1 = top + plotH * (1 - (logF - logMinF) / logRangeF);
      const y2 = top + plotH * (1 - (logFN - logMinF) / logRangeF);

      const mag = data[t * numBins + f];
      const db = mag > 0 ? 20 * Math.log10(mag / peak) : -80;
      const norm = Math.max(0, (db + 80) / 80);

      const [r, g, b] = spectrogramRGB(norm);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y2, cellW, Math.max(y1 - y2, 1));
    }
  }

  if (referenceFreqs) {
    for (const ref of referenceFreqs) {
      if (ref.hz < minF || ref.hz > maxF) continue;
      const logF = Math.log10(ref.hz);
      const y = top + plotH * (1 - (logF - logMinF) / logRangeF);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 8px Inter, system-ui, sans-serif';
      ctx.fillText(ref.name, left + plotW + 3, y + 3);
    }
  }

  // Axes
  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotH);
  ctx.lineTo(left + plotW, top + plotH);
  ctx.stroke();

  // Y-axis freq ticks (log-spaced)
  ctx.fillStyle = tc.label;
  ctx.font = '9px Inter, system-ui, sans-serif';
  for (const f of [100, 200, 500, 1000, 2000, 5000]) {
    if (f < minF || f > maxF) continue;
    const logF = Math.log10(f);
    const y = top + plotH * (1 - (logF - logMinF) / logRangeF);
    const label = f >= 1000 ? (f / 1000) + 'k' : String(f);
    ctx.fillText(label, left - ctx.measureText(label).width - 4, y + 3);
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + plotW, y);
    ctx.stroke();
  }

  // X-axis time ticks
  ctx.fillStyle = tc.label;
  ctx.font = '9px Inter, system-ui, sans-serif';
  const maxT = times[times.length - 1];
  const tStep = maxT <= 2 ? 0.5 : maxT <= 4 ? 1 : 2;
  for (let t = 0; t <= maxT; t += tStep) {
    const x = left + (t / maxT) * plotW;
    ctx.fillText(t.toFixed(1) + 's', x - 8, top + plotH + 13);
  }

  // Y-axis label
  ctx.save();
  ctx.translate(10, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tc.label;
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('Hz', -8, 0);
  ctx.restore();
}

// ── Harmonic Decay Chart ──────────────────────────────────────────────

const HARMONIC_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function drawHarmonicDecay(canvas, harmonicDecay, title = 'Harmonic Decay Over Time') {
  if (!harmonicDecay || !harmonicDecay.harmonics || !harmonicDecay.harmonics.length) return;
  const { ctx, w, h } = setupCanvas(canvas, title);
  const tc = themeColors();
  const top = 36, bot = 40;
  const plotH = h - top - bot;
  const plotW = w - 56;
  const ox = 48;

  const { times, harmonics } = harmonicDecay;
  const maxT = times[times.length - 1] || 1;

  let globalPeak = 0;
  for (const harm of harmonics) {
    for (const a of harm.amplitudes) { if (a > globalPeak) globalPeak = a; }
  }
  if (globalPeak === 0) globalPeak = 1;

  const dbFloor = -60;

  // Axes
  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // dB grid
  for (let db = 0; db >= dbFloor; db -= 20) {
    const y = top + plotH * (-db / -dbFloor);
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = tc.label;
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillText(`${db}`, ox - 26, y + 3);
  }

  // Draw each harmonic as a line
  harmonics.forEach((harm, hi) => {
    ctx.strokeStyle = HARMONIC_COLORS[hi % HARMONIC_COLORS.length];
    ctx.lineWidth = hi === 0 ? 2 : 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < harm.amplitudes.length; i++) {
      const x = ox + (times[i] / maxT) * plotW;
      const mag = harm.amplitudes[i];
      const db = mag > 0 ? 20 * Math.log10(mag / globalPeak) : dbFloor;
      const clamped = Math.max(db, dbFloor);
      const y = top + plotH * (-clamped / -dbFloor);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  // Time ticks
  ctx.fillStyle = tc.label;
  ctx.font = '9px Inter, system-ui, sans-serif';
  const tStep = maxT <= 2 ? 0.5 : maxT <= 4 ? 1 : 2;
  for (let t = 0; t <= maxT; t += tStep) {
    const x = ox + (t / maxT) * plotW;
    ctx.fillText(t.toFixed(1) + 's', x - 8, top + plotH + 13);
  }

  // Legend
  const legendY = h - 4;
  let legendX = ox;
  ctx.font = '9px Inter, system-ui, sans-serif';
  harmonics.forEach((harm, hi) => {
    const color = HARMONIC_COLORS[hi % HARMONIC_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY - 7, 8, 8);
    const hzLabel = harm.hz ? `${Math.round(harm.hz)}` : '';
    const label = harm.harmonic === 1 ? `Fund.${hzLabel ? ' ' + hzLabel : ''}` : `${harm.harmonic}× ${hzLabel}`;
    ctx.fillStyle = tc.text;
    ctx.fillText(label, legendX + 11, legendY);
    legendX += ctx.measureText(label).width + 20;
  });

  // Y-axis label
  ctx.save();
  ctx.translate(10, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tc.label;
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('dB', -6, 0);
  ctx.restore();
}

export function drawMirrorFFT(canvas, a1, a2) {
  const { ctx, w, h } = setupCanvas(canvas, `Mirror FFT (dB) — ${a1.name} vs ${a2.name}`);
  const tc = themeColors();
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const halfH = plotH / 2;
  const plotW = w - 56;
  const ox = 48;
  const midY = top + halfH;

  const floor1 = computeDbFloor(a1.fft.frequencies, a1.fft.magnitudes, 0);
  const floor2 = computeDbFloor(a2.fft.frequencies, a2.fft.magnitudes, 0);
  const dbFloor = Math.min(floor1, floor2);
  const rangeDb = -dbFloor;

  ctx.strokeStyle = tc.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // Zero line
  ctx.strokeStyle = tc.label;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(ox, midY);
  ctx.lineTo(ox + plotW, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  // dB ticks (each half)
  ctx.font = '9px Inter, system-ui, sans-serif';
  for (let db = 0; db >= dbFloor; db -= 20) {
    const offset = ((db - dbFloor) / rangeDb) * halfH;
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ox, midY - offset);
    ctx.lineTo(ox + plotW, midY - offset);
    ctx.moveTo(ox, midY + offset);
    ctx.lineTo(ox + plotW, midY + offset);
    ctx.stroke();
    if (db < 0) {
      ctx.fillStyle = tc.label;
      ctx.fillText(`${db}`, ox - 26, midY - offset + 3);
      ctx.fillText(`${db}`, ox - 26, midY + offset + 3);
    }
  }

  function plotSide(fft, yDir, color) {
    const { frequencies, magnitudes } = fft;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < frequencies.length; i++) {
      const f = frequencies[i];
      if (f < LOG_MIN_FREQ) continue;
      if (f > LOG_MAX_FREQ) break;
      const x = freqToX(f, ox, plotW);
      const db = Math.max(magToDb(magnitudes[i]), dbFloor);
      const norm = (db - dbFloor) / rangeDb;
      const y = midY - yDir * norm * halfH;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  plotSide(a1.fft, 1, '#3b82f6');
  plotSide(a2.fft, -1, '#ef4444');

  drawFreqTicks(ctx, ox, plotW, top, plotH);

  // Labels
  ctx.fillStyle = '#3b82f6';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText(a1.name, ox + plotW - 80, top + 14);
  ctx.fillStyle = '#ef4444';
  ctx.fillText(a2.name, ox + plotW - 80, top + plotH - 6);
}
