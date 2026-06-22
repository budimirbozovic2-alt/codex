import { stripHtml } from "@/lib/sanitize";
import { readPref, writePref } from "@/lib/query/prefs-cache-coordinator";

// PR-G7a: `currentUtterance` module var was assigned but never read — dead
// state. Removed declaration + writes below (lines 57, 65). speechSynthesis
// already tracks the active utterance internally; we don't need a mirror.

export interface TTSSettings {
  rate: number;       // 0.5 - 2.0
  voiceURI: string;   // selected voice URI or ""
}

const DEFAULT_TTS_SETTINGS: TTSSettings = {
  rate: 0.95,
  voiceURI: "",
};

const TTS_SETTINGS_KEY = "sr-tts-settings";

/**
 * Sync init for tight UI engines. SQLite + TanStack prefs cache is SSOT.
 */
export function loadTTSSettings(): TTSSettings {
  const v = readPref<Partial<TTSSettings>>(TTS_SETTINGS_KEY, DEFAULT_TTS_SETTINGS);
  return { ...DEFAULT_TTS_SETTINGS, ...v };
}

export function saveTTSSettings(settings: TTSSettings): void {
  writePref(TTS_SETTINGS_KEY, settings);
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

  window.speechSynthesis.speak(utterance);
}
