import { Card, getCardScore, getSectionScore } from "@/lib/spaced-repetition";
import { format } from "date-fns";
import { Edit2, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface Props {
  cards: Card[];
  filterCategory: string | null;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
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

export default function CardList({ cards, filterCategory, onEdit, onDelete }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = filterCategory ? cards.filter((c) => c.category === filterCategory) : cards;

  if (filtered.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Nema kartica. Kreirajte prvu!</p>;
  }

  return (
    <div className="space-y-3">
      {filtered.map((card, i) => {
        const expanded = expandedId === card.id;
        const score = getCardScore(card);
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
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
                    <ScoreBadge score={score} />
                    <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
                  </div>
                  <p className="font-serif text-lg line-clamp-2">{card.question}</p>
                </div>
                <div className="flex gap-1">
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
                    {card.sections.map((s) => {
                      const sScore = getSectionScore(s);
                      return (
                        <div key={s.id} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{s.title}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ScoreBadge score={sScore} />
                              <span>Int: {s.interval}d</span>
                              <span>Sljedeće: {format(new Date(s.nextReview), "dd.MM")}</span>
                            </div>
                          </div>
                          <SectionBar score={sScore} />
                          <p className="text-sm text-muted-foreground line-clamp-2">{s.content}</p>
                        </div>
                      );
                    })}
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
