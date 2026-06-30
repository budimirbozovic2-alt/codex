import { useEffect, useMemo, useRef } from "react";
import { shouldIgnoreGlobalKey } from "@/lib/global-overlay-state";
import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";
import {
  ChevronLeft, ChevronRight, Zap,
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
import type { SubcategoryNode } from "@/lib/db-types";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import SpeedReaderControls from "@/components/speed-reader/SpeedReaderControls";
import { retentionColor } from "@/components/speed-reader/retention-color";
import { useSpeedReaderSelection } from "@/hooks/speed-reader/useSpeedReaderSelection";
import { useSpeedReaderEngine } from "@/hooks/speed-reader/useSpeedReaderEngine";

interface Props {
  cards: Card[];
  subcategoryNodes: SubcategoryNode[];
  categoryId: string;
  initialCardId?: string | null;
  onInitialConsumed?: () => void;
}

interface CardStats {
  reads: number;
  lapses: number;
  avgStability: number;
  retention: number;
  allNew: boolean;
}

function computeStats(card: Card | undefined): CardStats | null {
  if (!card) return null;
  const sections = card.sections ?? [];
  const reviewed = sections.filter(s => s.state !== SectionState.New);
  const allNew = sections.length > 0 && reviewed.length === 0;
  const lapses = sections.reduce((sum, s) => sum + (s.lapses ?? 0), 0);
  const avgStability = reviewed.length === 0
    ? 0
    : reviewed.reduce((sum, s) => sum + (s.stability ?? 0), 0) / reviewed.length;
  const retention = getCardRetrievability(card);
  return { reads: card.readCount ?? 0, lapses, avgStability, retention, allNew };
}

export default function LocalSpeedReader({
  cards, subcategoryNodes, categoryId, initialCardId, onInitialConsumed,
}: Props) {
  const sel = useSpeedReaderSelection({
    cards, subcategoryNodes, categoryId, initialCardId, onInitialConsumed,
  });
  const eng = useSpeedReaderEngine(sel.current);
  // `sel` itself is a stable hook result; `sel.current` is the dep we want.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => computeStats(sel.current), [sel.current]);

  useGlobalHotkey(
    e => e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight",
    e => {
      if (shouldIgnoreGlobalKey(e)) return;
      e.preventDefault();
      if (e.code === "Space") eng.handlePlayPause();
      else if (e.code === "ArrowLeft") eng.handlePrevWord();
      else eng.handleNextWord();
    },
    [eng.handlePlayPause, eng.handlePrevWord, eng.handleNextWord],
  );

  const { current, filtered, index, chapters, subFilter, chapterFilter, typeFilter } = sel;
  const { markRead } = useCardOnlyActions();

  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!current) {
      markedRef.current = null;
      return;
    }
    if (markedRef.current === current.id) return;
    markedRef.current = current.id;
    markRead(current.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing; tracked separately
  }, [current?.id, markRead]);

  const { segments, totalWords, activeSegment, currentWordIdx, fontSize } = eng;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={subFilter} onValueChange={sel.setSub}>
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
          <Select value={chapterFilter} onValueChange={sel.setChapter}>
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

        <Select value={typeFilter} onValueChange={(v) => sel.setType(v as typeof typeFilter)}>
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

      {/* Content */}
      {!current ? (
        <div className="glass-card rounded-xl p-12 text-center text-sm text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Nema kartica za brzo čitanje uz odabrane filtere.
        </div>
      ) : (
        <>
          <SpeedReaderControls
            playing={eng.playing}
            currentWordIdx={eng.currentWordIdx}
            totalWords={eng.totalWords}
            wpm={eng.wpm}
            setWpm={eng.setWpm}
            fontSize={eng.fontSize}
            setFontSize={eng.setFontSize}
            progress={eng.progress}
            ttsEnabled={eng.ttsEnabled}
            setTtsEnabled={eng.setTtsEnabled}
            ttsMode={eng.ttsMode}
            setTtsMode={eng.setTtsMode}
            ttsSettings={eng.ttsSettings}
            showTtsSettings={eng.showTtsSettings}
            setShowTtsSettings={eng.setShowTtsSettings}
            voices={eng.voices}
            updateTtsSettings={eng.setTtsSettings}
            stopTts={eng.stopTts}
            handlePlayPause={eng.handlePlayPause}
            handleReset={eng.handleReset}
            handlePrevWord={eng.handlePrevWord}
            handleNextWord={eng.handleNextWord}
          />

          <article className="glass-card rounded-2xl p-8 space-y-5">
            <header className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Brzo čitanje
              </p>
              <h2 className="text-2xl font-semibold text-foreground leading-tight">
                {current.question}
              </h2>

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
                                  ref={el => eng.registerWordRef(globalIdx, el)}
                                  className={`inline-block py-0.5 px-0.5 rounded transition-all duration-150 cursor-pointer ${
                                    globalIdx === currentWordIdx
                                      ? "bg-primary text-primary-foreground scale-105 shadow-sm"
                                      : globalIdx < currentWordIdx
                                      ? "text-muted-foreground/40"
                                      : isCurrentSeg ? "text-muted-foreground" : "text-muted-foreground/60"
                                  }`}
                                  onClick={() => eng.jumpToWord(globalIdx)}
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
                              ref={el => eng.registerWordRef(globalIdx, el)}
                              className={`inline-block mr-[0.35em] py-0.5 px-0.5 rounded transition-all duration-150 cursor-pointer ${
                                globalIdx === currentWordIdx
                                  ? "bg-primary text-primary-foreground scale-105 shadow-sm"
                                  : globalIdx < currentWordIdx
                                  ? "text-muted-foreground/60"
                                  : "text-foreground"
                              }`}
                              onClick={() => eng.jumpToWord(globalIdx)}
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
          onClick={() => { eng.stopTts(); sel.prev(); }}
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
          onClick={() => { eng.stopTts(); sel.next(); }}
          disabled={index >= filtered.length - 1}
          className="gap-1.5"
        >
          Sljedeća <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-center">
        <p className="text-[10px] text-muted-foreground/50">
          Space = play/pause · ← → = prethodna/sljedeća riječ · Klikni na riječ za skok
        </p>
      </div>
    </div>
  );
}
