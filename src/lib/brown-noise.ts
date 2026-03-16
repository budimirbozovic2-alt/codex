// Brown noise generator using Web Audio API
let audioCtx: AudioContext | null = null;
let brownNoiseNode: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let isPlaying = false;

function createBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 2; // 2 seconds loop
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5; // Amplify
  }
  return buffer;
}

export function startBrownNoise(volume: number = 0.3): void {
  if (isPlaying) return;

  audioCtx = new AudioContext();
  const buffer = createBrownNoiseBuffer(audioCtx);

  brownNoiseNode = audioCtx.createBufferSource();
  brownNoiseNode.buffer = buffer;
  brownNoiseNode.loop = true;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;

  brownNoiseNode.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  brownNoiseNode.start();
  isPlaying = true;
}

export function stopBrownNoise(): void {
  if (brownNoiseNode) {
    try { brownNoiseNode.stop(); } catch {}
    brownNoiseNode.disconnect();
    brownNoiseNode = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  isPlaying = false;
}

export function setBrownNoiseVolume(volume: number): void {
  if (gainNode) gainNode.gain.value = volume;
}

export function isBrownNoisePlaying(): boolean {
  return isPlaying;
}
