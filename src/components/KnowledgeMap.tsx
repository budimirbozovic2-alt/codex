import { useState, useMemo } from "react";
import { Card, SectionState } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, AlertTriangle, CheckCircle, Clock, HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  onBack: () => void;
}

interface MasteryLevel {
  level: number;
  label: string;
  color: string;
  bgClass: string;
  borderClass: string;
}

const MASTERY_LEVELS: MasteryLevel[] = [
  { level: 0, label: "Novo", color: "hsl(var(--muted-foreground))", bgClass: "bg-muted", borderClass: "border-muted-foreground/30" },
  { level: 1, label: "Kritično", color: "hsl(0, 72%, 51%)", bgClass: "bg-[hsl(0,72%,51%)]", borderClass: "border-[hsl(0,72%,51%)]/50" },
  { level: 2, label: "Teško", color: "hsl(25, 95%, 53%)", bgClass: "bg-[hsl(25,95%,53%)]", borderClass: "border-[hsl(25,95%,53%)]/50" },
  { level: 3, label: "Nesigurno", color: "hsl(45, 93%, 47%)", bgClass: "bg-[hsl(45,93%,47%)]", borderClass: "border-[hsl(45,93%,47%)]/50" },
  { level: 4, label: "Stabilno", color: "hsl(142, 60%, 50%)", bgClass: "bg-[hsl(142,60%,50%)]", borderClass: "border-[hsl(142,60%,50%)]/50" },
  { level: 5, label: "Savladano", color: "hsl(142, 60%, 30%)", bgClass: "bg-[hsl(142,60%,30%)]", borderClass: "border-[hsl(142,60%,30%)]/50" },
];

function getCardMasteryLevel(card: Card): number {
  const errorCount = card.errorLog?.reduce((sum, e) => sum + e.count, 0) || 0;
  const allNew = card.sections.every((s) => s.state === SectionState.New);
  if (allNew) return 0;

  const avgStability = card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length;

  // Level 1: Critical — high error rate or very low stability
  if (errorCount > 3 || avgStability < 3) return 1;

  // Level 2: Struggling — errors present, stability 3-7
  if (errorCount > 0 && avgStability < 7) return 2;

  // Level 3: Unsure — stability 8-14 or recent "Hard" grades
  const avgDifficulty = card.sections.reduce((sum, s) => sum + s.difficulty, 0) / card.sections.length;
  if (avgStability < 15 || avgDifficulty >= 6) return 3;

  // Level 4: Stable — stability 15-30
  if (avgStability <= 30) return 4;

  // Level 5: Mastered
  return 5;
}

function getMasteryColor(level: number): string {
  return MASTERY_LEVELS[level]?.color || MASTERY_LEVELS[0].color;
}

export default function KnowledgeMap({ cards, categories, subcategories, onBack }: Props) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const groupedData = useMemo(() => {
    return categories
      .map((cat) => {
        const catCards = cards.filter((c) => c.category === cat);
        if (catCards.length === 0) return null;
        const subs = subcategories[cat] || [];
        const groups: { name: string; cards: { card: Card; level: number }[] }[] = [];

        subs.forEach((sub) => {
          const subCards = catCards.filter((c) => c.subcategory === sub);
          if (subCards.length > 0) {
            groups.push({ name: sub, cards: subCards.map((c) => ({ card: c, level: getCardMasteryLevel(c) })) });
          }
        });

        const uncategorized = catCards.filter((c) => !c.subcategory || !subs.includes(c.subcategory));
        if (uncategorized.length > 0) {
          groups.push({ name: subs.length > 0 ? "Ostalo" : "", cards: uncategorized.map((c) => ({ card: c, level: getCardMasteryLevel(c) })) });
        }

        return { category: cat, groups };
      })
      .filter(Boolean) as { category: string; groups: { name: string; cards: { card: Card; level: number }[] }[] }[];
  }, [cards, categories, subcategories]);

  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    cards.forEach((c) => { counts[getCardMasteryLevel(c)]++; });
    return counts;
  }, [cards]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-3xl font-serif">Mapa Znanja</h2>
          <p className="text-sm text-muted-foreground mt-1">Vizualni pregled savladanosti svih kartica</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 p-4 rounded-xl border bg-card">
        {MASTERY_LEVELS.map((ml, i) => (
          <div key={ml.level} className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: ml.color }} />
            <span className="text-muted-foreground">
              {ml.level}: {ml.label}
              <span className="ml-1 text-foreground font-medium">({levelCounts[i]})</span>
            </span>
          </div>
        ))}
      </div>

      {/* Grid by category */}
      {groupedData.map(({ category, groups }) => (
        <motion.div
          key={category}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <h3 className="text-xl font-serif">{category}</h3>
          {groups.map(({ name, cards: groupCards }) => (
            <div key={name} className="space-y-2">
              {name && <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">{name}</p>}
              <div className="flex flex-wrap gap-1.5">
                {groupCards.map(({ card, level }) => (
                  <Tooltip key={card.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setSelectedCard(card)}
                        className="w-8 h-8 rounded-md transition-all hover:scale-125 hover:z-10 hover:shadow-lg relative"
                        style={{ backgroundColor: getMasteryColor(level) }}
                      >
                        {(card.errorLog?.length || 0) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px]">
                      <p className="font-medium text-xs truncate">{card.question}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Level {level}: {MASTERY_LEVELS[level].label}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      ))}

      {groupedData.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Nema kartica za prikaz</p>
        </div>
      )}

      {/* Detail panel */}
      <AnimatePresence>
        {selectedCard && (
          <CardDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function CardDetailPanel({ card, onClose }: { card: Card; onClose: () => void }) {
  const level = getCardMasteryLevel(card);
  const ml = MASTERY_LEVELS[level];
  const avgStability = card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length;
  const avgDifficulty = card.sections.reduce((sum, s) => sum + s.difficulty, 0) / card.sections.length;
  const errorLog = card.errorLog || [];
  const sortedErrors = [...errorLog].sort((a, b) => new Date(b.lastMissed).getTime() - new Date(a.lastMissed).getTime());
  const sectionContent = card.sections.map((s) => s.content).join("\n");
  const plainContent = sectionContent.replace(/<[^>]+>/g, "");

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
        onClick={(e) => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: ml.color }} />
              <span className="text-xs font-medium" style={{ color: ml.color }}>
                Level {level}: {ml.label}
              </span>
            </div>
            <h3 className="font-serif text-lg leading-tight">{card.question}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {card.category}{card.subcategory ? ` → ${card.subcategory}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="px-5 py-4 border-b grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-serif">{avgStability.toFixed(1)}d</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stabilnost</p>
          </div>
          <div>
            <p className="text-lg font-serif">{avgDifficulty.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Težina</p>
          </div>
          <div>
            <p className="text-lg font-serif">{errorLog.reduce((s, e) => s + e.count, 0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Greške</p>
          </div>
        </div>

        {/* Error list - "List of Struggles" */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h4 className="font-medium text-sm">Lista poteškoća</h4>
          </div>

          {sortedErrors.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <CheckCircle className="h-4 w-4 text-success" />
              Nema zabilježenih grešaka za ovu karticu
            </div>
          ) : (
            <div className="space-y-2">
              {sortedErrors.map((err, i) => {
                const isRecent = (Date.now() - new Date(err.lastMissed).getTime()) < 7 * 24 * 60 * 60 * 1000;
                // Find the line containing this error
                const lines = plainContent.split(/\n+/);
                const matchingLine = lines.find((l) => l.includes(err.text));

                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border text-sm ${isRecent ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}
                  >
                    {isRecent && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <Clock className="h-3 w-3 text-destructive" />
                        <span className="text-[10px] font-medium text-destructive uppercase tracking-wider">Nedavno promašeno</span>
                      </div>
                    )}
                    {matchingLine ? (
                      <HighlightedLine line={matchingLine} errorText={err.text} />
                    ) : (
                      <span className="text-destructive font-medium">{err.text}</span>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>Promašaja: <span className="font-medium text-foreground">{err.count}</span></span>
                      <span>Streak: <span className="font-medium text-foreground">{err.successStreak || 0}</span></span>
                      <span>{new Date(err.lastMissed).toLocaleDateString("sr-Latn")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function HighlightedLine({ line, errorText }: { line: string; errorText: string }) {
  const idx = line.indexOf(errorText);
  if (idx === -1) return <span>{line}</span>;
  const before = line.slice(0, idx);
  const after = line.slice(idx + errorText.length);
  return (
    <span className="leading-relaxed">
      {before}
      <mark className="bg-destructive/15 text-destructive font-medium px-0.5 rounded">{errorText}</mark>
      {after}
    </span>
  );
}
