import { Card, getCardScore, getSectionScore, CARD_TAGS } from "@/lib/spaced-repetition";
import { format } from "date-fns";
import { Edit2, Trash2, ChevronDown, ChevronRight, Tag, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";

interface Props {
  cards: Card[];
  filterCategory: string | null;
  filterSubcategory?: string | null;
  filterType?: "all" | "essay" | "flash";
  searchQuery?: string;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-success bg-success/10" : score >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>{score}%</span>
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

function TagPopover({ cardId, tags, onToggleTag }: { cardId: string; tags: string[]; onToggleTag: (cardId: string, tag: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`p-2 hover:bg-secondary rounded-lg ${tags.length > 0 ? "text-primary" : ""}`}
        title="Tagovi"
      >
        <Tag className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-md p-1.5 min-w-[200px]">
          {CARD_TAGS.map((t) => {
            const active = tags.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => { onToggleTag(cardId, t.id); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  active ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagBadge({ tagId }: { tagId: string }) {
  const tag = CARD_TAGS.find((t) => t.id === tagId);
  if (!tag) return null;
  const isFrequent = tagId === "često-na-ispitu";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
      isFrequent ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"
    }`}>
      {tag.label}
    </span>
  );
}

export default function CardList({ cards, filterCategory, filterSubcategory, filterType = "all", searchQuery = "", onEdit, onDelete, onToggleTag }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  let filtered = filterCategory ? cards.filter((c) => c.category === filterCategory) : cards;
  if (filterSubcategory) {
    filtered = filtered.filter((c) => c.subcategory === filterSubcategory);
  }
  if (filterType !== "all") {
    filtered = filtered.filter((c) => (c.type || "essay") === filterType);
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
    <div className="space-y-3">
      {filtered.map((card, i) => {
        const expanded = expandedId === card.id;
        const score = getCardScore(card);
        const isFlash = card.type === "flash";
        const cardTags = card.tags || [];
        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-xl bg-card border hover:border-primary/30 transition-colors overflow-hidden"
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
                    {card.subcategory && (
                      <span className="text-xs text-muted-foreground">› {card.subcategory}</span>
                    )}
                    <ScoreBadge score={score} />
                    {isFlash ? (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Blic
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
                    )}
                    {cardTags.map((t) => <TagBadge key={t} tagId={t} />)}
                  </div>
                  <p className="font-serif text-lg line-clamp-2">{card.question}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setExpandedId(expanded ? null : card.id)} className="p-2 hover:bg-secondary rounded-lg">
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {!isFlash && (
                    <TagPopover cardId={card.id} tags={cardTags} onToggleTag={onToggleTag} />
                  )}
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
                        return (
                          <div key={s.id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{s.title}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <ScoreBadge score={sScore} />
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
