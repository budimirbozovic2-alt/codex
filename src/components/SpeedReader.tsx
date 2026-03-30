import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Gauge, BookOpen, Eye, Type, Layers, FileText, Volume2, VolumeX, Settings2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { Card } from "@/lib/spaced-repetition";


import ScrollableRow from "@/components/ScrollableRow";
import InfoPanel from "@/components/InfoPanel";
import { loadTTSSettings, saveTTSSettings, getAvailableVoices, type TTSSettings } from "@/lib/tts";
import DOMPurify from "dompurify";

const WPM_OPTIONS = [100, 150, 200, 250, 300, 400, 500];
const FONT_SIZES = [
  { label: "S", value: "text-base" },
  { label: "M", value: "text-lg" },
  { label: "L", value: "text-xl" },
  { label: "XL", value: "text-2xl" },
];

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = DOMPurify.sanitize(html);
  return div.textContent || div.innerText || "";
}

// Strip non-letter/non-digit chars that cause TTS to stall
function cleanForTTS(text: string): string {
  // Keep letters (any script), digits, spaces; remove isolated symbols
  return text
    .replace(/[^\p{L}\p{N}\s.,!?;:'"()-]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// A "segment" is a block of words belonging to one card+section
interface Segment {
  cardQuestion: string;
  sectionTitle: string;
  cardIndex: number;
  sectionIndex: number;
  words: string[];
  globalStartIdx: number;
}

// Each word in the flat array knows if it's a title word
interface WordEntry {
  text: string;
  isTitle: boolean;       // section title word
  segmentIdx: number;
}

function buildSegments(selectedCards: Card[]): { segments: Segment[]; wordEntries: WordEntry[] } {
  const segments: Segment[] = [];
  const wordEntries: WordEntry[] = [];
  selectedCards.forEach((card, ci) => {
    card.sections.forEach((sec, si) => {
      const titleWords = (sec.title || "").split(/\s+/).filter(Boolean);
      const contentText = stripHtml(sec.content);
      const contentWords = contentText.split(/\s+/).filter(Boolean);
      if (titleWords.length === 0 && contentWords.length === 0) return;
      const segIdx = segments.length;
      const globalStart = wordEntries.length;
      // Add title words
      titleWords.forEach(w => wordEntries.push({ text: w, isTitle: true, segmentIdx: segIdx }));
      // Add content words
      contentWords.forEach(w => wordEntries.push({ text: w, isTitle: false, segmentIdx: segIdx }));
      segments.push({
        cardQuestion: card.question,
        sectionTitle: sec.title,
        cardIndex: ci,
        sectionIndex: si,
        words: [...titleWords, ...contentWords],
        globalStartIdx: globalStart,
      });
    });
  });
  return { segments, wordEntries };
}

function getActiveSegment(segments: Segment[], wordIdx: number): Segment | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (wordIdx >= segments[i].globalStartIdx) return segments[i];
  }
  return segments[0] || null;
}

const SPEED_READER_INFO = (
  <div className="space-y-3 text-sm">
    <div className="flex items-start gap-2"><Layers className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Čitaj podkategoriju</strong><p className="text-muted-foreground">Sve kartice se spajaju u kontinuirani tok teksta.</p></div></div>
    <div className="flex items-start gap-2"><Eye className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Highlighting</strong><p className="text-muted-foreground">Trenutna riječ se ističe u zadanom tempu (WPM).</p></div></div>
    <div className="flex items-start gap-2"><Volume2 className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Glasovno praćenje</strong><p className="text-muted-foreground">Uključi 🔊 za TTS čitanje naglas sa sinhronizovanim praćenjem teksta.</p></div></div>
    <div className="flex items-start gap-2"><Gauge className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Brzina</strong><p className="text-muted-foreground">WPM za vizuelno, ili brzina govora za TTS.</p></div></div>
  </div>
);

type ReadMode = "subcategory" | "card";

export default function SpeedReader() {
  const { cards, categories, subcategories, categoryRecords } = useAppContext();

  const uuidToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of categoryRecords) m[r.id] = r.name;
    return m;
  }, [categoryRecords]);

  // Filters
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);
  const [readMode, setReadMode] = useState<ReadMode>("subcategory");

  // For single-card mode
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

  // TTS read-along state
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

  // Filtered cards (essay only)
  const filteredCards = useMemo(() => {
    let result = cards;
    if (selCat) result = result.filter(c => c.categoryId === selCat);
    if (selSub) result = result.filter(c => c.subcategory === selSub);
    return result.filter(c => c.type !== "flash");
  }, [cards, selCat, selSub]);

  const availableSubs = selCat ? (subcategories[selCat] || []) : [];

  // Build segments based on mode
  const selectedCards = useMemo(() => {
    if (readMode === "card" && selCard) return [selCard];
    if (readMode === "subcategory") return filteredCards;
    return [];
  }, [readMode, selCard, filteredCards]);

  const { segments, wordEntries } = useMemo(() => buildSegments(selectedCards), [selectedCards]);
  const totalWords = wordEntries.length;

  const activeSegment = getActiveSegment(segments, currentWordIdx);

  // Reset on content change
  useEffect(() => {
    setCurrentWordIdx(0);
    setPlaying(false);
    wordRefs.current = [];
  }, [totalWords, readerActive]);

  // Timer — runs when playing, but NOT when TTS is in "natural" mode (TTS drives pace)
  useEffect(() => {
    if (playing && totalWords > 0 && !(ttsEnabled && ttsMode === "natural")) {
      const interval = 60000 / wpm;
      timerRef.current = setInterval(() => {
        setCurrentWordIdx(prev => {
          if (prev >= totalWords - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, interval);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, wpm, totalWords, ttsEnabled, ttsMode]);

  // TTS "natural" mode: speak entire text, TTS boundary events drive highlight
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
      } else {
        setPlaying(false);
        ttsPlayingRef.current = false;
      }
      return;
    }

    const ttsText = cleanForTTS(remainingWords.join(" "));
    if (!ttsText) {
      if (segIdx + 1 < segments.length) {
        ttsSegIdxRef.current = segIdx + 1;
        ttsTimeoutRef.current = setTimeout(() => speakSegment(segIdx + 1, 0), 50);
      } else {
        setPlaying(false);
        ttsPlayingRef.current = false;
      }
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
        if (newGlobalIdx < seg.globalStartIdx + seg.words.length) {
          setCurrentWordIdx(newGlobalIdx);
        }
      }
    };

    utterance.onend = () => {
      if (!ttsPlayingRef.current) return;
      const nextIdx = segIdx + 1;
      if (nextIdx < segments.length) {
        ttsSegIdxRef.current = nextIdx;
        setCurrentWordIdx(segments[nextIdx].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(nextIdx, 0), 100);
      } else {
        setPlaying(false);
        ttsPlayingRef.current = false;
      }
    };

    utterance.onerror = (e) => {
      if (e.error === "canceled") return;
      const nextIdx = segIdx + 1;
      if (nextIdx < segments.length) {
        ttsSegIdxRef.current = nextIdx;
        setCurrentWordIdx(segments[nextIdx].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(nextIdx, 0), 100);
      } else {
        setPlaying(false);
        ttsPlayingRef.current = false;
      }
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
      if (ttsTimeoutRef.current) {
        clearTimeout(ttsTimeoutRef.current);
        ttsTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled, playing, ttsMode]);

  // TTS "wpm" mode: speak each word individually as the WPM timer highlights it
  const prevWordIdxRef = useRef(-1);
  useEffect(() => {
    if (!ttsEnabled || !playing || ttsMode !== "wpm" || !("speechSynthesis" in window)) return;
    if (currentWordIdx === prevWordIdxRef.current) return;
    prevWordIdxRef.current = currentWordIdx;

    // Cancel any ongoing speech quickly
    window.speechSynthesis.cancel();

    const entry = wordEntries[currentWordIdx];
    if (!entry) return;

    const cleaned = cleanForTTS(entry.text);
    if (!cleaned) return; // skip symbols

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "sr-RS";
    utterance.rate = Math.max(1.5, ttsSettings.rate); // speak fast to fit within WPM interval

    if (ttsSettings.voiceURI) {
      const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === ttsSettings.voiceURI);
      if (v) utterance.voice = v;
    }

    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled, playing, ttsMode, currentWordIdx, wordEntries, ttsSettings]);
  // When TTS is enabled, disable the WPM timer
  useEffect(() => {
    if (ttsEnabled && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [ttsEnabled, playing]);
  // Scroll highlighted word into view
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
    setPlaying(p => {
      if (p) stopTts();
      return !p;
    });
  }, [totalWords, currentWordIdx, stopTts]);

  const handleReset = useCallback(() => { setPlaying(false); setCurrentWordIdx(0); stopTts(); }, [stopTts]);
  const handlePrevWord = useCallback(() => { setPlaying(false); stopTts(); setCurrentWordIdx(prev => Math.max(0, prev - 1)); }, [stopTts]);
  const handleNextWord = useCallback(() => { setPlaying(false); stopTts(); setCurrentWordIdx(prev => Math.min(totalWords - 1, prev + 1)); }, [stopTts, totalWords]);

  // Jump to segment
  const jumpToSegment = (segIdx: number) => {
    const seg = segments[segIdx];
    if (seg) { setCurrentWordIdx(seg.globalStartIdx); setPlaying(false); stopTts(); }
  };

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
    setReaderActive(true);
  };

  const exitReader = () => {
    setReaderActive(false);
    setPlaying(false);
    setSelCard(null);
    stopTts();
  };

  // ─── Selection screen ──────────────────────────────
  if (!readerActive) {
    const totalWords = filteredCards.reduce((sum, c) => {
      return sum + c.sections.reduce((s2, sec) => s2 + stripHtml(sec.content).split(/\s+/).filter(Boolean).length, 0);
    }, 0);
    const estMinutes = Math.ceil(totalWords / wpm);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="imperial-title">Speed Reader</h2>
          <InfoPanel title="Speed Reader">{SPEED_READER_INFO}</InfoPanel>
        </div>

        {/* Category filter */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kategorija</span>
          <ScrollableRow>
            <button onClick={() => { setSelCat(null); setSelSub(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selCat ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              Sve
            </button>
            {categories.map(c => (
              <button key={c} onClick={() => { setSelCat(c); setSelSub(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selCat === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                {uuidToName[c] ?? c}
              </button>
            ))}
          </ScrollableRow>

          {selCat && availableSubs.length > 0 && (
            <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
              <button onClick={() => setSelSub(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selSub ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Sve podkat.
              </button>
              {availableSubs.map(sc => (
                <button key={sc} onClick={() => setSelSub(sc)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${selSub === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {sc}
                </button>
              ))}
            </ScrollableRow>
          )}
        </div>

        {/* Read entire subcategory CTA */}
        {filteredCards.length > 0 && (
          <button
            onClick={startSubcategoryRead}
            className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 p-5 transition-colors group"
          >
            <div className="flex items-center justify-center gap-3">
              <Layers className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                  Čitaj {selSub ? `"${selSub}"` : selCat ? `"${selCat}"` : "sve kartice"} — {filteredCards.length} kartica
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalWords.toLocaleString()} riječi · ~{estMinutes} min pri {wpm} WPM
                </p>
              </div>
            </div>
          </button>
        )}

        {/* Individual card list */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ili odaberi pojedinačnu karticu ({filteredCards.length})
          </span>
          {filteredCards.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nema esejskih kartica za prikaz.</p>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {filteredCards.map(card => {
                const wc = card.sections.reduce((s, sec) => s + stripHtml(sec.content).split(/\s+/).filter(Boolean).length, 0);
                return (
                  <button
                    key={card.id}
                    onClick={() => startSingleCardRead(card)}
                    className="w-full text-left p-3 rounded-lg border hover:border-primary/30 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-0.5 text-xs text-muted-foreground">
                      <span>{card.categoryId}</span>
                      {card.subcategory && <span>› {card.subcategory}</span>}
                      <span className="ml-auto">{card.sections.length} sek. · {wc} rij.</span>
                    </div>
                    <p className="text-sm font-medium line-clamp-1">{card.question}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Reader mode ──────────────────────────────
  const activeSegIdx = segments.findIndex(s => s === activeSegment);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={exitReader} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            {readMode === "subcategory" ? (
              <>
                <h2 className="text-xl font-medium flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  {selSub || selCat || "Sve kartice"}
                </h2>
                <p className="text-xs text-muted-foreground">{selectedCards.length} kartica · {totalWords.toLocaleString()} riječi</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-medium">{selCard?.question}</h2>
                <p className="text-xs text-muted-foreground">{selCard?.categoryId}{selCard?.subcategory ? ` › ${selCard.subcategory}` : ""}</p>
              </>
            )}
          </div>
        </div>
        <InfoPanel title="Speed Reader">{SPEED_READER_INFO}</InfoPanel>
      </div>

      {/* Card-level navigator (questions) */}
      {readMode === "subcategory" && selectedCards.length > 1 && (
        <ScrollableRow>
          {selectedCards.map((card, ci) => {
            const isActive = activeSegment?.cardIndex === ci;
            const isPast = activeSegment ? activeSegment.cardIndex > ci : false;
            // Jump to first segment of this card
            const firstSeg = segments.find(s => s.cardIndex === ci);
            return (
              <button
                key={card.id}
                onClick={() => { if (firstSeg) { setCurrentWordIdx(firstSeg.globalStartIdx); setPlaying(false); } }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : isPast ? "text-muted-foreground/50 bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary-foreground/20" : "bg-secondary"}`}>{ci + 1}</span>
                <span className="max-w-[180px] truncate">{card.question}</span>
              </button>
            );
          })}
        </ScrollableRow>
      )}

      {/* Segment navigator (section jumps) */}
      {segments.length > 1 && (
        <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
          {segments.filter(s => !activeSegment || s.cardIndex === activeSegment.cardIndex).map((seg) => {
            const segIdx = segments.indexOf(seg);
            const isActive = segIdx === activeSegIdx;
            return (
              <button
                key={segIdx}
                onClick={() => jumpToSegment(segIdx)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="max-w-[140px] truncate">{seg.sectionTitle}</span>
              </button>
            );
          })}
        </ScrollableRow>
      )}

      {/* Controls bar */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button onClick={handlePrevWord} disabled={currentWordIdx === 0} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={handlePlayPause} className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button onClick={handleNextWord} disabled={currentWordIdx >= totalWords - 1} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={handleReset} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Resetuj">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* TTS toggle */}
            <div className="w-px h-6 bg-border" />
            <button
              onClick={() => { setTtsEnabled(v => !v); stopTts(); }}
              className={`p-2 rounded-lg transition-colors ${ttsEnabled ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              title={ttsEnabled ? "Isključi glasovno praćenje" : "Uključi glasovno praćenje"}
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {ttsEnabled && (
              <>
                {/* TTS mode toggle: natural vs WPM */}
                <div className="flex gap-0.5 rounded-lg border p-0.5">
                  <button
                    onClick={() => { setTtsMode("natural"); stopTts(); }}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${ttsMode === "natural" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    title="TTS kontroliše brzinu čitanja"
                  >
                    Prirodno
                  </button>
                  <button
                    onClick={() => { setTtsMode("wpm"); stopTts(); }}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${ttsMode === "wpm" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    title="WPM tajmer kontroliše brzinu, TTS prati"
                  >
                    WPM
                  </button>
                </div>
                <button
                  onClick={() => setShowTtsSettings(v => !v)}
                  className={`p-2 rounded-lg transition-colors ${showTtsSettings ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                  title="TTS podešavanja"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* WPM — show when TTS is off OR when TTS is in WPM mode */}
          {(!ttsEnabled || ttsMode === "wpm") && (
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1">
                {WPM_OPTIONS.map(w => (
                  <button key={w} onClick={() => setWpm(w)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${wpm === w ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                    {w}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-1">WPM</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {FONT_SIZES.map(f => (
                <button key={f.label} onClick={() => setFontSize(f.value)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${fontSize === f.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TTS settings panel */}
        {ttsEnabled && showTtsSettings && (
          <div className="rounded-lg border bg-secondary/30 p-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Brzina govora</label>
                <span className="text-xs text-muted-foreground tabular-nums">{ttsSettings.rate.toFixed(2)}×</span>
              </div>
              <input
                type="range" min="0.5" max="2" step="0.05" value={ttsSettings.rate}
                onChange={(e) => {
                  const newSettings = { ...ttsSettings, rate: parseFloat(e.target.value) };
                  setTtsSettings(newSettings);
                  saveTTSSettings(newSettings);
                }}
                className="w-full h-1.5 rounded-full appearance-none bg-secondary cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Sporo</span><span>Normalno</span><span>Brzo</span>
              </div>
            </div>
            {voices.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Glas</label>
                <select
                  value={ttsSettings.voiceURI || "__default__"}
                  onChange={(e) => {
                    const newSettings = { ...ttsSettings, voiceURI: e.target.value === "__default__" ? "" : e.target.value };
                    setTtsSettings(newSettings);
                    saveTTSSettings(newSettings);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border bg-background text-xs"
                >
                  <option value="__default__">Sistemski podrazumijevani</option>
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1">
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Riječ {currentWordIdx + 1} / {totalWords}</span>
            <span>{Math.ceil((totalWords - currentWordIdx) / wpm)} min preostalo</span>
          </div>
        </div>
      </div>

      {/* Text display with inline section titles */}
      <div className="rounded-xl border bg-card p-6 sm:p-8 min-h-[40vh] max-h-[60vh] overflow-y-auto">
        {totalWords === 0 ? (
          <p className="text-muted-foreground text-center py-12">Nema tekstualnog sadržaja.</p>
        ) : (
          <div className="space-y-8">
            {segments.map((seg, segIdx) => {
              const isCurrentSeg = activeSegment === seg;
              const titleWordCount = (seg.sectionTitle || "").split(/\s+/).filter(Boolean).length;
              return (
                <div key={segIdx}>
                  {/* Title words — rendered as a prominent heading, but part of the reading flow */}
                  {titleWordCount > 0 && (
                    <div className={`mb-4 pt-4 ${segIdx > 0 ? "border-t-2 border-primary/20" : ""}`}>
                      <h3 className="text-2xl font-bold select-none flex flex-wrap gap-1">
                        {seg.words.slice(0, titleWordCount).map((word, wi) => {
                          const globalIdx = seg.globalStartIdx + wi;
                          return (
                            <span
                              key={globalIdx}
                              ref={el => { wordRefs.current[globalIdx] = el; }}
                              className={`inline-block py-1 px-1 rounded transition-all duration-150 cursor-pointer ${
                                globalIdx === currentWordIdx
                                  ? "bg-primary text-primary-foreground scale-105 shadow-md"
                                  : globalIdx < currentWordIdx
                                  ? "text-muted-foreground/50"
                                  : isCurrentSeg ? "text-foreground" : "text-muted-foreground/70"
                              }`}
                              onClick={() => { setCurrentWordIdx(globalIdx); setPlaying(false); }}
                            >
                              {word}
                            </span>
                          );
                        })}
                      </h3>
                    </div>
                  )}
                  {/* Content words */}
                  <p className={`${fontSize} leading-relaxed select-none`}>
                    {seg.words.slice(titleWordCount).map((word, wi) => {
                      const globalIdx = seg.globalStartIdx + titleWordCount + wi;
                      return (
                        <span
                          key={globalIdx}
                          ref={el => { wordRefs.current[globalIdx] = el; }}
                          className={`inline-block mr-[0.35em] py-0.5 px-0.5 rounded transition-all duration-150 cursor-pointer ${
                            globalIdx === currentWordIdx
                              ? "bg-primary text-primary-foreground scale-105 shadow-sm"
                              : globalIdx < currentWordIdx
                              ? "text-muted-foreground/60"
                              : "text-foreground"
                          }`}
                          onClick={() => { setCurrentWordIdx(globalIdx); setPlaying(false); }}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="flex justify-center">
        <p className="text-[10px] text-muted-foreground/50">
          Space = play/pause · ← → = prethodna/sljedeća riječ · Klikni na riječ za skok
        </p>
      </div>
    </div>
  );
}
