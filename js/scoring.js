/**
 * Guitar tone quality scoring engine.
 * Produces 0–100 scores across 6 dimensions + an overall composite score.
 */

// ── Note detection ─────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function hzToNote(freq) {
  if (!freq || freq < 20) return { note: '?', octave: 0, name: '?', cents: 0 };
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const midi = rounded + 69;
  const octave = Math.floor(midi / 12) - 1;
  const noteIdx = ((midi % 12) + 12) % 12;
  const note = NOTE_NAMES[noteIdx];
  return { note, octave, name: `${note}${octave}`, cents };
}

export function notesMatch(noteA, noteB) {
  return noteA.note === noteB.note && noteA.octave === noteB.octave;
}

// Common guitar chord roots mapped to expected fundamental ranges (Hz)
export const CHORD_PRESETS = {
  'Open E':   { root: 'E2',  hz: 82.41 },
  'Open A':   { root: 'A2',  hz: 110.00 },
  'Open D':   { root: 'D3',  hz: 146.83 },
  'Open G':   { root: 'G3',  hz: 196.00 },
  'Open C':   { root: 'C3',  hz: 130.81 },
  'Open Em':  { root: 'E2',  hz: 82.41 },
  'Open Am':  { root: 'A2',  hz: 110.00 },
  'Open Dm':  { root: 'D3',  hz: 146.83 },
  'Note E2':  { root: 'E2',  hz: 82.41 },
  'Note A2':  { root: 'A2',  hz: 110.00 },
  'Note D3':  { root: 'D3',  hz: 146.83 },
  'Note G3':  { root: 'G3',  hz: 196.00 },
  'Note B3':  { root: 'B3',  hz: 246.94 },
  'Note E4':  { root: 'E4',  hz: 329.63 },
};

// ── Scoring functions (each returns 0–100) ─────────────────────────────

/**
 * Sustain score: lower damping factor = longer sustain = higher score.
 * Typical guitar damping factors range 0.5 (great sustain) to 8+ (dead).
 */
function scoreSustain(dampingFactor) {
  if (dampingFactor == null || dampingFactor <= 0) return 50;
  // Map: 0.3 → 100, 1.0 → 80, 3.0 → 50, 6.0 → 20, 10+ → 5
  const score = 100 * Math.exp(-0.35 * dampingFactor);
  return clamp(Math.round(score));
}

/**
 * Harmonic richness: count how many clear harmonic peaks exist
 * above the noise floor in the FFT, relative to the fundamental.
 */
function scoreHarmonicRichness(frequencies, magnitudes, fundamental) {
  if (!fundamental || fundamental < 20) return 50;

  const tolerance = fundamental * 0.04; // 4% tolerance
  let harmonicCount = 0;
  let harmonicEnergy = 0;
  const noiseFloor = 0.02;

  // Check harmonics 2–16
  for (let h = 2; h <= 16; h++) {
    const targetFreq = fundamental * h;
    if (targetFreq > 10000) break;

    let peakMag = 0;
    for (let i = 0; i < frequencies.length; i++) {
      if (Math.abs(frequencies[i] - targetFreq) < tolerance) {
        if (magnitudes[i] > peakMag) peakMag = magnitudes[i];
      }
    }
    if (peakMag > noiseFloor) {
      harmonicCount++;
      harmonicEnergy += peakMag;
    }
  }

  // 10+ strong harmonics = great, 2–3 = poor
  const countScore = Math.min(harmonicCount / 10, 1) * 60;
  const energyScore = Math.min(harmonicEnergy / 3, 1) * 40;
  return clamp(Math.round(countScore + energyScore));
}

/**
 * Tonal balance: how evenly distributed the energy is across frequency bins.
 * Uses normalized entropy — perfectly even = 100, all in one bin = 0.
 */
function scoreTonalBalance(binPowers) {
  const vals = Object.values(binPowers).map(v => v / 100);
  const total = vals.reduce((s, v) => s + v, 0) || 1;
  const probs = vals.map(v => v / total);

  let entropy = 0;
  for (const p of probs) {
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(probs.length);
  const normalized = entropy / maxEntropy;

  // Don't reward perfectly flat (no character). Peak around 0.7–0.85 is ideal.
  // Score: normalized 0.0→20, 0.5→60, 0.75→95, 0.85→100, 1.0→80
  let score;
  if (normalized <= 0.85) {
    score = normalized / 0.85 * 100;
  } else {
    score = 100 - (normalized - 0.85) / 0.15 * 20;
  }
  return clamp(Math.round(score));
}

/**
 * Inharmonicity: how much the overtones deviate from perfect integer multiples.
 * Lower inharmonicity = purer tone = higher score.
 */
function scoreInharmonicity(frequencies, magnitudes, fundamental) {
  if (!fundamental || fundamental < 20) return 50;

  const tolerance = fundamental * 0.08;
  let totalDeviation = 0;
  let count = 0;

  for (let h = 2; h <= 12; h++) {
    const idealFreq = fundamental * h;
    if (idealFreq > 8000) break;

    let bestFreq = 0, bestMag = 0;
    for (let i = 0; i < frequencies.length; i++) {
      if (Math.abs(frequencies[i] - idealFreq) < tolerance && magnitudes[i] > bestMag) {
        bestMag = magnitudes[i];
        bestFreq = frequencies[i];
      }
    }
    if (bestMag > 0.02) {
      const deviation = Math.abs(bestFreq - idealFreq) / idealFreq;
      totalDeviation += deviation;
      count++;
    }
  }

  if (count === 0) return 50;
  const avgDeviation = totalDeviation / count;
  // 0% deviation → 100, 1% → 75, 3% → 40, 5%+ → 10
  const score = 100 * Math.exp(-80 * avgDeviation);
  return clamp(Math.round(score));
}

/**
 * Clarity: sharpness of FFT peaks. Narrow, well-defined peaks = clear tone.
 * Measured as the ratio of peak energy to total energy in peak neighborhoods.
 */
function scoreClarity(frequencies, magnitudes, fundamental) {
  if (!fundamental || fundamental < 20) return 50;

  const peakWidth = fundamental * 0.02; // narrow window
  const neighborWidth = fundamental * 0.1; // wider neighborhood
  let peakEnergy = 0;
  let neighborEnergy = 0;

  for (let h = 1; h <= 10; h++) {
    const target = fundamental * h;
    if (target > 8000) break;

    let pEnergy = 0, nEnergy = 0;
    for (let i = 0; i < frequencies.length; i++) {
      const dist = Math.abs(frequencies[i] - target);
      const mag2 = magnitudes[i] * magnitudes[i];
      if (dist < peakWidth) pEnergy += mag2;
      if (dist < neighborWidth) nEnergy += mag2;
    }
    peakEnergy += pEnergy;
    neighborEnergy += nEnergy;
  }

  if (neighborEnergy === 0) return 50;
  const ratio = peakEnergy / neighborEnergy;
  // ratio 0.8+ → very clear, 0.3 → muddy
  const score = Math.min(ratio / 0.7, 1) * 100;
  return clamp(Math.round(score));
}

/**
 * Dynamic range: ratio of peak RMS to noise floor RMS.
 * Higher dynamic range = better signal quality = higher score.
 */
function scoreDynamicRange(envelope) {
  if (!envelope || envelope.length < 10) return 50;

  let peak = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > peak) peak = envelope[i];
  }

  // Estimate noise floor from the quietest 10% of the envelope
  const sorted = [...envelope].sort((a, b) => a - b);
  const floorIdx = Math.floor(sorted.length * 0.1);
  let noiseSum = 0;
  for (let i = 0; i <= floorIdx; i++) noiseSum += sorted[i];
  const noiseFloor = noiseSum / (floorIdx + 1) || 0.0001;

  const dbRange = 20 * Math.log10(peak / noiseFloor);
  // 40 dB → 100, 30 dB → 80, 20 dB → 55, 10 dB → 30
  const score = Math.min(dbRange / 40, 1) * 100;
  return clamp(Math.round(score));
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

// ── Composite scoring ──────────────────────────────────────────────────

const WEIGHTS = {
  sustain:    0.20,
  harmonics:  0.20,
  balance:    0.15,
  inharmonicity: 0.15,
  clarity:    0.15,
  dynamicRange: 0.15,
};

export function computeScores(analysis) {
  const { fundamental, dampingFactor, binPowers, fft, damping } = analysis;
  const { frequencies, magnitudes } = fft;
  const { envelope } = damping;

  const scores = {
    sustain:       scoreSustain(dampingFactor),
    harmonics:     scoreHarmonicRichness(frequencies, magnitudes, fundamental),
    balance:       scoreTonalBalance(binPowers),
    inharmonicity: scoreInharmonicity(frequencies, magnitudes, fundamental),
    clarity:       scoreClarity(frequencies, magnitudes, fundamental),
    dynamicRange:  scoreDynamicRange(envelope),
  };

  let overall = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    overall += scores[key] * weight;
  }
  scores.overall = clamp(Math.round(overall));

  return scores;
}

export const SCORE_LABELS = {
  sustain:       'Sustain',
  harmonics:     'Harmonic Richness',
  balance:       'Tonal Balance',
  inharmonicity: 'Inharmonicity',
  clarity:       'Clarity',
  dynamicRange:  'Dynamic Range',
  overall:       'Overall',
};

export const SCORE_DESCRIPTIONS = {
  sustain:       'How long the note rings before dying out',
  harmonics:     'Number and strength of overtones above the fundamental',
  balance:       'How evenly energy is spread across frequency bands',
  inharmonicity: 'How closely overtones align to perfect harmonic intervals',
  clarity:       'Sharpness and definition of tonal peaks vs background noise',
  dynamicRange:  'Signal-to-noise ratio of the recording',
};

export function scoreGrade(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 60) return 'Good';
  if (score >= 45) return 'Fair';
  if (score >= 30) return 'Below Average';
  return 'Poor';
}
