import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Zap, Pencil,
  Activity, AlertTriangle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type Card, SectionState, getCardRetrievability,
} from "@/lib/spaced-repetition";
import type { SubcategoryNode } from "@/lib/db";
import {
  buildSegments, getActiveSegment,
  type Segment, type WordEntry,
  cleanForTTS,
} from "@/components/speed-reader/speed-reader-constants";
import SpeedReaderControls from "@/components/speed-reader/SpeedReaderControls";
import { loadTTSSettings, saveTTSSettings, type TTSSettings } from "@/lib/tts";

interface Props {
  cards: Card[];
  subcategoryNodes: SubcategoryNode[];
  categoryId: string;
  onEditCard?: (card: Card) => void;
  initialCardId?: string | null;
  onInitialConsumed?: () => void;
}

type TypeFilter = "all" | "essay" | "flash";

const FILTER_KEY = "speed-reader-filters:";

interface PersistedFilters {
  subFilter: string;
  chapterFilter: string;
  typeFilter: TypeFilter;
}

function loadFilters(categoryId: string): PersistedFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY + categoryId);
    if (!raw) return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
    const p = JSON.parse(raw) as Partial<PersistedFilters>;
    const tf = p.typeFilter;
    return {
      subFilter: typeof p.subFilter === "string" ? p.subFilter : "all",
      chapterFilter: typeof p.chapterFilter === "string" ? p.chapterFilter : "all",
      typeFilter: tf === "essay" || tf === "flash" ? tf : "all",
    };
  } catch {
    return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
  }
}

function retentionColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default function LocalSpeedReader({
  cards, subcategoryNodes, categoryId, onEditCard, initialCardId, onInitialConsumed,
}: Props) {
  // ─── Filters ─────────────────────────────
  const [subFilter, setSubFilter] = useState<string>(() => loadFilters(categoryId).subFilter);
  const [chapterFilter, setChapterFilter] = useState<string>(() => loadFilters(categoryId).chapterFilter);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => loadFilters(categoryId).typeFilter);
  const [index, setIndex] = useState(0);

  // Validate filters against taxonomy
  useEffect(() => {
    if (subFilter !== "all" && !subcategoryNodes.some(s => s.id === subFilter)) {
      setSubFilter("all");
      setChapterFilter("all");
      return;
    }
    if (chapterFilter !== "all") {
      const sub = subcategoryNodes.find(s => s.id === subFilter);
      if (!sub?.chapters?.some(ch => ch.id === chapterFilter)) setChapterFilter("all");
    }
  }, [subcategoryNodes, subFilter, chapterFilter]);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_KEY + categoryId,
        JSON.stringify({ subFilter, chapterFilter, typeFilter }),
      );
    } catch { /* ignore */ }
  }, [categoryId, subFilter, chapterFilter, typeFilter]);

  const chapters = useMemo(() => {
    if (subFilter === "all") return [];
    return subcategoryNodes.find(s => s.id === subFilter)?.chapters ?? [];
  }, [subFilter, subcategoryNodes]);

  const filtered = useMemo(() => {
    let list = cards.slice();
    if (subFilter !== "all") list = list.filter(c => c.subcategoryId === subFilter);
    if (chapterFilter !== "all") list = list.filter(c => c.chapterId === chapterFilter);
    if (typeFilter !== "all") list = list.filter(c => c.type === typeFilter);
    return list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [cards, subFilter, chapterFilter, typeFilter]);

  useEffect(() => { setIndex(0); }, [subFilter, chapterFilter, typeFilter]);
  useEffect(() => {
    if (index > 0 && index >= filtered.length) setIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, index]);

  // ── Focus specific card ──
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCardId || consumedRef.current === initialCardId) return;
    const target = cards.find(c => c.id === initialCardId);
    if (!target) { consumedRef.current = initialCardId; onInitialConsumed?.(); return; }
    const idx = filtered.findIndex(c => c.id === initialCardId);
    if (idx === -1) {
      if (subFilter !== "all") setSubFilter("all");
      if (chapterFilter !== "all") setChapterFilter("all");
      if (typeFilter !== "all") setTypeFilter("all");
      return;
    }
    setIndex(idx);
    consumedRef.current = initialCardId;
    onInitialConsumed?.();
  }, [initialCardId, cards, filtered, subFilter, chapterFilter, typeFilter, onInitialConsumed]);

  const current = filtered[index];

  // ─── Speed Reader Engine (local, per-card) ──────────────
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

  // Reset on card change
  useEffect(() => {
    setCurrentWordIdx(0);
    setPlaying(false);
    wordRefs.current = [];
  }, [current?.id]);

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
      const next = segIdx + 1;
      if (next < segments.length) {
        ttsSegIdxRef.current = next;
        setCurrentWordIdx(segments[next].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(next, 0), 100);
      } else { setPlaying(false); ttsPlayingRef.current = false; }
    };
    utterance.onerror = (e) => {
      if (e.error === "canceled") return;
      const next = segIdx + 1;
      if (next < segments.length) {
        ttsSegIdxRef.current = next;
        setCurrentWordIdx(segments[next].globalStartIdx);
        ttsTimeoutRef.current = setTimeout(() => speakSegment(next, 0), 100);
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

  const updateTtsSettings = useCallback((s: TTSSettings) => {
    setTtsSettings(s);
    saveTTSSettings(s);
  }, []);

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
  const activeSegment = getActiveSegment(segments, currentWordIdx);

  // FSRS stats
  const stats = useMemo(() => {
    if (!current) return null;
    const sections = current.sections ?? [];
    const reviewed = sections.filter(s => s.state !== SectionState.New);
    const allNew = sections.length > 0 && reviewed.length === 0;
    const lapses = sections.reduce((sum, s) => sum + (s.lapses ?? 0), 0);
    const avgStability = reviewed.length === 0
      ? 0
      : reviewed.reduce((sum, s) => sum + (s.stability ?? 0), 0) / reviewed.length;
    const retention = getCardRetrievability(current);
    return { reads: current.readCount ?? 0, lapses, avgStability, retention, allNew };
  }, [current]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={subFilter} onValueChange={(v) => { setSubFilter(v); setChapterFilter("all"); }}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Potkategorija" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sve potkategorije</SelectItem>
            {subcategoryNodes.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {subFilter !== "all" && chapters.length > 0 && (
          <Select value={chapterFilter} onValueChange={setChapterFilter}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Glava" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve glave</SelectItem>
              {chapters.map(ch => (
                <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Tip" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Svi tipovi</SelectItem>
            <SelectItem value="essay">Esejska</SelectItem>
            <SelectItem value="flash">Blic</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length === 0 ? "Nema kartica" : `${index + 1} / ${filtered.length}`}
        </div>
      </div>

      {/* Edit shortcut */}
      {current && onEditCard && (
        <div className="flex items-center gap-2">
          <div className="ml-auto">
            <Button
              type="button" size="sm" variant="outline"
              className="gap-1.5 h-8 text-xs"
              onClick={() => onEditCard(current)}
            >
              <Pencil className="h-3.5 w-3.5" /> Uredi karticu
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {!current ? (
        <div className="glass-card rounded-xl p-12 text-center text-sm text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Nema kartica za brzo čitanje uz odabrane filtere.
        </div>
      ) : (
        <>
          {/* Controls */}
          <SpeedReaderControls
            playing={playing}
            currentWordIdx={currentWordIdx}
            totalWords={totalWords}
            wpm={wpm}
            setWpm={setWpm}
            fontSize={fontSize}
            setFontSize={setFontSize}
            progress={progress}
            ttsEnabled={ttsEnabled}
            setTtsEnabled={setTtsEnabled}
            ttsMode={ttsMode}
            setTtsMode={setTtsMode}
            ttsSettings={ttsSettings}
            showTtsSettings={showTtsSettings}
            setShowTtsSettings={setShowTtsSettings}
            voices={voices}
            updateTtsSettings={updateTtsSettings}
            stopTts={stopTts}
            handlePlayPause={handlePlayPause}
            handleReset={handleReset}
            handlePrevWord={handlePrevWord}
            handleNextWord={handleNextWord}
          />

          {/* Card display */}
          <article className="glass-card rounded-2xl p-6 md:p-8 space-y-5">
            <header className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Brzo čitanje
              </p>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground leading-tight">
                {current.question}
              </h2>

              {/* FSRS chips */}
              {stats && (
                <TooltipProvider delayDuration={250}>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {stats.allNew && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                        <Sparkles className="h-3 w-3" /> Nova
                      </span>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-muted/40 text-muted-foreground">
                          <Activity className="h-3 w-3" /> {stats.reads} pregleda
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Ukupan broj prikaza ove kartice</TooltipContent>
                    </Tooltip>
                    {stats.lapses > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-destructive/10 text-destructive">
                            <AlertTriangle className="h-3 w-3" /> {stats.lapses} grešaka
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Broj zaboravljanja (lapses) po sekcijama</TooltipContent>
                      </Tooltip>
                    )}
                    {!stats.allNew && stats.avgStability > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-muted/40 text-muted-foreground">
                            Snaga ~{stats.avgStability < 1
                              ? `${Math.round(stats.avgStability * 24)}h`
                              : `${Math.round(stats.avgStability)}d`}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Prosječna FSRS stabilnost preko sekcija</TooltipContent>
                      </Tooltip>
                    )}
                    {!stats.allNew && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-muted/40 ${retentionColor(stats.retention)}`}>
                            Retencija {stats.retention}%
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Trenutna procijenjena vjerovatnoća prisjećanja</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
              )}
            </header>

            {/* Speed reader word display */}
            <div className="min-h-[30vh] max-h-[55vh] overflow-y-auto space-y-6">
              {totalWords === 0 ? (
                <p className="text-muted-foreground text-center py-12">Nema tekstualnog sadržaja.</p>
              ) : (
                segments.map((seg, segIdx) => {
                  const isCurrentSeg = activeSegment === seg;
                  const titleWordCount = (seg.sectionTitle || "").split(/\s+/).filter(Boolean).length;
                  return (
                    <div key={segIdx}>
                      {titleWordCount > 0 && (
                        <div className={`mb-3 ${segIdx > 0 ? "border-t border-border/40 pt-4" : ""}`}>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex flex-wrap gap-1">
                            {seg.words.slice(0, titleWordCount).map((word, wi) => {
                              const globalIdx = seg.globalStartIdx + wi;
                              return (
                                <span
                                  key={globalIdx}
                                  ref={el => { wordRefs.current[globalIdx] = el; }}
                                  className={`inline-block py-0.5 px-0.5 rounded transition-all duration-150 cursor-pointer ${
                                    globalIdx === currentWordIdx
                                      ? "bg-primary text-primary-foreground scale-105 shadow-sm"
                                      : globalIdx < currentWordIdx
                                      ? "text-muted-foreground/40"
                                      : isCurrentSeg ? "text-muted-foreground" : "text-muted-foreground/60"
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
                })
              )}
            </div>
          </article>
        </>
      )}

      {/* Pager */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => { setIndex(i => Math.max(i - 1, 0)); setPlaying(false); stopTts(); }}
          disabled={index <= 0}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" /> Prethodna
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length > 0 ? `${index + 1} / ${filtered.length}` : "—"}
        </span>
        <Button
          variant="outline"
          onClick={() => { setIndex(i => Math.min(i + 1, filtered.length - 1)); setPlaying(false); stopTts(); }}
          disabled={index >= filtered.length - 1}
          className="gap-1.5"
        >
          Sljedeća <ChevronRight className="h-4 w-4" />
        </Button>
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
