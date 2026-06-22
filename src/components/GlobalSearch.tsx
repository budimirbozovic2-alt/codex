import { Search, BookOpen, Zap, FileText, Network, ArrowRight, BookMarked } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import { Card } from "@/lib/spaced-repetition";

import { useAllSources } from "@/hooks/useCategorySources";
import { useMindMaps } from "@/hooks/useMindMaps";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardData } from "@/hooks/cards/useCardState";
import Modal from "@/components/ui/DialogShell";
import { taskScheduler } from "@/lib/scheduler";
import { derivePlainText } from "@/lib/editor-v4/derived";
import { useAllKnowledgeBaseArticles } from "@/hooks/zettelkasten/useKnowledgeBaseArticles";
import type { KnowledgeBaseArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import { queueSourceReaderOpen } from "@/lib/source-reader/pending-source-open";

function articleMatchesQuery(a: KnowledgeBaseArticle, q: string): boolean {
  if (a.title.toLowerCase().includes(q)) return true;
  if (a.aliases?.some((alias) => alias.toLowerCase().includes(q))) return true;
  if (a.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
  return derivePlainText(a.contentDoc).toLowerCase().includes(q);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigateToCard: (card: Card) => void;
}

type ResultType = "card" | "source" | "mindmap" | "article";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon: "essay" | "flash" | "source" | "mindmap" | "article";
  card?: Card;
  categoryId?: string;
  sourceId?: string;
  mindmapId?: string;
  articleId?: string;
}

/**
 * PR-7c (M2): pure-JSX highlight — splits the title around case-insensitive
 * matches of `query` and wraps them in `<mark>` React nodes. Replaces the
 * old `SafeHtml(highlightMatch(...))` path (HTML string + DOMPurify).
 */
function HighlightedTitle({ text, query, className }: { text: string; query: string; className?: string }) {
  if (!query) return <span className={className}>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(re);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-primary/30 text-foreground rounded-sm px-0.5">{part}</mark>
          : <span key={i}>{part}</span>,
      )}
    </span>
  );
}

export default function GlobalSearch({ open, onClose, onNavigateToCard }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Phase-3 perf fix: subscribe to global card data ONLY here. This component
  // is lazy-loaded and conditionally mounted by `GlobalSearchWrapper`, so the
  // subscription is created when the modal opens and torn down when it closes.
  const { cards } = useCardData();
  const { categoryRecords: catRecords } = useCategoryData();
  const uuidToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of catRecords) {
      m[r.id] = r.name;
      for (const sub of r.subcategories ?? []) m[sub.id] = sub.name;
    }
    return m;
  }, [catRecords]);
  const debouncedQuery = useDebounce(query, 300);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // SSOT subscriptions — invalidated automatically by storage listeners.
  // Subscriptions are gated on `open` so the modal only pays the cost when shown.
  const sources = useAllSources(open);
  const { mindMaps } = useMindMaps(open);
  const kbArticles = useAllKnowledgeBaseArticles(open);

  // Reset query/cursor + focus when opening
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const h = taskScheduler.setTimeout(() => inputRef.current?.focus(), 50, { label: "GlobalSearch:focusInput" });
    return () => taskScheduler.cancel(h);
  }, [open]);

  const cardSearchBlobs = useMemo(
    () =>
      cards.map((c) => {
        const parts = [c.question.toLowerCase()];
        for (const s of c.sections) {
          parts.push(s.title.toLowerCase());
          parts.push(derivePlainText(s.contentDoc).toLowerCase());
        }
        return { card: c, blob: parts.join("\n") };
      }),
    [cards],
  );

  const results = useMemo<SearchResult[]>(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    const out: SearchResult[] = [];

    // Search cards (pre-built lowercase blob per card)
    cardSearchBlobs
      .filter(({ blob }) => blob.includes(q))
      .slice(0, 10)
      .forEach(({ card: c }) => {
        out.push({
          id: c.id,
          type: "card",
          title: c.question,
          subtitle: `${uuidToName[c.categoryId] ?? c.categoryId}${c.subcategoryId ? ` › ${uuidToName[c.subcategoryId] ?? c.subcategoryId}` : ""}`,
          icon: c.type === "flash" ? "flash" : "essay",
          card: c,
        });
      });

    // Search sources
    sources
      .filter((s) => s.title.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((s) => {
        out.push({
          id: s.id,
          type: "source",
          title: s.title,
          subtitle: uuidToName[s.categoryId] ?? s.categoryId,
          icon: "source",
          categoryId: s.categoryId,
          sourceId: s.id,
        });
      });

    // Search mind maps
    mindMaps
      .filter((m) => m.title.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((m) => {
        const modeLabel = m.mode === "hierarchy" ? "Hijerarhija" : "Postupak";
        const catLabel = m.categoryId ? (uuidToName[m.categoryId] ?? m.categoryId) : undefined;
        out.push({
          id: m.id,
          type: "mindmap",
          title: m.title,
          subtitle: catLabel ? `${catLabel} · ${modeLabel}` : modeLabel,
          icon: "mindmap",
          categoryId: m.categoryId,
          mindmapId: m.id,
        });
      });

    // Search knowledge-base articles
    kbArticles
      .filter((a) => articleMatchesQuery(a, q))
      .slice(0, 5)
      .forEach((a) => {
        const subjectLabel = uuidToName[a.subjectId] ?? a.subjectId;
        out.push({
          id: a.id,
          type: "article",
          title: a.title,
          subtitle: a.isIndex ? `${subjectLabel} · Index` : subjectLabel,
          icon: "article",
          categoryId: a.subjectId,
          articleId: a.id,
        });
      });

    return out.slice(0, 20);
    // `uuidToName` is a stable lookup from CategoryRecord context; including
    // it would re-run search on every category rename. Search is scoped to
    // cards/sources/mindmaps/kb content, not name labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardSearchBlobs, sources, mindMaps, kbArticles, debouncedQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.type === "card" && result.card) {
      onNavigateToCard(result.card);
    } else if (result.type === "source" && result.categoryId) {
      queueSourceReaderOpen(result.sourceId ?? result.id);
      navigate(`/category/${result.categoryId}`);
    } else if (result.type === "mindmap" && result.categoryId && result.mindmapId) {
      navigate(`/subject/${result.categoryId}/mind-maps?open=${result.mindmapId}`);
    } else if (result.type === "article" && result.categoryId && result.articleId) {
      navigate(`/subject/${result.categoryId}/zettelkasten?open=${result.articleId}`);
    }
    onClose();
  }, [onNavigateToCard, onClose, navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [results, selectedIndex, handleSelect, onClose]);

  useEffect(() => {
    if (!open) return;
    // Capture-phase guard: while GlobalSearch is open, swallow Ctrl+K and
    // navigation keys before other window-level listeners can mis-trigger.
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Escape" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter") {
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  if (!open) return null;

  const iconMap = {
    essay: <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />,
    flash: <Zap className="h-3.5 w-3.5 text-warning shrink-0" />,
    source: <FileText className="h-3.5 w-3.5 text-success shrink-0" />,
    mindmap: <Network className="h-3.5 w-3.5 text-accent-foreground shrink-0" />,
    article: <BookMarked className="h-3.5 w-3.5 text-info shrink-0" />,
  };

  const typeLabel: Record<ResultType, string> = {
    card: "Moduli",
    source: "Izvori",
    mindmap: "Mentalne mape",
    article: "Baza znanja",
  };

  // Group results by type
  const grouped = results.reduce<Record<ResultType, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<ResultType, SearchResult[]>);

  let flatIndex = 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="top"
      zClassName="z-search"
      backdropClassName="bg-background/80 backdrop-blur-sm"
      panelClassName="relative w-full max-w-lg mx-4 rounded-xl border bg-card shadow-2xl overflow-hidden"
      labelledBy="global-search-label"
    >
      <span id="global-search-label" className="sr-only">Globalna pretraga</span>
      {/* Search input */}
      <div className="flex items-center gap-3 px-4 border-b">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pretraži module, izvore, baze znanja, mentalne mape..."
          className="flex-1 py-3.5 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Pretraga"
        />
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border bg-secondary text-[10px] text-muted-foreground font-mono">
          ESC
        </kbd>
      </div>

      {/* Results */}
      <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
        {query.trim() && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nema rezultata za "{query}"</p>
        )}
        {(["card", "article", "source", "mindmap"] as ResultType[]).map((type) => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;
          return (
            <div key={type}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1">
                {typeLabel[type]}
              </p>
              {items.map((result) => {
                const currentIndex = flatIndex++;
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      currentIndex === selectedIndex ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {iconMap[result.icon]}
                      <HighlightedTitle
                        className="font-medium truncate flex-1"
                        text={result.title}
                        query={query}
                      />
                      {result.type !== "card" && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    {result.subtitle && (
                      <span className="text-[10px] text-muted-foreground/60 ml-5.5">{result.subtitle}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>↑↓ navigacija</span>
        <span>↵ otvori</span>
        <span>esc zatvori</span>
      </div>
    </Modal>
  );
}
