/**
 * Guitar tone analysis engine.
 * All DSP runs client-side using the Web Audio API and typed arrays.
 */

const FREQ_BINS = {
  bass:     [0,    200],
  mid:      [200,  800],
  highmid:  [800,  2500],
  uppermid: [2500, 5000],
  presence: [5000, 10000],
  brillance:[10000, 20000],
};

function arrayMax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

// ── Utilities ──────────────────────────────────────────────────────────

function hann(N) {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  return w;
}

function nextPow2(n) {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Real-valued FFT via the Web Audio OfflineAudioContext AnalyserNode.
 * Returns { frequencies: Float32Array, magnitudes: Float32Array } normalised 0–1.
 */
function computeFFT(samples, sampleRate) {
  const N = samples.length;
  const fftSize = nextPow2(N);

  const win = hann(N);
  const windowed = new Float32Array(fftSize);
  for (let i = 0; i < N; i++) windowed[i] = samples[i] * win[i];

  // Manual DFT up to Nyquist — we only need magnitude spectrum
  const halfN = Math.floor(fftSize / 2);
  const magnitudes = new Float32Array(halfN);
  const frequencies = new Float32Array(halfN);
  const freqStep = sampleRate / fftSize;

  for (let k = 0; k < halfN; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / fftSize;
      re += windowed[n] * Math.cos(angle);
      im -= windowed[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(re * re + im * im) / N;
    frequencies[k] = k * freqStep;
  }

  const maxMag = arrayMax(magnitudes) || 1;
  for (let i = 0; i < halfN; i++) magnitudes[i] /= maxMag;

  return { frequencies, magnitudes };
}

/**
 * Optimised FFT using Cooley-Tukey radix-2 DIT.
 */
function fftRadix2(re, im) {
  const N = re.length;
  if (N <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
        const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

function computeFFTFast(samples, sampleRate) {
  const N = samples.length;
  const fftSize = nextPow2(N);

  const win = hann(N);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let i = 0; i < N; i++) re[i] = samples[i] * win[i];

  fftRadix2(re, im);

  const halfN = fftSize >> 1;
  const magnitudes = new Float32Array(halfN);
  const frequencies = new Float32Array(halfN);
  const freqStep = sampleRate / fftSize;

  for (let k = 0; k < halfN; k++) {
    magnitudes[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
    frequencies[k] = k * freqStep;
  }

  const maxMag = arrayMax(magnitudes) || 1;
  for (let i = 0; i < halfN; i++) magnitudes[i] /= maxMag;

  return { frequencies, magnitudes };
}

// ── Core Analysis ──────────────────────────────────────────────────────

function detectFundamental(samples, sampleRate) {
  // Use a longer window for better low-frequency resolution
  const maxSamples = Math.min(samples.length, Math.floor(sampleRate * 0.3));

  // Find onset: first sample exceeding 10% of peak amplitude
  const peak = arrayMax(samples.subarray(0, Math.min(samples.length, sampleRate)));
  let onset = 0;
  for (let i = 0; i < maxSamples; i++) {
    if (Math.abs(samples[i]) > peak * 0.1) { onset = i; break; }
  }

  // 150ms window gives ~12 cycles at 82 Hz (low E) — enough for reliable detection
  const windowSize = Math.min(Math.floor(sampleRate * 0.15), samples.length - onset);
  const buf = samples.subarray(onset, onset + windowSize);
  const N = buf.length;

  // Guitar range: ~70 Hz (drop D) to ~1200 Hz (high frets)
  const minPeriod = Math.floor(sampleRate / 1200);
  const maxPeriod = Math.min(Math.floor(sampleRate / 50), Math.floor(N / 2));
  
  // Compute normalized autocorrelation for all candidate periods
  const correlations = new Float32Array(maxPeriod);
  for (let period = minPeriod; period < maxPeriod; period++) {
    let corr = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < N - period; i++) {
      corr  += buf[i] * buf[i + period];
      norm1 += buf[i] * buf[i];
      norm2 += buf[i + period] * buf[i + period];
    }
    const normFactor = Math.sqrt(norm1 * norm2) || 1;
    correlations[period] = corr / normFactor;
  }

  // Find the best correlation peak
  let bestCorr = -1;
  let bestPeriod = minPeriod;
  for (let period = minPeriod; period < maxPeriod; period++) {
    if (correlations[period] > bestCorr) {
      bestCorr = correlations[period];
      bestPeriod = period;
    }
  }

  // Octave correction: autocorrelation can lock onto the 2nd harmonic.
  // Check if double the period (one octave lower) has a strong correlation.
  // Only step down ONE octave, and require it to be nearly as strong as the
  // original peak. Going further down causes false drops on high strings
  // (B3, E4) where every lower octave correlates well.
  const detectedFreq = sampleRate / bestPeriod;
  const subOctavePeriod = bestPeriod * 2;
  if (subOctavePeriod < maxPeriod && detectedFreq > 100) {
    const searchLo = Math.max(minPeriod, subOctavePeriod - 4);
    const searchHi = Math.min(maxPeriod - 1, subOctavePeriod + 4);
    let subBestCorr = -1;
    let subBestPeriod = subOctavePeriod;
    for (let p = searchLo; p <= searchHi; p++) {
      if (correlations[p] > subBestCorr) {
        subBestCorr = correlations[p];
        subBestPeriod = p;
      }
    }
    // Require 85% strength — conservative to avoid over-correction
    if (subBestCorr > bestCorr * 0.85) {
      bestPeriod = subBestPeriod;
    }
  }

  return sampleRate / bestPeriod;
}

function computeBinPowers(frequencies, magnitudes) {
  const powers = {};
  let total = 0;
  for (const [name, [lo, hi]] of Object.entries(FREQ_BINS)) {
    let power = 0;
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= lo && frequencies[i] < hi) {
        power += magnitudes[i] * magnitudes[i];
      }
    }
    powers[name] = power;
    total += power;
  }
  if (total > 0) {
    for (const k of Object.keys(powers)) {
      powers[k] = Math.round((powers[k] / total) * 1000) / 10;
    }
  }
  return powers;
}

function computeDamping(samples, sampleRate) {
  // Compute the envelope via a sliding RMS window, then fit exponential decay
  const windowMs = 50;
  const windowSamples = Math.floor(sampleRate * windowMs / 1000);
  const step = Math.floor(windowSamples / 2);
  const envelope = [];
  const times = [];

  for (let i = 0; i + windowSamples < samples.length; i += step) {
    let sum = 0;
    for (let j = i; j < i + windowSamples; j++) {
      sum += samples[j] * samples[j];
    }
    envelope.push(Math.sqrt(sum / windowSamples));
    times.push((i + windowSamples / 2) / sampleRate);
  }

  // Find peak and fit from there
  let peakVal = 0, peakIdx = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > peakVal) { peakVal = envelope[i]; peakIdx = i; }
  }
  if (peakVal === 0) return { dampingFactor: null, envelope, times };

  // Simple log-linear fit: ln(env) = ln(A) - factor*t
  const xs = [], ys = [];
  for (let i = peakIdx; i < envelope.length; i++) {
    if (envelope[i] > peakVal * 0.01) {
      xs.push(times[i] - times[peakIdx]);
      ys.push(Math.log(envelope[i]));
    }
  }

  if (xs.length < 3) return { dampingFactor: null, envelope, times };

  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const dampingFactor = -slope; // positive value = rate of decay

  return { dampingFactor: Math.round(dampingFactor * 1000) / 1000, envelope, times };
}


// ── STFT (Short-Time Fourier Transform) ───────────────────────────────

function computeSTFT(samples, sampleRate) {
  const windowSize = 6144;
  const hopSize = 3072;
  const fftSize = 8192; // next power of 2 for radix-2 FFT
  const maxN = Math.min(samples.length, Math.floor(sampleRate * 5));
  const win = hann(windowSize);
  const numFrames = Math.max(1, Math.floor((maxN - windowSize) / hopSize) + 1);
  const numBins = fftSize >> 1;
  const freqStep = sampleRate / fftSize;

  const times = new Float32Array(numFrames);
  const frequencies = new Float32Array(numBins);
  for (let k = 0; k < numBins; k++) frequencies[k] = k * freqStep;

  const matrix = new Array(numFrames);

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    times[frame] = (start + windowSize / 2) / sampleRate;

    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const end = Math.min(start + windowSize, maxN);
    for (let i = start; i < end; i++) re[i - start] = samples[i] * win[i - start];

    fftRadix2(re, im);

    const frameMags = new Float32Array(numBins);
    for (let k = 0; k < numBins; k++) {
      frameMags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / windowSize;
    }
    matrix[frame] = frameMags;
  }

  return { times, frequencies, matrix, numBins };
}

function downsampleSTFT(stft, maxFrames, maxFreqHz, maxBins) {
  const { times, frequencies, matrix, numBins } = stft;

  let freqCutoff = numBins;
  for (let i = 0; i < numBins; i++) {
    if (frequencies[i] > maxFreqHz) { freqCutoff = i; break; }
  }

  const frameStep = Math.max(1, Math.ceil(times.length / maxFrames));
  const binStep = Math.max(1, Math.ceil(freqCutoff / maxBins));

  const outTimes = [];
  const outFrameIdx = [];
  for (let t = 0; t < times.length; t += frameStep) {
    outTimes.push(Math.round(times[t] * 1000) / 1000);
    outFrameIdx.push(t);
  }

  const outFreqs = [];
  const outBinIdx = [];
  for (let i = 0; i < freqCutoff; i += binStep) {
    outFreqs.push(Math.round(frequencies[i] * 10) / 10);
    outBinIdx.push(i);
  }

  const actualBins = outBinIdx.length;
  const data = new Array(outFrameIdx.length * actualBins);
  let idx = 0;
  for (const fi of outFrameIdx) {
    for (const bi of outBinIdx) {
      data[idx++] = matrix[fi][bi];
    }
  }

  return { times: outTimes, frequencies: outFreqs, numBins: actualBins, data };
}

// ── Harmonic Decay Tracking ───────────────────────────────────────────

function trackHarmonicDecay(stft, fundamental) {
  if (!fundamental || fundamental < 20) return null;

  const { times, frequencies, matrix } = stft;
  const maxHarmonics = 8;
  const tolerance = 0.05;
  const harmonics = [];

  for (let h = 1; h <= maxHarmonics; h++) {
    const targetHz = fundamental * h;
    if (targetHz > 5000) break;
    const loHz = targetHz * (1 - tolerance);
    const hiHz = targetHz * (1 + tolerance);

    const amplitudes = new Float32Array(times.length);
    for (let t = 0; t < times.length; t++) {
      let maxMag = 0;
      for (let i = 0; i < frequencies.length; i++) {
        if (frequencies[i] >= loHz && frequencies[i] <= hiHz && matrix[t][i] > maxMag) {
          maxMag = matrix[t][i];
        }
      }
      amplitudes[t] = maxMag;
    }

    let peakVal = 0, peakIdx = 0;
    for (let i = 0; i < amplitudes.length; i++) {
      if (amplitudes[i] > peakVal) { peakVal = amplitudes[i]; peakIdx = i; }
    }

    let decayRate = null;
    if (peakVal > 0 && peakIdx < amplitudes.length - 3) {
      const xs = [], ys = [];
      for (let i = peakIdx; i < amplitudes.length; i++) {
        if (amplitudes[i] > peakVal * 0.01) {
          xs.push(times[i] - times[peakIdx]);
          ys.push(Math.log(amplitudes[i]));
        }
      }
      if (xs.length >= 3) {
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        const n = xs.length;
        for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        decayRate = Math.round(-slope * 1000) / 1000;
      }
    }

    harmonics.push({
      harmonic: h,
      hz: Math.round(targetHz * 100) / 100,
      decayRate,
      amplitudes: Array.from(amplitudes),
    });
  }

  return { times: Array.from(times), harmonics };
}

// ── Public API ─────────────────────────────────────────────────────────

export function analyzeAudio(audioBuffer) {
  const raw = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;

  const maxStoredSamples = sr * 10;
  const samples = raw.length > maxStoredSamples ? raw.subarray(0, maxStoredSamples) : raw;

  const { frequencies, magnitudes } = computeFFTFast(samples, sr);
  const fundamental = Math.round(detectFundamental(samples, sr) * 100) / 100;
  const binPowers = computeBinPowers(frequencies, magnitudes);
  const { dampingFactor, envelope, times } = computeDamping(samples, sr);

  const stftFull = computeSTFT(samples, sr);
  const stft = downsampleSTFT(stftFull, 80, 5000, 384);
  const harmonicDecay = trackHarmonicDecay(stftFull, fundamental);

  const displayStep = Math.max(1, Math.floor(samples.length / 20000));
  const displaySamples = new Float32Array(Math.ceil(samples.length / displayStep));
  for (let i = 0, j = 0; i < samples.length; i += displayStep, j++) {
    displaySamples[j] = samples[i];
  }

  return {
    name: '',
    fundamental,
    duration: Math.round((samples.length / sr) * 100) / 100,
    sampleRate: sr,
    dampingFactor,
    binPowers,
    fft: { frequencies, magnitudes },
    waveform: { samples: displaySamples, sr: Math.round(sr / displayStep) },
    damping: { envelope, times },
    stft,
    harmonicDecay,
  };
}

export { FREQ_BINS };
