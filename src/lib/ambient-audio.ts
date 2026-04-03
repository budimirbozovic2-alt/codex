// Ambient audio engine — procedural generators for brown noise, rain, forest, lo-fi
export type AmbientTrack = "brown" | "rain" | "forest" | "lofi" | "cafe" | "space" | "piano";

export const AMBIENT_TRACKS: { id: AmbientTrack; label: string }[] = [
  { id: "brown", label: "Brown šum" },
  { id: "rain", label: "Kiša" },
  { id: "forest", label: "Šuma" },
  { id: "lofi", label: "Lo-fi hum" },
  { id: "cafe", label: "Kafić" },
  { id: "space", label: "Space drone" },
  { id: "piano", label: "Tihi klavir" },
];

let audioCtx: AudioContext | null = null;
let sourceNodes: AudioNode[] = [];
let gainNode: GainNode | null = null;
let playing = false;
let currentTrack: AmbientTrack | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// ── Brown noise (existing algorithm) ──
function createBrownBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

// ── Rain: filtered white noise + random drip impulses ──
function createRainBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Band-passed noise for steady rain
  let b0 = 0, b1 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    // Simple low-pass for body
    b0 = 0.95 * b0 + 0.05 * w;
    b1 = 0.9 * b1 + 0.1 * b0;
    let sample = b1 * 2.5;
    // Random drip patter
    if (Math.random() < 0.003) {
      sample += (Math.random() * 2 - 1) * 0.6;
    }
    d[i] = sample;
  }
  return buf;
}

// ── Forest: very low-freq rumble + bird-like chirps ──
function createForestBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    // Wind: very low-passed noise
    const w = Math.random() * 2 - 1;
    lp = 0.98 * lp + 0.02 * w;
    let sample = lp * 1.8;
    // Occasional bird chirp (sine burst)
    if (Math.random() < 0.0004) {
      const chirpLen = Math.floor(ctx.sampleRate * (0.03 + Math.random() * 0.06));
      const freq = 2000 + Math.random() * 3000;
      for (let j = 0; j < chirpLen && (i + j) < len; j++) {
        const env = 1 - j / chirpLen;
        d[i + j] += Math.sin(2 * Math.PI * freq * j / ctx.sampleRate) * env * 0.15;
      }
    }
    d[i] += sample;
  }
  return buf;
}

// ── Lo-fi hum: warm low-frequency drone + vinyl crackle ──
function createLofiBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    // Warm drone (layered low sines)
    let sample = Math.sin(2 * Math.PI * 60 * t) * 0.12
               + Math.sin(2 * Math.PI * 90 * t) * 0.08
               + Math.sin(2 * Math.PI * 120 * t + 0.3) * 0.05;
    // Vinyl crackle
    if (Math.random() < 0.008) {
      sample += (Math.random() * 2 - 1) * 0.25;
    }
    // Subtle filtered noise bed
    sample += (Math.random() * 2 - 1) * 0.03;
    d[i] = sample;
  }
  return buf;
}

const bufferCache = new Map<AmbientTrack, AudioBuffer>();

function getBuffer(ctx: AudioContext, track: AmbientTrack): AudioBuffer {
  let buf = bufferCache.get(track);
  if (buf) return buf;
  switch (track) {
    case "brown": buf = createBrownBuffer(ctx); break;
    case "rain": buf = createRainBuffer(ctx); break;
    case "forest": buf = createForestBuffer(ctx); break;
    case "lofi": buf = createLofiBuffer(ctx); break;
  }
  bufferCache.set(track, buf);
  return buf;
}

export function startAmbient(track: AmbientTrack = "brown", volume = 0.3): void {
  if (playing) stopAmbient();
  const ctx = getCtx();
  const buffer = getBuffer(ctx, track);

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  gainNode = ctx.createGain();
  gainNode.gain.value = volume;

  src.connect(gainNode);
  gainNode.connect(ctx.destination);
  src.start();

  sourceNodes = [src];
  playing = true;
  currentTrack = track;
}

export function stopAmbient(): void {
  for (const n of sourceNodes) {
    try { (n as AudioBufferSourceNode).stop(); } catch {}
    n.disconnect();
  }
  sourceNodes = [];
  if (gainNode) { gainNode.disconnect(); gainNode = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  playing = false;
  currentTrack = null;
  bufferCache.clear();
}

export function setAmbientVolume(v: number): void {
  if (gainNode) gainNode.gain.value = v;
}

export function isAmbientPlaying(): boolean { return playing; }
export function getCurrentTrack(): AmbientTrack | null { return currentTrack; }

// Backward-compatible aliases
export const startBrownNoise = (v?: number) => startAmbient("brown", v);
export const stopBrownNoise = stopAmbient;
export const setBrownNoiseVolume = setAmbientVolume;
export const isBrownNoisePlaying = isAmbientPlaying;
