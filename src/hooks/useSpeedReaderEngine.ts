import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useCardData, useCategoryData } from "@/contexts/AppContext";
import type { Card } from "@/lib/spaced-repetition";
import { loadSources, type Source } from "@/lib/sources-storage";
import { loadTTSSettings, saveTTSSettings, type TTSSettings } from "@/lib/tts";
import {
  type ContentSource, type ReadMode, type Segment, type WordEntry,
  buildSegments, buildSourceSegments, getActiveSegment, cleanForTTS,
} from "@/components/speed-reader/speed-reader-constants";

export function useSpeedReaderEngine() {
  const { cards, categories, subcategories, categoryRecords } = useAppContext();

  const uuidToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of categoryRecords) {
      m[r.id] = r.name;
      for (const sub of r.subcategories ?? []) m[sub.id] = sub.name;
    }
    return m;
  }, [categoryRecords]);

  // Filters
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);
  const [readMode, setReadMode] = useState<ReadMode>("subcategory");
  const [contentSource, setContentSource] = useState<ContentSource>("cards");

  // Sources
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [selSource, setSelSource] = useState<Source | null>(null);
  useEffect(() => { loadSources().then(setAllSources); }, []);

  const filteredSources = useMemo(() => {
    if (!selCat) return allSources;
    return allSources.filter(s => s.categoryId === selCat);
  }, [allSources, selCat]);

  // Single-card mode
  const [selCard, setSelCard] = useState<Card | null>(null);

  // Reader active
  const [readerActive, setReaderActive] = useState(false);

  // Reader state
  const [wpm, setWpm] = useState(200);
  const [fontSize, setFontSize] = useState("text-xl");
  const [playing, setPlaying] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsMode, setTtsModeState] = useState<"natural" | "wpm">(() => {
    const saved = localStorage.getItem("sr-tts-mode");
    return saved === "wpm" ? "wpm" : "natural";
  });
  const setTtsMode = (mode: "natural" | "wpm") => {
    setTtsModeState(mode);
    localStorage.setItem("sr-tts-mode", mode);
  };
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsPlayingRef = useRef(false);
  const ttsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsSegIdxRef = useRef(-1);

  // Load voices
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setVoices(v); };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => { window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);

  // Filtered cards
  const filteredCards = useMemo(() => {
    let result = cards;
    if (selCat) result = result.filter(c => c.categoryId === selCat);
    if (selSub) result = result.filter(c => c.subcategoryId === selSub);
    return result.filter(c => c.type !== "flash");
  }, [cards, selCat, selSub]);

  const availableSubs = selCat ? (subcategories[selCat] || []) : [];

  // Build segments
  const selectedCards = useMemo(() => {
    if (readMode === "card" && selCard) return [selCard];
    if (readMode === "subcategory") return filteredCards;
    return [];
  }, [readMode, selCard, filteredCards]);

  const { segments, wordEntries } = useMemo(() => {
    if (readMode === "source" && selSource) return buildSourceSegments(selSource);
    return buildSegments(selectedCards);
  }, [readMode, selSource, selectedCards]);

  const totalWords = wordEntries.length;
  const activeSegment = getActiveSegment(segments, currentWordIdx);

  // Reset on content change
  useEffect(() => {
    setCurrentWordIdx(0);
    setPlaying(false);
    wordRefs.current = [];
  }, [totalWords, readerActive]);

  // Timer
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
      const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === ttsSettings.voiceURI);
      if (v) utterance.voice = v;
    }

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const spokenSoFar = utterance.text.substring(0, event.charIndex);
        const spokenWords = spokenSoFar.split(/\s+/).filter(Boolean).length;
        const newGlobalIdx = seg.globalStartIdx + startLocal + spokenWords;
        if (newGlobalIdx < seg.globalStartIdx + seg.words.length) setCurrentWordIdx(newGlobalIdx);
      }
    };

    utterance.onend = () => {
      if (!ttsPlayingRef.current) return;
      const nextIdx = segIdx + 1;
      if (nextIdx < segments.length) {
        ttsSegIdxRef.current = nextIdx;
        setCurrentWordIdx(segments[nextIdx].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(nextIdx, 0), 100);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
    };

    utterance.onerror = (e) => {
      if (e.error === "canceled") return;
      const nextIdx = segIdx + 1;
      if (nextIdx < segments.length) {
        ttsSegIdxRef.current = nextIdx;
        setCurrentWordIdx(segments[nextIdx].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(nextIdx, 0), 100);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
    };

    ttsUtteranceRef.current = utterance;
    ttsSegIdxRef.current = segIdx;
    window.speechSynthesis.speak(utterance);
  }, [segments, ttsSettings]);

  // Start/stop TTS natural mode
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
  const prevWordIdxRef = useRef(-1);
  useEffect(() => {
    if (!ttsEnabled || !playing || ttsMode !== "wpm" || !("speechSynthesis" in window)) return;
    if (currentWordIdx === prevWordIdxRef.current) return;
    prevWordIdxRef.current = currentWordIdx;
    window.speechSynthesis.cancel();
    const entry = wordEntries[currentWordIdx];
    if (!entry) return;
    const cleaned = cleanForTTS(entry.text);
    if (!cleaned) return;
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "sr-RS";
    utterance.rate = Math.max(1.5, ttsSettings.rate);
    if (ttsSettings.voiceURI) {
      const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === ttsSettings.voiceURI);
      if (v) utterance.voice = v;
    }
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled, playing, ttsMode, currentWordIdx, wordEntries, ttsSettings]);

  useEffect(() => {
    if (ttsEnabled && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [ttsEnabled, playing]);

  // Scroll into view
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

  const jumpToSegment = useCallback((segIdx: number) => {
    const seg = segments[segIdx];
    if (seg) { setCurrentWordIdx(seg.globalStartIdx); setPlaying(false); stopTts(); }
  }, [segments, stopTts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); handlePlayPause(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); handlePrevWord(); }
      if (e.code === "ArrowRight") { e.preventDefault(); handleNextWord(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePlayPause, handlePrevWord, handleNextWord]);

  const progress = totalWords > 0 ? ((currentWordIdx + 1) / totalWords) * 100 : 0;

  const startSubcategoryRead = () => {
    if (filteredCards.length === 0) return;
    setReadMode("subcategory");
    setSelCard(null);
    setReaderActive(true);
  };

  const startSingleCardRead = (card: Card) => {
    setReadMode("card");
    setSelCard(card);
    setSelSource(null);
    setReaderActive(true);
  };

  const startSourceRead = (source: Source) => {
    setReadMode("source");
    setSelSource(source);
    setSelCard(null);
    setReaderActive(true);
  };

  const exitReader = () => {
    setReaderActive(false);
    setPlaying(false);
    setSelCard(null);
    setSelSource(null);
    stopTts();
  };

  const updateTtsSettings = useCallback((newSettings: TTSSettings) => {
    setTtsSettings(newSettings);
    saveTTSSettings(newSettings);
  }, []);

  return {
    // Data
    uuidToName, categories, filteredCards, filteredSources, availableSubs,
    segments, wordEntries, totalWords, activeSegment, selectedCards,
    // Selection state
    selCat, setSelCat, selSub, setSelSub, selCard, selSource,
    readMode, contentSource, setContentSource, readerActive,
    // Reader state
    wpm, setWpm, fontSize, setFontSize, playing, currentWordIdx, setCurrentWordIdx,
    wordRefs, progress,
    // TTS
    ttsEnabled, setTtsEnabled, ttsMode, setTtsMode,
    ttsSettings, showTtsSettings, setShowTtsSettings, voices,
    updateTtsSettings, stopTts,
    // Actions
    handlePlayPause, handleReset, handlePrevWord, handleNextWord,
    jumpToSegment, startSubcategoryRead, startSingleCardRead, startSourceRead, exitReader,
    setPlaying,
  };
}
