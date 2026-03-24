import { loadAppSettings } from "./app-settings";

const audioCtx = typeof window !== "undefined" ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume: number = 0.15) {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Module-level cache for sound enabled check — refreshes every 5s
let _soundEnabled: boolean | null = null;
let _soundCacheTime = 0;
function isSoundEnabled(): boolean {
  const now = Date.now();
  if (_soundEnabled === null || now - _soundCacheTime > 5000) {
    _soundEnabled = loadAppSettings().soundEffects;
    _soundCacheTime = now;
  }
  return _soundEnabled;
}

/** Soft click for grade 3 (Dobro) */
export function playGradeGood() {
  if (!isSoundEnabled()) return;
  playTone(600, 0.12, "sine", 0.1);
}

/** Rising tone for grade 4 (Lako) */
export function playGradeEasy() {
  if (!isSoundEnabled()) return;
  playTone(700, 0.08, "sine", 0.1);
  setTimeout(() => playTone(900, 0.12, "sine", 0.1), 80);
}

/** Low thud for grade 1 (Opet) */
export function playGradeAgain() {
  if (!isSoundEnabled()) return;
  playTone(250, 0.2, "triangle", 0.12);
}

/** Neutral click for grade 2 (Teško) */
export function playGradeHard() {
  if (!isSoundEnabled()) return;
  playTone(400, 0.15, "sine", 0.08);
}

/** Celebratory chime for session completion */
export function playSessionComplete() {
  if (!isSoundEnabled()) return;
  playTone(523, 0.15, "sine", 0.12);
  setTimeout(() => playTone(659, 0.15, "sine", 0.12), 150);
  setTimeout(() => playTone(784, 0.25, "sine", 0.12), 300);
}

/** Play sound for a specific grade */
export function playGradeSound(grade: number) {
  switch (grade) {
    case 1: playGradeAgain(); break;
    case 2: playGradeHard(); break;
    case 3: playGradeGood(); break;
    case 4: playGradeEasy(); break;
  }
}
