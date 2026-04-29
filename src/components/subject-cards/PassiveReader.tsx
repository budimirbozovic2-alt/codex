import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, BookOpen, FileText, Map as MapIcon,
  Pencil, Activity, Sparkles, AlertTriangle,
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
import type { SubcategoryNode, Source } from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitize";
import { getSource } from "@/lib/sources-storage";
import SourceSidePanel from "@/components/zettelkasten/SourceSidePanel";
import MindMapSidePanel from "@/components/subject-cards/MindMapSidePanel";

interface Props {
  cards: Card[];
  subcategoryNodes: SubcategoryNode[];
  categoryId: string;
  onEditCard?: (card: Card) => void;
  /** When set, the reader will clear filters (if needed) and jump to this card. */
  initialCardId?: string | null;
  /** Called once the initialCardId has been honored, so the parent can clear it. */
  onInitialConsumed?: () => void;
}

type SidePanel = "source" | "mindmap" | null;

function retentionColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

const FILTER_STORAGE_PREFIX = "passive-reader-filters:";

type TypeFilter = "all" | "essay" | "flash";

interface PersistedFilters {
  subFilter: string;
  chapterFilter: string;
  typeFilter: TypeFilter;
}

function loadPersistedFilters(categoryId: string): PersistedFilters {
  if (typeof window === "undefined" || !categoryId) {
    return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
  }
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_PREFIX + categoryId);
    if (!raw) return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    const tf = parsed.typeFilter;
    return {
      subFilter: typeof parsed.subFilter === "string" ? parsed.subFilter : "all",
      chapterFilter: typeof parsed.chapterFilter === "string" ? parsed.chapterFilter : "all",
      typeFilter: tf === "essay" || tf === "flash" ? tf : "all",
    };
  } catch {
    return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
  }
}

export default function PassiveReader({ cards, subcategoryNodes, categoryId, onEditCard, initialCardId, onInitialConsumed }: Props) {
  // Lazy init from localStorage so previously selected filters return on mount.
  const [subFilter, setSubFilter] = useState<string>(() => loadPersistedFilters(categoryId).subFilter);
  const [chapterFilter, setChapterFilter] = useState<string>(() => loadPersistedFilters(categoryId).chapterFilter);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => loadPersistedFilters(categoryId).typeFilter);
  const [index, setIndex] = useState(0);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [linkedSource, setLinkedSource] = useState<Source | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  // Validate persisted filters against the current taxonomy — drop stale IDs.
  useEffect(() => {
    if (subFilter !== "all" && !subcategoryNodes.some(s => s.id === subFilter)) {
      setSubFilter("all");
      setChapterFilter("all");
      return;
    }
    if (chapterFilter !== "all") {
      const sub = subcategoryNodes.find(s => s.id === subFilter);
      const validChapter = sub?.chapters?.some(ch => ch.id === chapterFilter) ?? false;
      if (!validChapter) setChapterFilter("all");
    }
  }, [subcategoryNodes, subFilter, chapterFilter]);

  // Persist filter selection per category.
  useEffect(() => {
    if (typeof window === "undefined" || !categoryId) return;
    try {
      window.localStorage.setItem(
        FILTER_STORAGE_PREFIX + categoryId,
        JSON.stringify({ subFilter, chapterFilter, typeFilter }),
      );
    } catch {
      /* quota or privacy mode — ignore */
    }
  }, [categoryId, subFilter, chapterFilter, typeFilter]);

  const chapters = useMemo(() => {
    if (subFilter === "all") return [];
    const sub = subcategoryNodes.find(s => s.id === subFilter);
    return sub?.chapters ?? [];
  }, [subFilter, subcategoryNodes]);

  const filtered = useMemo(() => {
    let list = cards.slice();
    if (subFilter !== "all") list = list.filter(c => c.subcategoryId === subFilter);
    if (chapterFilter !== "all") list = list.filter(c => c.chapterId === chapterFilter);
    if (typeFilter !== "all") list = list.filter(c => c.type === typeFilter);
    return list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [cards, subFilter, chapterFilter, typeFilter]);

  // Reset index when filters change
  useEffect(() => { setIndex(0); }, [subFilter, chapterFilter, typeFilter]);
  // Clamp index if list shrinks
  useEffect(() => {
    if (index > 0 && index >= filtered.length) setIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, index]);

  // ── Focus a specific card requested from outside (quick action from card list) ──
  // Two-phase: (1) if the card isn't in `filtered` due to active filters, clear them
  // and re-run on the next render. (2) once visible, set index to it and notify parent.
  const consumedInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCardId || consumedInitialRef.current === initialCardId) return;
    const target = cards.find(c => c.id === initialCardId);
    if (!target) {
      // Card no longer exists — drop the request silently.
      consumedInitialRef.current = initialCardId;
      onInitialConsumed?.();
      return;
    }
    const idx = filtered.findIndex(c => c.id === initialCardId);
    if (idx === -1) {
      // Filters are hiding it — clear them and retry on next render.
      if (subFilter !== "all") setSubFilter("all");
      if (chapterFilter !== "all") setChapterFilter("all");
      if (typeFilter !== "all") setTypeFilter("all");
      return;
    }
    setIndex(idx);
    consumedInitialRef.current = initialCardId;
    onInitialConsumed?.();
  }, [initialCardId, cards, filtered, subFilter, chapterFilter, typeFilter, onInitialConsumed]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        setIndex(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowLeft") {
        setIndex(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered.length]);

  const current = filtered[index];

  // Reset side panel + clear cached source when active card changes
  useEffect(() => {
    setSidePanel(null);
    setLinkedSource(null);
  }, [current?.id]);

  // Lazy-load the linked source when source side panel opens
  useEffect(() => {
    if (sidePanel !== "source" || !current?.sourceId) return;
    if (linkedSource && linkedSource.id === current.sourceId) return;
    let cancelled = false;
    setSourceLoading(true);
    getSource(current.sourceId).then(s => {
      if (cancelled) return;
      setLinkedSource(s ?? null);
      setSourceLoading(false);
    });
    return () => { cancelled = true; };
  }, [sidePanel, current?.sourceId, linkedSource]);

  // ── FSRS stats for current card ──
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
    return {
      reads: current.readCount ?? 0,
      lapses,
      avgStability,
      retention,
      allNew,
    };
  }, [current]);

  const sourceDisabled = !current?.sourceId;
  const showSidePanel = sidePanel !== null;

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

      {/* Side-panel toggles + Edit shortcut */}
      {current && (
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={sidePanel === "source" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    disabled={sourceDisabled}
                    onClick={() => setSidePanel(p => p === "source" ? null : "source")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Izvor
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sourceDisabled ? "Kartica nije povezana ni sa jednim izvorom." : "Otvori izvor uporedo"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            type="button"
            variant={sidePanel === "mindmap" ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setSidePanel(p => p === "mindmap" ? null : "mindmap")}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Mapa uma
          </Button>

          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs"
              onClick={() => onEditCard?.(current)}
              disabled={!onEditCard}
            >
              <Pencil className="h-3.5 w-3.5" />
              Uredi karticu
            </Button>
          </div>
        </div>
      )}

      {/* Workspace */}
      {!current ? (
        <div className="glass-card rounded-xl p-12 text-center text-sm text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Nema kartica za prikaz uz odabrane filtere.
        </div>
      ) : (
        <div className={`grid gap-4 ${showSidePanel ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* Card column */}
          <article className="glass-card rounded-2xl p-6 md:p-8 space-y-5">
            <header className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pasivno čitanje
              </p>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground leading-tight">
                {current.question}
              </h2>

              {/* FSRS stat chips */}
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

            <div className="space-y-4">
              {(current.sections ?? []).map((sec, i) => (
                <section key={i} className="space-y-1.5">
                  {sec.title && (
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {sec.title}
                    </h3>
                  )}
                  <div
                    className="prose prose-sm max-w-none card-prose"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(sec.content || "") }}
                  />
                </section>
              ))}
            </div>
          </article>

          {/* Side panel column */}
          {sidePanel === "source" && (
            sourceLoading ? (
              <div className="border border-border rounded-md bg-card flex items-center justify-center min-h-[420px] text-xs text-muted-foreground">
                Učitavanje izvora…
              </div>
            ) : linkedSource ? (
              <SourceSidePanel
                source={linkedSource}
                categoryId={categoryId}
                onClose={() => setSidePanel(null)}
              />
            ) : (
              <div className="border border-border rounded-md bg-card flex items-center justify-center min-h-[420px] text-xs text-muted-foreground">
                Izvor nije dostupan.
              </div>
            )
          )}

          {sidePanel === "mindmap" && (
            <MindMapSidePanel
              categoryId={categoryId}
              onClose={() => setSidePanel(null)}
            />
          )}
        </div>
      )}

      {/* Pager */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setIndex(i => Math.max(i - 1, 0))}
          disabled={index <= 0}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" /> Prethodna
        </Button>
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          Tastatura: ← / → za navigaciju
        </p>
        <Button
          variant="outline"
          onClick={() => setIndex(i => Math.min(i + 1, Math.max(0, filtered.length - 1)))}
          disabled={index >= filtered.length - 1}
          className="gap-1.5"
        >
          Sljedeća <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
