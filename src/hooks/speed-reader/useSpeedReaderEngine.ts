/**
 * Word cursor + TTS engine for LocalSpeedReader.
 *
 * Owns: segments/wordEntries (derived from `current`), currentWordIdx,
 * playing, wpm, fontSize, TTS settings + voices + mode.
 *
 * Single reset effect on `current?.id`. ttsMode persists via single-writer
 * setter (no useEffect mirror). All handlers are stable callbacks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "@/lib/spaced-repetition";
import {
  buildSegments, getActiveSegment, cleanForTTS,
  type Segment, type WordEntry,
} from "@/components/speed-reader/speed-reader-constants";
import { loadTTSSettings, saveTTSSettings, type TTSSettings } from "@/lib/tts";

const TTS_MODE_KEY = "sr-tts-mode";

function loadTtsMode(): "natural" | "wpm" {
  try {
    return localStorage.getItem(TTS_MODE_KEY) === "wpm" ? "wpm" : "natural";
  } catch { return "natural"; }
}

export function useSpeedReaderEngine(current: Card | undefined) {
  const { segments, wordEntries } = useMemo(() => {
    if (!current) return { segments: [] as Segment[], wordEntries: [] as WordEntry[] };
    return buildSegments([current]);
  }, [current]);

  const totalWords = wordEntries.length;

  const [wpm, setWpm] = useState(200);
  const [fontSize, setFontSize] = useState("text-xl");
  const [playing, setPlaying] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);

  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TTS
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsMode, setTtsModeState] = useState<"natural" | "wpm">(loadTtsMode);
  const setTtsMode = useCallback((mode: "natural" | "wpm") => {
    setTtsModeState(mode);
    try { localStorage.setItem(TTS_MODE_KEY, mode); } catch { /* ignore */ }
  }, []);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsPlayingRef = useRef(false);
  const ttsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsSegIdxRef = useRef(-1);

  // Load voices once
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setVoices(v); };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => { window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);

  // Reset cursor when card changes
  useEffect(() => {
    setCurrentWordIdx(0);
    setPlaying(false);
    wordRefs.current = [];
  }, [current?.id]);

  // WPM timer (skipped when TTS natural drives the cursor)
  useEffect(() => {
    if (playing && totalWords > 0 && !(ttsEnabled && ttsMode === "natural")) {
      const interval = 60000 / wpm;
      timerRef.current = setInterval(() => {
        setCurrentWordIdx(prev => {
          if (prev >= totalWords - 1) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }, interval);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, wpm, totalWords, ttsEnabled, ttsMode]);

  // TTS natural mode
  const speakSegment = useCallback((segIdx: number, startLocal: number) => {
    if (!ttsPlayingRef.current) return;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const seg = segments[segIdx];
    if (!seg) { setPlaying(false); return; }
    const remainingWords = seg.words.slice(startLocal);
    if (remainingWords.length === 0) {
      if (segIdx + 1 < segments.length) {
        ttsSegIdxRef.current = segIdx + 1;
        ttsTimeoutRef.current = setTimeout(() => speakSegment(segIdx + 1, 0), 50);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
      return;
    }
    const ttsText = cleanForTTS(remainingWords.join(" "));
    if (!ttsText) {
      if (segIdx + 1 < segments.length) {
        ttsSegIdxRef.current = segIdx + 1;
        ttsTimeoutRef.current = setTimeout(() => speakSegment(segIdx + 1, 0), 50);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
      return;
    }
    const utterance = new SpeechSynthesisUtterance(ttsText);
    utterance.lang = "sr-RS";
    utterance.rate = ttsSettings.rate;
    if (ttsSettings.voiceURI) {
      const v = window.speechSynthesis.getVoices().find(vv => vv.voiceURI === ttsSettings.voiceURI);
      if (v) utterance.voice = v;
    }
    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const spoken = utterance.text.substring(0, event.charIndex);
        const spokenWords = spoken.split(/\s+/).filter(Boolean).length;
        const newGlobal = seg.globalStartIdx + startLocal + spokenWords;
        if (newGlobal < seg.globalStartIdx + seg.words.length) setCurrentWordIdx(newGlobal);
      }
    };
    utterance.onend = () => {
      if (!ttsPlayingRef.current) return;
      const nx = segIdx + 1;
      if (nx < segments.length) {
        ttsSegIdxRef.current = nx;
        setCurrentWordIdx(segments[nx].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(nx, 0), 100);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
    };
    utterance.onerror = (e) => {
      if (e.error === "canceled") return;
      const nx = segIdx + 1;
      if (nx < segments.length) {
        ttsSegIdxRef.current = nx;
        setCurrentWordIdx(segments[nx].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(nx, 0), 100);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
    };
    ttsUtteranceRef.current = utterance;
    ttsSegIdxRef.current = segIdx;
    window.speechSynthesis.speak(utterance);
  }, [segments, ttsSettings]);

  useEffect(() => {
    if (!ttsEnabled || !playing || ttsMode !== "natural") {
      if (ttsPlayingRef.current && ttsMode === "natural") {
        window.speechSynthesis.cancel();
        ttsPlayingRef.current = false;
      }
      return;
    }
    ttsPlayingRef.current = true;
    const seg = getActiveSegment(segments, currentWordIdx);
    if (!seg) return;
    const segIdx = segments.indexOf(seg);
    const localIdx = currentWordIdx - seg.globalStartIdx;
    speakSegment(segIdx, localIdx);
    return () => {
      window.speechSynthesis.cancel();
      ttsPlayingRef.current = false;
      if (ttsTimeoutRef.current) { clearTimeout(ttsTimeoutRef.current); ttsTimeoutRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled, playing, ttsMode]);

  // TTS wpm mode
  const prevWordRef = useRef(-1);
  useEffect(() => {
    if (!ttsEnabled || !playing || ttsMode !== "wpm" || !("speechSynthesis" in window)) return;
    if (currentWordIdx === prevWordRef.current) return;
    prevWordRef.current = currentWordIdx;
    window.speechSynthesis.cancel();
    const entry = wordEntries[currentWordIdx];
    if (!entry) return;
    const cleaned = cleanForTTS(entry.text);
    if (!cleaned) return;
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "sr-RS";
    utterance.rate = Math.max(1.5, ttsSettings.rate);
    if (ttsSettings.voiceURI) {
      const v = window.speechSynthesis.getVoices().find(vv => vv.voiceURI === ttsSettings.voiceURI);
      if (v) utterance.voice = v;
    }
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled, playing, ttsMode, currentWordIdx, wordEntries, ttsSettings]);

  useEffect(() => {
    if (ttsEnabled && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [ttsEnabled, playing]);

  // Scroll active word into view
  useEffect(() => {
    const el = wordRefs.current[currentWordIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [currentWordIdx]);

  const stopTts = useCallback(() => {
    if (ttsTimeoutRef.current) { clearTimeout(ttsTimeoutRef.current); ttsTimeoutRef.current = null; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    ttsUtteranceRef.current = null;
    ttsPlayingRef.current = false;
  }, []);

  const handlePlayPause = useCallback(() => {
    if (totalWords === 0) return;
    if (currentWordIdx >= totalWords - 1) setCurrentWordIdx(0);
    setPlaying(p => { if (p) stopTts(); return !p; });
  }, [totalWords, currentWordIdx, stopTts]);

  const handleReset = useCallback(() => { setPlaying(false); setCurrentWordIdx(0); stopTts(); }, [stopTts]);
  const handlePrevWord = useCallback(() => { setPlaying(false); stopTts(); setCurrentWordIdx(prev => Math.max(0, prev - 1)); }, [stopTts]);
  const handleNextWord = useCallback(() => { setPlaying(false); stopTts(); setCurrentWordIdx(prev => Math.min(totalWords - 1, prev + 1)); }, [stopTts, totalWords]);

  const jumpToWord = useCallback((idx: number) => {
    setPlaying(false);
    stopTts();
    setCurrentWordIdx(idx);
  }, [stopTts]);

  const updateTtsSettings = useCallback((s: TTSSettings) => {
    setTtsSettings(s);
    saveTTSSettings(s);
  }, []);

  const registerWordRef = useCallback((idx: number, el: HTMLSpanElement | null) => {
    wordRefs.current[idx] = el;
  }, []);

  const progress = totalWords > 0 ? ((currentWordIdx + 1) / totalWords) * 100 : 0;
  const activeSegment = getActiveSegment(segments, currentWordIdx);

  return {
    segments, wordEntries, totalWords, activeSegment, progress,
    currentWordIdx, playing, wpm, fontSize,
    ttsEnabled, ttsMode, ttsSettings, voices, showTtsSettings,
    setWpm, setFontSize, setTtsEnabled, setTtsMode,
    setTtsSettings: updateTtsSettings, setShowTtsSettings,
    jumpToWord, handlePlayPause, handleReset, handlePrevWord, handleNextWord, stopTts,
    registerWordRef,
  };
}
