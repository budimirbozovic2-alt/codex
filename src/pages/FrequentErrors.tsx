import { useMemo } from "react";
import { Card, ErrorLogEntry } from "@/lib/spaced-repetition";
import { ArrowLeft, AlertCircle, Target } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface AggregatedError {
  text: string;
  count: number;
  lastMissed: string;
  cardQuestion: string;
  cardId: string;
  category: string;
  subcategory?: string;
}

interface Props {
  cards: Card[];
  onBack: () => void;
}

export default function FrequentErrors({ cards, onBack }: Props) {
  const { grouped, totalErrors } = useMemo(() => {
    const allErrors: AggregatedError[] = [];
    cards.forEach((card) => {
      (card.errorLog || []).forEach((entry) => {
        allErrors.push({
          text: entry.text,
          count: entry.count,
          lastMissed: entry.lastMissed,
          cardQuestion: card.question,
          cardId: card.id,
          category: card.category,
          subcategory: card.subcategory,
        });
      });
    });

    allErrors.sort((a, b) => b.count - a.count);

    const grouped: Record<string, AggregatedError[]> = {};
    allErrors.forEach((e) => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });

    return { grouped, totalErrors: allErrors.length };
  }, [cards]);

  const categoryEntries = Object.entries(grouped).sort(
    (a, b) => b[1].reduce((s, e) => s + e.count, 0) - a[1].reduce((s, e) => s + e.count, 0)
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-serif">Najčešće greške</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {totalErrors === 0 ? "Još nema zabilježenih grešaka." : `${totalErrors} zabilježen${totalErrors === 1 ? "a greška" : "ih grešaka"} ukupno`}
            </p>
          </div>
        </div>
      </div>

      {totalErrors === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 space-y-4">
          <Target className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">
            Tokom ponavljanja, označi tekst koji si promašio i pritisni <kbd className="px-1.5 py-0.5 rounded bg-secondary border text-xs font-mono">N</kbd> da zabilježiš grešku.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {categoryEntries.map(([category, errors]) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <div className="px-5 py-3 bg-secondary/30 border-b flex items-center justify-between">
                <h3 className="font-medium text-sm">{category}</h3>
                <span className="text-xs text-muted-foreground">
                  {errors.reduce((s, e) => s + e.count, 0)} ukupno promašaja
                </span>
              </div>
              <div className="divide-y">
                {errors.map((error, i) => {
                  const severity = error.count >= 10 ? "text-destructive" : error.count >= 5 ? "text-warning" : "text-muted-foreground";
                  return (
                    <div key={`${error.cardId}-${i}`} className="px-5 py-3 flex items-start gap-3">
                      <span className={`text-lg font-serif font-bold tabular-nums min-w-[2rem] text-right ${severity}`}>
                        {error.count}×
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">{error.text}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {error.cardQuestion}
                          {error.subcategory && <span> · {error.subcategory}</span>}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(error.lastMissed).toLocaleDateString("sr-Latn")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}