function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export interface TTSSettings {
  rate: number;       // 0.5 - 2.0
  voiceURI: string;   // selected voice URI or ""
}

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  rate: 0.95,
  voiceURI: "",
};

const TTS_SETTINGS_KEY = "sr-tts-settings";

export function loadTTSSettings(): TTSSettings {
  try {
    const data = localStorage.getItem(TTS_SETTINGS_KEY);
    return data ? { ...DEFAULT_TTS_SETTINGS, ...JSON.parse(data) } : DEFAULT_TTS_SETTINGS;
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}

export function saveTTSSettings(settings: TTSSettings): void {
  localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
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
