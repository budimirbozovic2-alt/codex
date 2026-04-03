// Ambient audio engine — procedural generators for rain, forest, cafe, piano
export type AmbientTrack = "rain" | "forest" | "cafe" | "piano";

export const AMBIENT_TRACKS: { id: AmbientTrack; label: string }[] = [
  { id: "rain", label: "Kiša" },
  { id: "forest", label: "Šuma" },
  { id: "cafe", label: "Kafić" },
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

// ── Rain: stereo cascading LP filters + soft droplet bursts ──
function createRainBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = sr * 5;
  const buf = ctx.createBuffer(2, len, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  for (let ch = 0; ch < 2; ch++) {
    const d = ch === 0 ? L : R;
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.97 * b0 + 0.03 * w;
      b1 = 0.95 * b1 + 0.05 * b0;
      b2 = 0.93 * b2 + 0.07 * b1;
      d[i] = b2 * 3.0;

      if (Math.random() < 0.002) {
        const dLen = Math.floor(sr * (0.008 + Math.random() * 0.015));
        let dLp = 0;
        for (let j = 0; j < dLen && (i + j) < len; j++) {
          const env = 1 - j / dLen;
          const n = Math.random() * 2 - 1;
          dLp = 0.7 * dLp + 0.3 * n;
          d[i + j] += dLp * env * env * 0.35;
        }
      }
    }
  }
  return buf;
}

// ── Forest: breathing wind + FM bird chirps + leaf rustle ──
function createForestBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = sr * 6;
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let lp1 = 0, lp2 = 0, lp3 = 0;

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = Math.random() * 2 - 1;
    lp1 = 0.985 * lp1 + 0.015 * w;
    lp2 = 0.98 * lp2 + 0.02 * lp1;
    lp3 = 0.975 * lp3 + 0.025 * lp2;
    const breath = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.12 * t);
    d[i] = lp3 * 2.2 * breath;

    if (Math.random() < 0.0003) {
      const cLen = Math.floor(sr * (0.05 + Math.random() * 0.1));
      const baseFreq = 2500 + Math.random() * 2500;
      const modDepth = 300 + Math.random() * 500;
      const modRate = 8 + Math.random() * 12;
      for (let j = 0; j < cLen && (i + j) < len; j++) {
        const env = Math.sin(Math.PI * j / cLen);
        const freq = baseFreq + modDepth * Math.sin(2 * Math.PI * modRate * j / sr);
        d[i + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * 0.08;
      }
    }

    if (Math.random() < 0.001) {
      const rLen = Math.floor(sr * (0.01 + Math.random() * 0.02));
      for (let j = 0; j < rLen && (i + j) < len; j++) {
        const env = 1 - j / rLen;
        const hp = Math.random() * 2 - 1 - (Math.random() * 2 - 1) * 0.5;
        d[i + j] += hp * env * 0.06;
      }
    }
  }
  return buf;
}

// ── Café: dual murmur layers + amplitude modulation + glass clinks ──
function createCafeBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = sr * 5;
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let m1 = 0, m2 = 0, m3 = 0, m4 = 0;

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w1 = Math.random() * 2 - 1;
    const w2 = Math.random() * 2 - 1;

    m1 = 0.97 * m1 + 0.03 * w1;
    m2 = 0.94 * m2 + 0.06 * m1;
    m3 = 0.96 * m3 + 0.04 * w2;
    m4 = 0.92 * m4 + 0.08 * m3;

    const mod1 = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.08 * t);
    const mod2 = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.13 * t + 1.5);
    let sample = m2 * 1.5 * mod1 + m4 * 1.0 * mod2;

    if (Math.random() < 0.0008) {
      const freq0 = 3500 + Math.random() * 1500;
      const pLen = Math.floor(sr * 0.04);
      for (let j = 0; j < pLen && (i + j) < len; j++) {
        const env = Math.exp(-j / (pLen * 0.15));
        const freq = freq0 * (1 - 0.15 * j / pLen);
        d[i + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * 0.05;
      }
    }

    d[i] += sample;
  }
  return buf;
}

// ── Piano: gentle repeating piano-like tones (pentatonic) ──
function createPianoBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 6;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const notes = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3];
  const noteSpacing = Math.floor(ctx.sampleRate * 0.8);
  const noteCount = Math.floor(len / noteSpacing);
  let seed = 42;
  const nextRand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let n = 0; n < noteCount; n++) {
    const startIdx = n * noteSpacing + Math.floor(nextRand() * noteSpacing * 0.3);
    const freq = notes[Math.floor(nextRand() * notes.length)];
    const decay = ctx.sampleRate * (1.2 + nextRand() * 0.8);
    const vol = 0.06 + nextRand() * 0.04;
    for (let j = 0; j < decay && (startIdx + j) < len; j++) {
      const env = Math.exp(-j / (decay * 0.3));
      const s = Math.sin(2 * Math.PI * freq * j / ctx.sampleRate) * env * vol
              + Math.sin(2 * Math.PI * freq * 2 * j / ctx.sampleRate) * env * vol * 0.15;
      d[startIdx + j] += s;
    }
  }
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp = 0.995 * lp + 0.005 * (Math.random() * 2 - 1);
    d[i] += lp * 0.02;
  }
  return buf;
}

const bufferCache = new Map<AmbientTrack, AudioBuffer>();

function getBuffer(ctx: AudioContext, track: AmbientTrack): AudioBuffer {
  let buf = bufferCache.get(track);
  if (buf) return buf;
  switch (track) {
    case "rain": buf = createRainBuffer(ctx); break;
    case "forest": buf = createForestBuffer(ctx); break;
    case "cafe": buf = createCafeBuffer(ctx); break;
    case "piano": buf = createPianoBuffer(ctx); break;
  }
  bufferCache.set(track, buf);
  return buf;
}

export function startAmbient(track: AmbientTrack = "rain", volume = 0.3): void {
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
