/**
 * Chart rendering using Canvas 2D — no external dependencies.
 */

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const BIN_COLORS = { bass: '#3b82f6', mid: '#10b981', highmid: '#f59e0b', uppermid: '#ef4444', presence: '#8b5cf6', brillance: '#ec4899' };

function safeMax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

const DB_FLOOR = -32;
const LOG_MIN_FREQ = 50;
const LOG_MAX_FREQ = 5000;
const LOG_MIN = Math.log10(LOG_MIN_FREQ);
const LOG_MAX = Math.log10(LOG_MAX_FREQ);
const LOG_RANGE = LOG_MAX - LOG_MIN;
const FREQ_TICKS = [50, 100, 200, 500, 1000, 2000, 5000];

function magToDb(mag) {
  if (mag <= 0) return DB_FLOOR;
  const db = 20 * Math.log10(mag);
  return db < DB_FLOOR ? DB_FLOOR : db;
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
  ctx.fillStyle = '#94a3b8';
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

  // Title
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx.fillText(title, 12, 22);

  return { ctx, w: rect.width, h: rect.height };
}

export function drawWaveform(canvas, samples, sr, title = 'Waveform') {
  const { ctx, w, h } = setupCanvas(canvas, title);
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const plotW = w - 50;
  const ox = 40;

  // Axes
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#94a3b8';
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
  ctx.fillStyle = '#94a3b8';
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
  const rangeDb = -DB_FLOOR;

  // Peak-normalize so tallest spike sits at 0 dB
  let peakMag = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= LOG_MIN_FREQ && frequencies[i] <= LOG_MAX_FREQ && magnitudes[i] > peakMag)
      peakMag = magnitudes[i];
  }
  const peakDb = peakMag > 0 ? 20 * Math.log10(peakMag) : 0;
  function yFromMag(mag) {
    const db = magToDb(mag) - peakDb;
    return top + plotH - ((db - DB_FLOOR) / rangeDb) * plotH;
  }

  drawRefLines(ctx, referenceFreqs, ox, plotW, top, plotH);

  // Axes
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // dB grid
  for (let db = 0; db >= DB_FLOOR; db -= 10) {
    const y = top + plotH - ((db - DB_FLOOR) / rangeDb) * plotH;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`${db}`, ox - 28, y + 4);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('Frequency (Hz)', ox + plotW / 2 - 35, h - 4);
  ctx.save();
  ctx.translate(10, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('dB', -6, 0);
  ctx.restore();

  // Spectrum curve (log-x)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
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
  const top = 36, bot = 36;
  const plotH = h - top - bot;
  const plotW = w - 60;
  const ox = 50;

  const bins = Object.keys(binPowers);
  const vals = Object.values(binPowers);
  const maxVal = Math.max(safeMax(vals), 1);
  const barW = plotW / bins.length - 8;

  ctx.strokeStyle = '#475569';
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

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`${vals[i]}%`, x + barW / 2 - 12, top + plotH - barH - 4);

    ctx.fillStyle = '#94a3b8';
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
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const plotW = w - 50;
  const ox = 40;

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
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
  const rangeDb = -DB_FLOOR;

  function yFromMag(mag) {
    const db = magToDb(mag);
    return top + plotH - ((db - DB_FLOOR) / rangeDb) * plotH;
  }

  drawRefLines(ctx, referenceFreqs, ox, plotW, top, plotH);

  // Axes
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // dB grid
  for (let db = 0; db >= DB_FLOOR; db -= 10) {
    const y = top + plotH - ((db - DB_FLOOR) / rangeDb) * plotH;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + plotW, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`${db}`, ox - 28, y + 4);
  }

  ctx.fillStyle = '#94a3b8';
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
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(a.name, legendX + 16, legendY + 2);
    legendX += ctx.measureText(a.name).width + 32;
  });
}

export function drawBinPowerCompare(canvas, analyses) {
  const { ctx, w, h } = setupCanvas(canvas, 'Frequency Bin Power Comparison');
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

  ctx.strokeStyle = '#475569';
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

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(b, ox + bi * groupW + groupW / 2 - 15, top + plotH + 14);
  });

  // Legend
  const legendY = h - 6;
  let legendX = ox;
  analyses.forEach((a, ci) => {
    ctx.fillStyle = COLORS[ci % COLORS.length];
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(a.name, legendX + 16, legendY + 2);
    legendX += ctx.measureText(a.name).width + 32;
  });
}

export function drawMirrorFFT(canvas, a1, a2) {
  const { ctx, w, h } = setupCanvas(canvas, `Mirror FFT (dB) — ${a1.name} vs ${a2.name}`);
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const halfH = plotH / 2;
  const plotW = w - 56;
  const ox = 48;
  const midY = top + halfH;
  const rangeDb = -DB_FLOOR;

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  // Zero line
  ctx.strokeStyle = '#64748b';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(ox, midY);
  ctx.lineTo(ox + plotW, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  // dB ticks (each half)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px Inter, system-ui, sans-serif';
  for (let db = 0; db >= DB_FLOOR; db -= 20) {
    const offset = ((db - DB_FLOOR) / rangeDb) * halfH;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ox, midY - offset);
    ctx.lineTo(ox + plotW, midY - offset);
    ctx.moveTo(ox, midY + offset);
    ctx.lineTo(ox + plotW, midY + offset);
    ctx.stroke();
    if (db < 0) {
      ctx.fillStyle = '#94a3b8';
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
      const db = magToDb(magnitudes[i]);
      const norm = (db - DB_FLOOR) / rangeDb;
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
