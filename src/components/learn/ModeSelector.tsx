import { ShieldAlert, BookOpen, Brain, Link2, ChevronRight, HelpCircle, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { Card } from "@/lib/spaced-repetition";
import { LearnMode, ReviewLogEntry } from "@/lib/storage";
import { motion, AnimatePresence } from "framer-motion";
import LearnOnboarding from "@/components/LearnOnboarding";

interface Props {
  cards: Card[];
  learnMode: LearnMode;
  dueCount: number;
  reviewLog: ReviewLogEntry[];
  onSelectMode: (mode: LearnMode) => void;
}

export default function ModeSelector({ cards, learnMode, dueCount, reviewLog, onSelectMode }: Props) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const chainCount = useMemo(() => cards.filter(c => c.type === "essay" && c.sections.length >= 3).length, [cards]);

  const modes: { key: LearnMode; label: string; level: string; levelColor: string; desc: string; tip: string; icon: typeof BookOpen }[] = [
    { key: "free", label: "Slobodno učenje", level: "Lak", levelColor: "bg-success/15 text-success", desc: "Prolazi kroz materijal svojim tempom. Čitaj i označavaj pročitano.", tip: "Idealno za prvi susret sa gradivom — bez pritiska ocjenjivanja.", icon: BookOpen },
    { key: "active-recall", label: "Aktivno prisjećanje", level: "Srednji", levelColor: "bg-warning/15 text-warning", desc: "Pregledaj pa reprodukuj. Ocijeni svoje znanje za svaki modul.", tip: "Naučno najefektivniji metod učenja.", icon: Brain },
    { key: "chain", label: "Metod lanca", level: "Teški", levelColor: "bg-destructive/15 text-destructive", desc: "Snowball tehnika: ponovi cijeli lanac modula bez greške.", tip: "Kumulativno ponavljanje: svaki novi modul zahtijeva reprodukciju svih prethodnih.", icon: Link2 },
  ];

  // Review priority warning
  const reviewWarning = useMemo(() => {
    const totalSections = cards.reduce((s, c) => s + c.sections.length, 0);
    const learnedSections = cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0);
    if (totalSections === 0) return null;
    const progress = Math.round((learnedSections / totalSections) * 100);
    const targetReviewPct = Math.max(5, progress);
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayStr).getTime();
    const todayEntries = reviewLog.filter(e => e.timestamp >= todayStart);
    if (todayEntries.length < 3) return null;
    const sectionFirstSeen = new Map<string, number>();
    reviewLog.forEach(e => {
      const key = `${e.cardId}:${e.sectionId}`;
      const prev = sectionFirstSeen.get(key);
      if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
    });
    let reviewCount = 0, newCount = 0;
    todayEntries.forEach(e => {
      const key = `${e.cardId}:${e.sectionId}`;
      const firstSeen = sectionFirstSeen.get(key) || e.timestamp;
      if (firstSeen < todayStart) reviewCount++; else newCount++;
    });
    const total = reviewCount + newCount;
    const actualReviewPct = total > 0 ? Math.round((reviewCount / total) * 100) : 0;
    const deficit = targetReviewPct - actualReviewPct;
    if (deficit <= 15) return null;
    return { progress, targetReviewPct, actualReviewPct };
  }, [cards, reviewLog]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
      <AnimatePresence>
        {showOnboarding && <LearnOnboarding onComplete={() => setShowOnboarding(false)} />}
      </AnimatePresence>

      {dueCount > 50 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Previše dospjelih kartica ({dueCount})</p>
            <p className="text-xs text-muted-foreground mt-0.5">Preporučujemo da prvo ponovite bar polovinu dospjelih kartica prije učenja novog materijala.</p>
          </div>
        </motion.div>
      )}

      {reviewWarning && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Prioritet: ponavljanje</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tvoj progres ({reviewWarning.progress}%) zahtijeva ~{reviewWarning.targetReviewPct}% fokusa na ponavljanje, ali danas je samo {reviewWarning.actualReviewPct}%.
            </p>
          </div>
        </motion.div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="imperial-title">Učenje</h2>
            <p className="text-muted-foreground mt-2">Izaberi režim učenja koji odgovara tvom nivou.</p>
          </div>
          <button onClick={() => setShowOnboarding(true)}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Vodič kroz režime učenja">
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {modes.map(({ key, label, level, levelColor, desc, tip, icon: Icon }) => {
          const disabled = key === "chain" && chainCount === 0;
          return (
            <button key={key}
              onClick={() => { if (!disabled) onSelectMode(key); }}
              disabled={disabled}
              className={`rounded-xl border p-5 text-left transition-all flex items-start gap-4 ${
                disabled ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50 hover:shadow-sm cursor-pointer"
              } ${learnMode === key ? "border-primary bg-primary/5" : "bg-card"}`}>
              <div className={`p-3 rounded-xl ${levelColor}`}><Icon className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{label}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${levelColor}`}>{level}</span>
                </div>
                <p className="text-sm text-muted-foreground">{desc}</p>
                <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">{tip}</p>
                {key === "chain" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {chainCount > 0 ? `${chainCount} pitanja dostupno` : "Potrebna esejska pitanja sa ≥3 modula"}
                  </p>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
