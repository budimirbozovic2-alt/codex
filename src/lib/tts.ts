import { stripHtml } from "@/lib/sanitize";
import { readCached, writeCached } from "@/lib/settings-cache";

let _currentUtterance: SpeechSynthesisUtterance | null = null;

export interface TTSSettings {
  rate: number;       // 0.5 - 2.0
  voiceURI: string;   // selected voice URI or ""
}

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  rate: 0.95,
  voiceURI: "",
};

const TTS_SETTINGS_KEY = "sr-tts-settings";

/**
 * Sync init for tight UI engines. SQLite settings store is SSOT — see
 * `settings-cache.ts`. First call returns localStorage mirror (or defaults);
 * SSOT hydrates on next render.
 */
export function loadTTSSettings(): TTSSettings {
  const v = readCached<Partial<TTSSettings>>(TTS_SETTINGS_KEY, DEFAULT_TTS_SETTINGS);
  return { ...DEFAULT_TTS_SETTINGS, ...v };
}

export function saveTTSSettings(settings: TTSSettings): void {
  writeCached(TTS_SETTINGS_KEY, settings);
}


export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function speak(text: string, settings?: TTSSettings) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const clean = stripHtml(text);
  if (!clean.trim()) return;

  const ttsSettings = settings || loadTTSSettings();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "sr-RS";
  utterance.rate = ttsSettings.rate;

  if (ttsSettings.voiceURI) {
    const voices = window.speechSynthesis.getVoices();
    const selected = voices.find((v) => v.voiceURI === ttsSettings.voiceURI);
    if (selected) utterance.voice = selected;
  }

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return "speechSynthesis" in window && window.speechSynthesis.speaking;
}
