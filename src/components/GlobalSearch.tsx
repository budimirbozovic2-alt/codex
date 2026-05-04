import { Search, BookOpen, Zap, FileText, Network, ArrowRight } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { sanitizeHtml } from "@/lib/sanitize";
import { useDebounce } from "@/hooks/useDebounce";
import { Card } from "@/lib/spaced-repetition";
import { type Source } from "@/lib/sources-storage";
import { useAllSources } from "@/hooks/useCategorySources";
import { useMindMaps } from "@/hooks/useMindMaps";
import { motion, AnimatePresence } from "framer-motion";
import { useCardData, useCategoryData } from "@/contexts/AppContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigateToCard: (card: Card) => void;
}

type ResultType = "card" | "source" | "mindmap";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon: "essay" | "flash" | "source" | "mindmap";
  card?: Card;
  categoryId?: string;
  sourceId?: string;
  mindmapId?: string;
}

// stripHtml: thin wrapper that drops trailing whitespace; uses canonical
// regex stripper from sanitize.ts (collapses whitespace + decodes entities).
import { stripHtmlText as _stripHtml } from "@/lib/sanitize";
function stripHtml(html: string): string { return _stripHtml(html); }

function highlightMatch(text: string, query: string): string {
  if (!query) return sanitizeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const clean = sanitizeHtml(text);
  // G3 fix: don't re-sanitize after adding <mark> — input is already sanitized above
  return clean.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="bg-primary/30 text-foreground rounded-sm px-0.5">$1</mark>');
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

  // Reset query/cursor + focus when opening
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    const out: SearchResult[] = [];

    // Search cards
    cards
      .filter((c) => {
        const questionMatch = c.question.toLowerCase().includes(q);
        const contentMatch = c.sections.some((s) =>
          stripHtml(s.content).toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
        );
        return questionMatch || contentMatch;
      })
      .slice(0, 12)
      .forEach((c) => {
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
        out.push({
          id: m.id,
          type: "mindmap",
          title: m.title,
          subtitle: m.mode === "hierarchy" ? "Hijerarhija" : "Postupak",
          icon: "mindmap",
          mindmapId: m.id,
        });
      });

    return out.slice(0, 20);
  }, [cards, sources, mindMaps, debouncedQuery]);

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
      sessionStorage.setItem("sr-open-source-id", result.id);
      navigate(`/category/${result.categoryId}`);
    } else if (result.type === "mindmap") {
      sessionStorage.setItem("sr-open-mindmap-id", result.id);
      navigate("/mind-map");
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
    // M2 fix: capture-phase guard — while GlobalSearch is open, swallow
    // navigation keys before other window-level listeners (LocalSpeedReader,
    // ReviewCard) can mis-trigger on stray events.
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Escape" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter") {
        // Let the dialog's own onKeyDown handler process these, but block
        // propagation to other window-level listeners.
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, true); // capture
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  if (!open) return null;

  const iconMap = {
    essay: <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />,
    flash: <Zap className="h-3.5 w-3.5 text-warning shrink-0" />,
    source: <FileText className="h-3.5 w-3.5 text-success shrink-0" />,
    mindmap: <Network className="h-3.5 w-3.5 text-accent-foreground shrink-0" />,
  };

  const typeLabel: Record<ResultType, string> = {
    card: "Moduli",
    source: "Izvori",
    mindmap: "Mentalne mape",
  };

  // Group results by type
  const grouped = results.reduce<Record<ResultType, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<ResultType, SearchResult[]>);

  let flatIndex = 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]"
        onClick={onClose}
      >
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg mx-4 rounded-xl border bg-card shadow-2xl overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pretraži module, izvore, mentalne mape..."
              className="flex-1 py-3.5 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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
            {(["card", "source", "mindmap"] as ResultType[]).map((type) => {
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
                          <span
                            className="font-medium truncate flex-1"
                            dangerouslySetInnerHTML={{ __html: highlightMatch(result.title, query) }}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
