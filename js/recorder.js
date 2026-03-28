/**
 * Microphone recording via MediaRecorder → AudioBuffer.
 */

let mediaRecorder = null;
let audioChunks = [];
let stream = null;

export async function startRecording() {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 44100,
    },
  });

  mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMime() });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.start();
}

export function stopRecording() {
  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const arrayBuf = await blob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 44100 });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      resolve({ audioBuffer, blob });
    };
    mediaRecorder.stop();
  });
}

export function isRecording() {
  return mediaRecorder && mediaRecorder.state === 'recording';
}

function getSupportedMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export async function loadAudioFile(file) {
  const arrayBuf = await file.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 44100 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
  return { audioBuffer, blob: file };
}
