# Guitar Tone Tools

Record, analyze, and compare guitar tones — entirely in your browser. No server needed.

**Live site:** https://thecodewrangler.github.io/guitar-tone-tools/

## What it does

- **Record** a guitar chord or note directly from your mic, or upload a WAV/audio file
- **Analyze** the tone: fundamental frequency, frequency spectrum (FFT), damping/sustain, and power distribution across 6 frequency bins (bass, mid, highmid, uppermid, presence, brilliance)
- **Compare** two or more guitars side-by-side with overlaid spectra, mirror FFT, and grouped bar charts
- **Library** of all saved analyses, persisted in localStorage

## Tech stack

Pure static site — no build step, no dependencies, no server.

- **Web Audio API** for recording and decoding audio
- **Canvas 2D** for all chart rendering
- **Radix-2 FFT** implemented in JS for spectral analysis
- **Autocorrelation** for fundamental frequency detection
- **Exponential fit** on RMS envelope for damping factor estimation

Hosted on GitHub Pages from `main`.

## Analysis details

| Feature | Method |
|---|---|
| **Fundamental frequency** | Autocorrelation-based pitch detection (50–1200 Hz) |
| **Frequency spectrum** | Hann-windowed radix-2 FFT, normalized, displayed to 5 kHz |
| **Frequency bin power** | Summed squared magnitudes in bass (0–200 Hz), mid (200–800), highmid (800–2500), uppermid (2500–5000), presence (5k–10k), brilliance (10k–20k) |
| **Damping factor** | Log-linear regression on sliding-window RMS envelope from peak |
| **Waveform** | Raw amplitude vs time |

## Tips for good recordings

- Use a quiet room with minimal background noise
- Play a single chord or note and let it ring for 3–5 seconds
- Keep consistent mic distance across recordings
- Record the same chord/note on each guitar for a fair comparison

## Project layout

```
guitar-tone-tools/
├── index.html        # Single-page app
├── css/style.css     # Styles
├── js/
│   ├── app.js        # UI controller & state management
│   ├── analysis.js   # DSP engine (FFT, pitch, damping, bins)
│   ├── recorder.js   # MediaRecorder → AudioBuffer
│   └── charts.js     # Canvas 2D chart rendering
└── README.md
```
