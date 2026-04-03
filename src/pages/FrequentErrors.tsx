import { Trash2, AlertCircle, Target, TrendingUp, Trophy, ChevronDown, ChevronRight, Flame, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, ErrorLogEntry, getErrorStatus, ErrorStatus } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import { getSubcategoryName } from "@/lib/category-service";


import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
interface AggregatedError {
  text: string;
  count: number;
  recentSuccesses: number;
  successStreak: number;
  lastMissed: string;
  cardQuestion: string;
  cardId: string;
  category: string;
  subcategory?: string;
  status: ErrorStatus;
  sectionContent: string; // full section text for sentence extraction
}

/** Find the line containing `errorText` and return JSX with the error highlighted */
function HighlightedSentence({ sectionContent, errorText }: { sectionContent: string; errorText: string }) {
  // Strip HTML tags for plain text matching
  const plain = sectionContent.replace(/<[^>]+>/g, "");

  // Split by newlines to find the line containing the error
  const lines = plain.split(/\n+/);
  const matchingLine = lines.find((l) => l.includes(errorText));

  if (!matchingLine) {
    return <span className="text-destructive font-medium">{errorText}</span>;
  }

  const idx = matchingLine.indexOf(errorText);
  const before = matchingLine.slice(0, idx);
  const after = matchingLine.slice(idx + errorText.length);

  return (
    <span className="text-sm leading-relaxed">
      {before}
      <mark className="bg-destructive/15 text-destructive font-medium px-0.5 rounded">{errorText}</mark>
      {after}
    </span>
  );
}

interface Props {
  cards: Card[];
  categoryRecords: CategoryRecord[];
  onClearErrorLog: (cardId: string) => void;
  embedded?: boolean;
}

function StatusBadge({ status }: { status: ErrorStatus }) {
  const config = {
    critical: { label: "Kritično", className: "bg-destructive/10 text-destructive" },
    recovering: { label: "U fazi oporavka", className: "bg-warning/10 text-warning" },
    mastered: { label: "Savladano", className: "bg-success/10 text-success" },
  };
  const { label, className } = config[status];
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${className}`}>{label}</span>;
}

function ProgressBar({ count, successes, streak }: { count: number; successes: number; streak: number }) {
  const total = count + successes;
  const pct = total > 0 ? Math.round((successes / total) * 100) : 0;
  const color = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{pct}% uspješnost</span>
        {streak > 0 && (
          <span className="flex items-center gap-0.5 text-success">
            <Flame className="h-3 w-3" /> {streak}× zaredom tačno
          </span>
        )}
      </div>
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export default function FrequentErrors({ cards, categoryRecords, onClearErrorLog, embedded }: Props) {
  
  const [showMastered, setShowMastered] = useState(false);

  const catNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of categoryRecords) {
      map[r.id] = r.name;
      for (const sub of (r.subcategories || [])) {
        map[sub.id] = sub.name;
      }
    }
    return map;
  }, [categoryRecords]);

  const { criticalAndRecovering, mastered, totalErrors, cardIdsWithErrors } = useMemo(() => {
    const allErrors: AggregatedError[] = [];
    const cardIdsWithErrors = new Set<string>();

    cards.forEach((card) => {
      // Collect all section content for sentence matching
      const allContent = card.sections.map((s) => s.content).join(" ");
      (card.errorLog || []).forEach((entry) => {
        cardIdsWithErrors.add(card.id);
        allErrors.push({
          text: entry.text,
          count: entry.count,
          recentSuccesses: entry.recentSuccesses || 0,
          successStreak: entry.successStreak || 0,
          lastMissed: entry.lastMissed,
          cardQuestion: card.question,
          cardId: card.id,
          category: card.categoryId,
          subcategory: card.subcategoryId,
          status: getErrorStatus(entry),
          sectionContent: allContent,
        });
      });
    });

    const mastered = allErrors.filter((e) => e.status === "mastered");
    const criticalAndRecovering = allErrors
      .filter((e) => e.status !== "mastered")
      .sort((a, b) => {
        // Critical first, then recovering; within each, by count desc
        if (a.status === "critical" && b.status !== "critical") return -1;
        if (a.status !== "critical" && b.status === "critical") return 1;
        return b.count - a.count;
      });

    return { criticalAndRecovering, mastered, totalErrors: allErrors.length, cardIdsWithErrors };
  }, [cards]);

  // Group by category
  const groupByCategory = (errors: AggregatedError[]) => {
    const grouped: Record<string, AggregatedError[]> = {};
    errors.forEach((e) => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });
    return Object.entries(grouped).sort(
      (a, b) => b[1].reduce((s, e) => s + e.count, 0) - a[1].reduce((s, e) => s + e.count, 0)
    );
  };

  const activeGroups = groupByCategory(criticalAndRecovering);
  const masteredGroups = groupByCategory(mastered);

  const handleClear = (cardId: string, cardQuestion: string) => {
    onClearErrorLog(cardId);
    toast({ title: "Greške obrisane", description: `Obrisane greške za: "${cardQuestion.length > 30 ? cardQuestion.slice(0, 30) + "…" : cardQuestion}"` });
  };

  // Get unique cards with errors for the clear buttons
  const cardsWithErrors = useMemo(() => {
    return cards.filter((c) => (c.errorLog || []).length > 0);
  }, [cards]);

  return (
    <div className={embedded ? "space-y-6" : "max-w-3xl mx-auto space-y-8"}>
      {!embedded && (
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h1 className="imperial-title">Najčešće greške</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {totalErrors === 0
                  ? "Još nema zabilježenih grešaka."
                  : `${criticalAndRecovering.length} aktivn${criticalAndRecovering.length === 1 ? "a" : "e"} · ${mastered.length} savladan${mastered.length === 1 ? "a" : "e"}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {embedded && totalErrors > 0 && (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm text-muted-foreground">
            {`${criticalAndRecovering.length} aktivn${criticalAndRecovering.length === 1 ? "a" : "e"} · ${mastered.length} savladan${mastered.length === 1 ? "a" : "e"}`}
          </p>
        </div>
      )}

      {/* Legend */}
      {totalErrors > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-destructive" /> Kritično</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" /> U fazi oporavka</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" /> Savladano (5+ zaredom)</span>
        </div>
      )}

      {totalErrors === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 space-y-4">
          <Target className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">
            Tokom ponavljanja, označi tekst koji si promašio i pritisni <kbd className="px-1.5 py-0.5 rounded bg-secondary border text-xs font-mono">N</kbd> da zabilježiš grešku.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {/* Active errors (Critical + Recovering) */}
          {activeGroups.map(([category, errors]) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <div className="px-5 py-3 bg-secondary/30 border-b flex items-center justify-between">
                <h3 className="font-medium text-sm">{catNameMap[category] || category}</h3>
                <span className="text-xs text-muted-foreground">
                  {errors.reduce((s, e) => s + e.count, 0)} promašaja
                </span>
              </div>
              <div className="divide-y">
                {errors.map((error, i) => (
                  <div key={`${error.cardId}-${i}`} className="px-5 py-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <span className={`text-lg font-serif font-bold tabular-nums min-w-[2rem] text-right ${error.status === "critical" ? "text-destructive" : "text-warning"}`}>
                        {error.count}×
                      </span>
                      <div className="flex-1 min-w-0">
                        <HighlightedSentence sectionContent={error.sectionContent} errorText={error.text} />
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {error.cardQuestion}
                          {error.subcategory && <span> · {catNameMap[error.subcategory] || error.subcategory}</span>}
                        </p>
                      </div>
                      <StatusBadge status={error.status} />
                    </div>
                    <div className="ml-[2rem] pl-3">
                      <ProgressBar count={error.count} successes={error.recentSuccesses} streak={error.successStreak} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Clear error log per card */}
          {cardsWithErrors.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                Obriši greške po kartici
              </h3>
              <div className="space-y-1.5">
                {cardsWithErrors.map((card) => (
                  <div key={card.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-sm flex-1 min-w-0 truncate text-muted-foreground">{card.question}</span>
                    <span className="text-xs text-muted-foreground">{(card.errorLog || []).length} greš.</span>
                    <button
                      onClick={() => handleClear(card.id, card.question)}
                      className="text-xs px-2.5 py-1 rounded-md border text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      Obriši
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mastered section */}
          {mastered.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setShowMastered(!showMastered)}
                className="flex items-center gap-2 text-sm font-medium text-success hover:text-success/80 transition-colors"
              >
                {showMastered ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <ShieldCheck className="h-4 w-4" />
                Savladano ({mastered.length})
              </button>

              <AnimatePresence>
                {showMastered && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {masteredGroups.map(([category, errors]) => (
                      <div key={category} className="rounded-xl border border-success/20 bg-success/5 overflow-hidden mb-3">
                        <div className="px-5 py-2.5 border-b border-success/10 flex items-center justify-between">
                          <h3 className="font-medium text-sm text-success">{catNameMap[category] || category}</h3>
                          <Trophy className="h-4 w-4 text-success/50" />
                        </div>
                        <div className="divide-y divide-success/10">
                          {errors.map((error, i) => (
                            <div key={`${error.cardId}-${i}`} className="px-5 py-3 flex items-start gap-3">
                              <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <HighlightedSentence sectionContent={error.sectionContent} errorText={error.text} />
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {error.cardQuestion}
                                  {error.subcategory && <span> · {catNameMap[error.subcategory] || error.subcategory}</span>}
                                </p>
                              </div>
                              <span className="flex items-center gap-0.5 text-[10px] text-success">
                                <Flame className="h-3 w-3" /> {error.successStreak}×
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
