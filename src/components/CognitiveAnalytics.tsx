import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Shield, Zap, ArrowRightLeft, HeartPulse, Brain, TrendingUp, Eye, Wrench } from "lucide-react";
import { Card } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { Progress } from "@/components/ui/progress";
import {
  calcInterferencePairs,
  calcCategoryStability,
  calcStressPerformance,
  calcFrictionAnalysis,
  calcRecoveryRate,
  calcBlindSpots,
  calcWeakHooks,
} from "@/lib/cognitive-analytics";
import { loadPlanner } from "@/lib/planner-storage";

interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  onSendToWorkshop?: (cardId: string) => void;
}

export default function CognitiveAnalytics({ cards, categories, reviewLog, onSendToWorkshop }: Props) {
  const interferencePairs = useMemo(() => calcInterferencePairs(cards), [cards]);
  const planner = useMemo(() => loadPlanner(), []);
  const stabilityData = useMemo(() => calcCategoryStability(cards, categories, planner.finalGoalDate), [cards, categories, planner]);
  const stressPerf = useMemo(() => calcStressPerformance(reviewLog), [reviewLog]);
  const friction = useMemo(() => calcFrictionAnalysis(reviewLog), [reviewLog]);
  const recovery = useMemo(() => calcRecoveryRate(), []);
  const blindSpots = useMemo(() => calcBlindSpots(cards), [cards]);
  const weakHooks = useMemo(() => calcWeakHooks(), []);

  const hasCriticalZones = stabilityData.some(s => s.criticalSections > 0);
  const hasAnyData = interferencePairs.length > 0 || stabilityData.length > 0 || stressPerf || friction.transitions.length > 0 || recovery || blindSpots.length > 0 || weakHooks.length > 0;

  if (!hasAnyData) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-2">
        <Brain className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Nedovoljno podataka za kognitivnu analitiku. Nastavi sa učenjem!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Interference Index */}
      {interferencePairs.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="font-serif text-lg">Indeks interferencije</h3>
          </div>
          <p className="text-xs text-muted-foreground">Parovi kartica sa sličnim greškama — potrebno razgraničenje pojmova.</p>

          <div className="space-y-3">
            {interferencePairs.map((pair, i) => (
              <div key={i} className="p-3 rounded-lg border border-warning/20 bg-warning/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-warning">Interferentni par</span>
                  <span className="text-xs text-muted-foreground">Skor: {pair.score}%</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="text-xs p-2 rounded-md bg-background border">
                    <p className="font-medium truncate">{pair.cardA.question}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">{pair.cardA.category}</p>
                  </div>
                  <div className="text-xs p-2 rounded-md bg-background border">
                    <p className="font-medium truncate">{pair.cardB.question}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">{pair.cardB.category}</p>
                  </div>
                </div>
                {pair.sharedErrors.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Zajedničke greške: {pair.sharedErrors.map(e => `"${e.slice(0, 30)}…"`).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 2. Memory Stability Score */}
      {stabilityData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-lg">Stabilnost memorije</h3>
          </div>
          <p className="text-xs text-muted-foreground">Procijenjeno vrijeme do zaborava po kategoriji.</p>

          <div className="space-y-3">
            {stabilityData.sort((a, b) => a.avgStability - b.avgStability).map(cat => {
              const retPct = Math.round(cat.avgRetrievability * 100);
              const stabDays = Math.round(cat.avgStability * 10) / 10;
              return (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{cat.category}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{stabDays}d stabilnost • {retPct}% pamćenje</span>
                  </div>
                  <Progress value={retPct} className="h-2" />
                  {cat.criticalSections > 0 && (
                    <p className="text-[10px] text-destructive font-medium">
                      ⚠ {cat.criticalSections} od {cat.totalSections} cjelina će pasti ispod 85% do ispita!
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {hasCriticalZones && (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
              <p className="text-xs font-medium text-destructive">Kritične zone</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Informacije označene iznad će biti zaboravljene u sedmici ispita ako ih ne ponoviš ranije. Fokusiraj se na kategorije sa najnižom stabilnošću.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* 3. Stress-Performance Index */}
      {stressPerf && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-lg">Otpornost na stres</h3>
          </div>
          <p className="text-xs text-muted-foreground">Usporedba tačnosti u normalnim vs. brzim (stresnim) odgovorima.</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-serif tabular-nums">{stressPerf.normalAvgGrade}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Normalni ({stressPerf.normalCount})</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-serif tabular-nums">{stressPerf.stressAvgGrade}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Stresni ({stressPerf.stressCount})</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className={`text-2xl font-serif tabular-nums ${stressPerf.stressResistance >= 70 ? "text-success" : stressPerf.stressResistance >= 40 ? "text-warning" : "text-destructive"}`}>
                {stressPerf.stressResistance}%
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Otpornost</p>
            </div>
          </div>

          <Progress value={stressPerf.stressResistance} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {stressPerf.stressResistance >= 70
              ? "Odlična otpornost — tvoje znanje je stabilno pod pritiskom."
              : stressPerf.stressResistance >= 40
              ? "Umjerena otpornost — pod pritiskom dolazi do grešaka. Vježbaj aktivno prisjećanje."
              : "Niska otpornost — znanje se raspada pod pritiskom. Fokus na dublje razumijevanje."}
          </p>
        </motion.div>
      )}

      {/* 4. Friction Analysis */}
      {friction.transitions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-lg">Analiza frikcije</h3>
          </div>
          <p className="text-xs text-muted-foreground">Vrijeme tranzicije između predmeta. Spore tranzicije (&gt;10 min) ukazuju na gubitak fokusa.</p>

          <div className="space-y-2">
            {friction.transitions.slice(0, 6).map((t, i) => (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${t.isSlow ? "border border-warning/20 bg-warning/5" : "bg-secondary/30"}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-xs font-medium">{t.fromCategory}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="truncate text-xs font-medium">{t.toCategory}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs tabular-nums font-medium ${t.isSlow ? "text-warning" : "text-muted-foreground"}`}>
                    {t.avgTransitionMinutes} min
                  </span>
                  <span className="text-[10px] text-muted-foreground">({t.count}×)</span>
                </div>
              </div>
            ))}
          </div>

          {friction.suggestion && (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
              <p className="text-xs text-muted-foreground">💡 {friction.suggestion}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* 5. Recovery Rate */}
      {recovery && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-lg">Indeks oporavka</h3>
          </div>
          <p className="text-xs text-muted-foreground">Koliko brzo se vraćaš na "Vrijedan" (🚀) nakon "Lijen" (🐢) dana.</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className={`text-2xl font-serif tabular-nums ${recovery.recoveryIndex >= 70 ? "text-success" : recovery.recoveryIndex >= 40 ? "text-warning" : "text-destructive"}`}>
                {recovery.recoveryIndex}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Indeks</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-serif tabular-nums">{recovery.avgRecoveryDays}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Prosjek dana</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-serif tabular-nums text-success">{recovery.fastRecoveries}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Brzi (≤1d)</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-serif tabular-nums text-destructive">{recovery.slowRecoveries}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Spori (≥3d)</p>
            </div>
          </div>

          <Progress value={recovery.recoveryIndex} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {recovery.recoveryIndex >= 70
              ? "Visoka psihološka snaga — brzo se oporavljaš od neproduktivnih dana."
              : recovery.recoveryIndex >= 40
              ? "Umjerena dosljednost — ponekad se teško vraćaš na ritam."
              : "Niska dosljednost — radi na postavljanju malih ciljeva za sutradan kada imaš lošiji dan."}
          </p>
        </motion.div>
      )}

      {/* 6. Blind Spot Detector */}
      {blindSpots.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-destructive" />
            <h3 className="font-serif text-lg">Slijepe tačke</h3>
          </div>
          <p className="text-xs text-muted-foreground">Kartice gdje je sigurnost bila visoka (4-5), ali rezultat loš (1-2). Iluzija znanja — prioritet za ponavljanje.</p>

          <div className="space-y-2">
            {blindSpots.slice(0, 8).map((spot, i) => (
              <div key={i} className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium truncate flex-1">{spot.question}</p>
                  <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">{spot.occurrences}× detektovano</span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-muted-foreground">{spot.category}</span>
                  <span className="text-warning">Sigurnost: {spot.confidence}/5</span>
                  <span className="text-destructive">Ocjena: {spot.actualGrade}/4</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            <p className="text-xs font-medium text-destructive">⚠ Preporuka</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Ove kartice zahtijevaju Feynman provjeru — objasni gradivo naglas bez gledanja. Forsiraj ih kroz mod "Testiranje kuka".
            </p>
          </div>
        </motion.div>
      )}

      {/* 7. Hook Quality Auditor */}
      {weakHooks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-warning" />
            <h3 className="font-serif text-lg">Slabe kuke</h3>
          </div>
          <p className="text-xs text-muted-foreground">Kartice sa iskovanih kukama, ali latencijom prisjećanja &gt;3 sekunde. Kuke treba ojačati.</p>

          <div className="space-y-2">
            {weakHooks.map((hook, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-warning/20 bg-warning/5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{hook.question}</p>
                  <p className="text-[10px] text-muted-foreground">{hook.category} • {(hook.avgLatencyMs / 1000).toFixed(1)}s prosjek</p>
                </div>
                {onSendToWorkshop && (
                  <button
                    onClick={() => onSendToWorkshop(hook.originalCardId)}
                    className="ml-2 flex-shrink-0 text-[10px] px-2 py-1 rounded-md bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                  >
                    Radionica →
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
