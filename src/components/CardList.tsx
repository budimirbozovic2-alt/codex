import { Card, getCardScore, getSectionScore, getCardRetrievability, getRetrievability, SectionState } from "@/lib/spaced-repetition";
import { format } from "date-fns";
import { Edit2, Trash2, ChevronDown, ChevronRight, Zap, Brain, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";

interface Props {
  cards: Card[];
  filterCategory: string | null;
  filterSubcategory?: string | null;
  filterType?: "all" | "essay" | "flash";
  filterTag?: string | null;
  searchQuery?: string;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  scrollToCardId?: string | null;
  onScrolledTo?: () => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-success bg-success/10" : score >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>{score}%</span>
  );
}

function RetentionBadge({ retention }: { retention: number }) {
  if (retention === 0) return null;
  const color = retention >= 90 ? "text-success" : retention >= 70 ? "text-warning" : "text-destructive";
  return (
    <span className={`text-xs flex items-center gap-0.5 ${color}`} title="Vjerovatnoća prisjećanja">
      <Brain className="h-3 w-3" />{retention}%
    </span>
  );
}

function SectionBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : score > 0 ? "bg-destructive" : "bg-muted-foreground/30";
  return (
    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(score, 5)}%` }} />
    </div>
  );
}


export default function CardList({ cards, filterCategory, filterSubcategory, filterType = "all", filterTag, searchQuery = "", onEdit, onDelete, onToggleTag, scrollToCardId, onScrolledTo, selectionMode, selectedIds, onToggleSelect }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToCardId && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-card-id="${scrollToCardId}"]`);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      }
      onScrolledTo?.();
    }
  }, [scrollToCardId, onScrolledTo]);
  let filtered = filterCategory ? cards.filter((c) => c.category === filterCategory) : cards;
  if (filterSubcategory) {
    filtered = filtered.filter((c) => c.subcategory === filterSubcategory);
  }
  if (filterType !== "all") {
    filtered = filtered.filter((c) => (c.type || "essay") === filterType);
  }
  if (filterTag) {
    filtered = filtered.filter((c) => (c.tags || []).includes(filterTag));
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((c) => {
      const questionMatch = c.question.toLowerCase().includes(q);
      const contentMatch = c.sections.some((s) => {
        const plain = s.content.replace(/<[^>]*>/g, "").toLowerCase();
        return plain.includes(q) || s.title.toLowerCase().includes(q);
      });
      return questionMatch || contentMatch;
    });
  }

  if (filtered.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Nema kartica. Kreirajte prvu!</p>;
  }

  return (
    <div className="space-y-3" ref={scrollRef}>
      {filtered.map((card, i) => {
        const expanded = expandedId === card.id;
        const score = getCardScore(card);
        const retention = getCardRetrievability(card);
        const isFlash = card.type === "flash";
        const cardTags = card.tags || [];
        const isFrequent = cardTags.includes("često-na-ispitu");
        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`rounded-xl bg-card border hover:border-primary/30 transition-colors overflow-hidden ${scrollToCardId === card.id ? "ring-2 ring-primary/50" : ""}`}
            data-card-id={card.id}
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                {selectionMode && (
                  <button
                    onClick={() => onToggleSelect?.(card.id)}
                    className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedIds?.has(card.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
                    }`}
                  >
                    {selectedIds?.has(card.id) && <span className="text-xs">✓</span>}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
                    {card.subcategory && (
                      <span className="text-xs text-muted-foreground">› {card.subcategory}</span>
                    )}
                    <ScoreBadge score={score} />
                    <RetentionBadge retention={retention} />
                    {isFlash ? (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Blic
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
                    )}
                    
                  </div>
                  <p className="font-serif text-lg line-clamp-2">{card.question}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onToggleTag(card.id, "često-na-ispitu")}
                    className={`p-2 rounded-lg transition-colors ${
                      isFrequent ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"
                    }`}
                    title={isFrequent ? "Često na ispitu (klikni da ukloniš)" : "Označi kao često na ispitu"}
                  >
                    <Flame className="h-4 w-4" />
                  </button>
                  <button onClick={() => setExpandedId(expanded ? null : card.id)} className="p-2 hover:bg-secondary rounded-lg">
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button onClick={() => onEdit(card)} className="p-2 hover:bg-secondary rounded-lg">
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => onDelete(card.id)} className="p-2 hover:bg-destructive/10 rounded-lg">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 space-y-3 border-t pt-4">
                    {isFlash ? (
                      <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.sections[0]?.content || "" }} />
                    ) : (
                      card.sections.map((s) => {
                        const sScore = getSectionScore(s);
                        const sRetention = getRetrievability(s);
                        return (
                          <div key={s.id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{s.title}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <ScoreBadge score={sScore} />
                                <RetentionBadge retention={sRetention} />
                                <span>S: {s.stability?.toFixed(1) ?? 0}d</span>
                                <span>Sljedeće: {format(new Date(s.nextReview), "dd.MM")}</span>
                              </div>
                            </div>
                            <SectionBar score={sScore} />
                            <div className="text-sm text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: s.content }} />
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
