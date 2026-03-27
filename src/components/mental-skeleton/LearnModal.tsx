import { X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Card } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor } from "@/components/KnowledgeMap";
import { motion, AnimatePresence } from "framer-motion";

interface LearnModalProps {
  card: Card;
  onGrade: (grade: number) => void;
  onClose: () => void;
}

export default function LearnModal({ card, onGrade, onClose }: LearnModalProps) {
  const [revealedSections, setRevealedSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setRevealedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const level = getCardMasteryLevel(card);
  const grades = [
    { value: 1, label: "Pogrešno", color: "bg-red-500 hover:bg-red-600" },
    { value: 2, label: "Teško", color: "bg-orange-500 hover:bg-orange-600" },
    { value: 3, label: "Dobro", color: "bg-emerald-500 hover:bg-emerald-600" },
    { value: 4, label: "Lako", color: "bg-blue-500 hover:bg-blue-600" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: getMasteryColor(level) }} />
              <span className="text-xs text-muted-foreground">{card.category} → {card.subcategory}</span>
              {card.chapter && <span className="text-xs text-muted-foreground">→ {card.chapter}</span>}
            </div>
            <h3 className="font-display text-lg leading-tight">{card.question}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <div className="p-5 space-y-3">
          {card.sections.map(section => (
            <div key={section.id} className="border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-secondary/30 transition-colors"
              >
                <span>{section.title}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${revealedSections.has(section.id) ? "" : "-rotate-90"}`} />
              </button>
              <AnimatePresence>
                {revealedSections.has(section.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="p-3 pt-0 text-sm prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: section.content }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Grade buttons */}
        <div className="p-5 border-t">
          <p className="text-xs text-muted-foreground text-center mb-3">Ocijeni svoje znanje</p>
          <div className="grid grid-cols-4 gap-2">
            {grades.map(g => (
              <button
                key={g.value}
                onClick={() => onGrade(g.value)}
                className={`py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:scale-[1.02] ${g.color}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
