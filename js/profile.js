/**
 * Guitar Profile — guided multi-recording evaluation.
 * Collects 6 open strings + 4 chords, then produces a composite report card.
 */

export const PROFILE_STEPS = [
  // Single strings (scored with full harmonic analysis)
  { id: 'E2', label: '6th String — E2',   type: 'string', hz: 82.41,  instruction: 'Pluck the low E string (6th) and let it ring for 3–5 seconds.' },
  { id: 'A2', label: '5th String — A2',   type: 'string', hz: 110.00, instruction: 'Pluck the A string (5th) and let it ring for 3–5 seconds.' },
  { id: 'D3', label: '4th String — D3',   type: 'string', hz: 146.83, instruction: 'Pluck the D string (4th) and let it ring for 3–5 seconds.' },
  { id: 'G3', label: '3rd String — G3',   type: 'string', hz: 196.00, instruction: 'Pluck the G string (3rd) and let it ring for 3–5 seconds.' },
  { id: 'B3', label: '2nd String — B3',   type: 'string', hz: 246.94, instruction: 'Pluck the B string (2nd) and let it ring for 3–5 seconds.' },
  { id: 'E4', label: '1st String — E4',   type: 'string', hz: 329.63, instruction: 'Pluck the high E string (1st) and let it ring for 3–5 seconds.' },
  // Chords (scored for balance, sustain, dynamic range)
  { id: 'G',  label: 'G Major Chord',     type: 'chord',  hz: 196.00, instruction: 'Strum an open G major chord and let it ring for 3–5 seconds.' },
  { id: 'C',  label: 'C Major Chord',     type: 'chord',  hz: 130.81, instruction: 'Strum an open C major chord and let it ring for 3–5 seconds.' },
  { id: 'Em', label: 'E Minor Chord',     type: 'chord',  hz: 82.41,  instruction: 'Strum an open E minor chord and let it ring for 3–5 seconds.' },
  { id: 'D',  label: 'D Major Chord',     type: 'chord',  hz: 146.83, instruction: 'Strum an open D major chord and let it ring for 3–5 seconds.' },
];

export const STRING_CATEGORIES = {
  bass:   ['E2', 'A2'],
  mid:    ['D3', 'G3'],
  treble: ['B3', 'E4'],
};

/**
 * Compute a composite profile from completed step recordings.
 * Each step entry has { stepId, analysis } where analysis includes scores.
 */
export function computeProfile(stepResults) {
  const strings = stepResults.filter(r => PROFILE_STEPS.find(s => s.id === r.stepId)?.type === 'string');
  const chords  = stepResults.filter(r => PROFILE_STEPS.find(s => s.id === r.stepId)?.type === 'chord');

  // Average string scores per dimension
  const stringScores = averageScores(strings.map(r => r.analysis.scores));

  // Chord composite: sustain, balance, dynamic range matter most
  const chordScores = chords.length > 0 ? averageScores(chords.map(r => r.analysis.scores)) : null;

  // Category scores (bass/mid/treble)
  const categoryScores = {};
  for (const [cat, ids] of Object.entries(STRING_CATEGORIES)) {
    const catResults = strings.filter(r => ids.includes(r.stepId));
    if (catResults.length > 0) {
      categoryScores[cat] = averageScores(catResults.map(r => r.analysis.scores));
    }
  }

  // Overall composite: 65% strings, 35% chords
  const overall = {};
  const dims = ['sustain', 'harmonics', 'balance', 'inharmonicity', 'clarity', 'dynamicRange'];
  for (const dim of dims) {
    const sVal = stringScores[dim] || 0;
    const cVal = chordScores ? (chordScores[dim] || 0) : sVal;
    overall[dim] = Math.round(sVal * 0.65 + cVal * 0.35);
  }
  overall.overall = Math.round(
    overall.sustain * 0.20 +
    overall.harmonics * 0.20 +
    overall.balance * 0.15 +
    overall.inharmonicity * 0.15 +
    overall.clarity * 0.15 +
    overall.dynamicRange * 0.15
  );

  // Strengths and weaknesses
  const ranked = dims.map(d => ({ dim: d, val: overall[d] })).sort((a, b) => b.val - a.val);
  const strengths = ranked.slice(0, 2).filter(r => r.val >= 60);
  const weaknesses = ranked.slice(-2).filter(r => r.val < 70);

  return {
    overall,
    stringScores,
    chordScores,
    categoryScores,
    strengths,
    weaknesses,
    stepResults,
  };
}

function averageScores(scoresArray) {
  if (scoresArray.length === 0) return {};
  const dims = Object.keys(scoresArray[0]);
  const avg = {};
  for (const d of dims) {
    const sum = scoresArray.reduce((s, sc) => s + (sc[d] || 0), 0);
    avg[d] = Math.round(sum / scoresArray.length);
  }
  return avg;
}
