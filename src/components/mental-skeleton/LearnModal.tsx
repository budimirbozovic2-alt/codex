import { X, ChevronDown, Check } from "lucide-react";
import { useState } from "react";
import { Card } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor } from "@/components/KnowledgeMap";
import { motion, AnimatePresence } from "framer-motion";

const GRADES = [
  { value: 1, label: "1", color: "bg-red-500 hover:bg-red-600" },
  { value: 2, label: "2", color: "bg-orange-500 hover:bg-orange-600" },
  { value: 3, label: "3", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: 4, label: "4", color: "bg-blue-500 hover:bg-blue-600" },
];

interface LearnModalProps {
  card: Card;
  /** Per-section grading callback */
  onGradeSection: (sectionId: string, grade: number) => void;
  onClose: () => void;
}

export default function LearnModal({ card, onGradeSection, onClose }: LearnModalProps) {
  const [revealedSections, setRevealedSections] = useState<Set<string>>(new Set());
  const [gradedSections, setGradedSections] = useState<Record<string, number>>({});

  const toggleSection = (id: string) => {
    setRevealedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGradeSection = (sectionId: string, grade: number) => {
    onGradeSection(sectionId, grade);
    setGradedSections(prev => ({ ...prev, [sectionId]: grade }));
  };

  const handleGradeAll = (grade: number) => {
    card.sections.forEach(s => {
      if (!gradedSections[s.id]) {
        onGradeSection(s.id, grade);
      }
    });
    onClose();
  };

  const allGraded = card.sections.every(s => gradedSections[s.id]);
  const level = getCardMasteryLevel(card);

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
            <h3 className="text-lg font-medium leading-tight">{card.question}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections with per-section grading */}
        <div className="p-5 space-y-3">
          {card.sections.map(section => {
            const graded = gradedSections[section.id];
            return (
              <div key={section.id} className={`border rounded-xl overflow-hidden transition-colors ${graded ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-secondary/30 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {graded && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                    {section.title}
                  </span>
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
                      {/* Per-section grade buttons */}
                      {!graded && (
                        <div className="px-3 pb-3 flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground mr-1">Ocjena:</span>
                          {GRADES.map(g => (
                            <button
                              key={g.value}
                              onClick={() => handleGradeSection(section.id, g.value)}
                              className={`px-3 py-1 rounded-lg text-white text-xs font-medium transition-all hover:scale-105 ${g.color}`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {graded && (
                        <div className="px-3 pb-3">
                          <span className="text-[10px] text-emerald-500">✓ Ocijenjeno: {graded}</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Bottom: Grade All (for ungraded) or Done */}
        <div className="p-5 border-t">
          {allGraded ? (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-all hover:opacity-90"
            >
              Gotovo
            </button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground text-center mb-3">
                Ocijeni sve neocijenjene sekcije odjednom
              </p>
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map(g => (
                  <button
                    key={g.value}
                    onClick={() => handleGradeAll(g.value)}
                    className={`py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:scale-[1.02] ${g.color}`}
                  >
                    {g.value === 1 ? "Pogrešno" : g.value === 2 ? "Teško" : g.value === 3 ? "Dobro" : "Lako"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
