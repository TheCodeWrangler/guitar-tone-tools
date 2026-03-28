/**
 * Chart rendering using Canvas 2D — no external dependencies.
 */

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const BIN_COLORS = { bass: '#3b82f6', mid: '#10b981', highmid: '#f59e0b', uppermid: '#ef4444', presence: '#8b5cf6', brillance: '#ec4899' };

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

export function drawFFT(canvas, frequencies, magnitudes, title = 'Frequency Spectrum', color = '#7c3aed') {
  const { ctx, w, h } = setupCanvas(canvas, title);
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const plotW = w - 50;
  const ox = 40;

  // Limit to 5000 Hz
  let maxIdx = frequencies.length;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] > 5000) { maxIdx = i; break; }
  }

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, top);
  ctx.lineTo(ox, top + plotH);
  ctx.lineTo(ox + plotW, top + plotH);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('Frequency (Hz)', ox + plotW / 2 - 35, h - 4);

  const step = Math.max(1, Math.floor(maxIdx / (plotW * 2)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < maxIdx; i += step) {
    const x = ox + (i / maxIdx) * plotW;
    const y = top + plotH - magnitudes[i] * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Freq ticks
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px Inter, system-ui, sans-serif';
  const maxFreq = frequencies[maxIdx - 1] || 5000;
  for (let f = 0; f <= maxFreq; f += 1000) {
    const x = ox + (f / maxFreq) * plotW;
    ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x - 8, top + plotH + 14);
  }
}

export function drawBinPowers(canvas, binPowers, title = 'Frequency Bin Power') {
  const { ctx, w, h } = setupCanvas(canvas, title);
  const top = 36, bot = 36;
  const plotH = h - top - bot;
  const plotW = w - 60;
  const ox = 50;

  const bins = Object.keys(binPowers);
  const vals = Object.values(binPowers);
  const maxVal = Math.max(...vals, 1);
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

  const maxEnv = Math.max(...envelope) || 1;
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

export function drawFFTOverlay(canvas, analyses) {
  const { ctx, w, h } = setupCanvas(canvas, 'Frequency Spectrum Comparison');
  const top = 36, bot = 40;
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
  ctx.fillText('Frequency (Hz)', ox + plotW / 2 - 35, h - 18);

  analyses.forEach((a, ci) => {
    const { frequencies, magnitudes } = a.fft;
    let maxIdx = frequencies.length;
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] > 5000) { maxIdx = i; break; }
    }
    const step = Math.max(1, Math.floor(maxIdx / (plotW * 2)));
    ctx.strokeStyle = COLORS[ci % COLORS.length];
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < maxIdx; i += step) {
      const x = ox + (i / maxIdx) * plotW;
      const y = top + plotH - magnitudes[i] * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
  const { ctx, w, h } = setupCanvas(canvas, `Mirror FFT — ${a1.name} vs ${a2.name}`);
  const top = 36, bot = 30;
  const plotH = h - top - bot;
  const halfH = plotH / 2;
  const plotW = w - 50;
  const ox = 40;
  const midY = top + halfH;

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

  function plotSide(fft, yDir, color) {
    const { frequencies, magnitudes } = fft;
    let maxIdx = frequencies.length;
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] > 5000) { maxIdx = i; break; }
    }
    const step = Math.max(1, Math.floor(maxIdx / (plotW * 2)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < maxIdx; i += step) {
      const x = ox + (i / maxIdx) * plotW;
      const y = midY - yDir * magnitudes[i] * halfH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  plotSide(a1.fft, 1, '#3b82f6');
  plotSide(a2.fft, -1, '#ef4444');

  // Labels
  ctx.fillStyle = '#3b82f6';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText(a1.name, ox + plotW - 80, top + 14);
  ctx.fillStyle = '#ef4444';
  ctx.fillText(a2.name, ox + plotW - 80, top + plotH - 6);
}
