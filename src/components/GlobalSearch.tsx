import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card } from "@/lib/spaced-repetition";
import { Search, X, BookOpen, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  cards: Card[];
  open: boolean;
  onClose: () => void;
  onNavigateToCard: (card: Card) => void;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="bg-primary/30 text-foreground rounded-sm px-0.5">$1</mark>');
}

export default function GlobalSearch({ cards, open, onClose, onNavigateToCard }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce search query — filter only after 200ms of inactivity
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    return cards
      .filter((c) => {
        const questionMatch = c.question.toLowerCase().includes(q);
        const contentMatch = c.sections.some((s) =>
          stripHtml(s.content).toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
        );
        return questionMatch || contentMatch;
      })
      .slice(0, 20);
  }, [cards, debouncedQuery]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      onNavigateToCard(results[selectedIndex]);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [results, selectedIndex, onNavigateToCard, onClose]);

  // Global Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
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
              placeholder="Pretraži sve kartice..."
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
            {results.map((card, i) => {
              const matchedSection = card.sections.find((s) =>
                stripHtml(s.content).toLowerCase().includes(query.toLowerCase())
              );
              const snippet = matchedSection
                ? stripHtml(matchedSection.content).slice(0, 100)
                : "";

              return (
                <button
                  key={card.id}
                  onClick={() => { onNavigateToCard(card); onClose(); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    i === selectedIndex ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {card.type === "flash" ? (
                      <Zap className="h-3.5 w-3.5 text-warning shrink-0" />
                    ) : (
                      <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <span
                      className="font-medium truncate"
                      dangerouslySetInnerHTML={{ __html: highlightMatch(card.question, query) }}
                    />
                  </div>
                  {snippet && (
                    <p
                      className="text-xs text-muted-foreground mt-1 ml-5.5 line-clamp-1"
                      dangerouslySetInnerHTML={{ __html: highlightMatch(snippet, query) }}
                    />
                  )}
                  <span className="text-[10px] text-muted-foreground/60 ml-5.5">{card.category}{card.subcategory ? ` › ${card.subcategory}` : ""}</span>
                </button>
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
