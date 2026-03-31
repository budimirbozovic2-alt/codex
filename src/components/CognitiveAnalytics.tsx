


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
import LazyChart from "@/components/LazyChart";
interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  catNameMap: Record<string, string>;
}

export default function CognitiveAnalytics({ cards, categories, reviewLog, catNameMap }: Props) {
  return (
    <div className="space-y-6">
      {/* 1. Interference Index */}
      <LazyChart
        label="Indeks interferencije"
        icon={<AlertTriangle className="h-4 w-4 text-warning" />}
        compute={() => calcInterferencePairs(cards)}
        delay={0}
      >
        {(pairs) => pairs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nema detektovanih interferencija.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Parovi kartica sa sličnim greškama — potrebno razgraničenje pojmova.</p>
            {pairs.map((pair, i) => (
              <div key={i} className="p-3 rounded-lg border border-warning/20 bg-warning/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-warning">Interferentni par</span>
                  <span className="text-xs text-muted-foreground">Skor: {pair.score}%</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="text-xs p-2 rounded-md bg-background border">
                    <p className="font-medium truncate">{pair.cardA.question}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">{catNameMap[pair.cardA.category] || pair.cardA.category}</p>
                  </div>
                  <div className="text-xs p-2 rounded-md bg-background border">
                    <p className="font-medium truncate">{pair.cardB.question}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">{catNameMap[pair.cardB.category] || pair.cardB.category}</p>
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
        )}
      </LazyChart>

      {/* 2. Memory Stability */}
      <LazyChart
        label="Stabilnost memorije"
        icon={<Shield className="h-4 w-4 text-primary" />}
        compute={() => {
          const planner = loadPlanner();
          return calcCategoryStability(cards, categories, planner.finalGoalDate);
        }}
        delay={1}
      >
        {(stabilityData) => stabilityData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nedovoljno podataka.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Procijenjeno vrijeme do zaborava po kategoriji.</p>
            {stabilityData.sort((a, b) => a.avgStability - b.avgStability).map(cat => {
              const retPct = Math.round(cat.avgRetrievability * 100);
              const stabDays = Math.round(cat.avgStability * 10) / 10;
              return (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{catNameMap[cat.category] || cat.category}</span>
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
            {stabilityData.some(s => s.criticalSections > 0) && (
              <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                <p className="text-xs font-medium text-destructive">Kritične zone</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Informacije označene iznad će biti zaboravljene u sedmici ispita ako ih ne ponoviš ranije.
                </p>
              </div>
            )}
          </div>
        )}
      </LazyChart>

      {/* 3. Stress-Performance */}
      <LazyChart
        label="Otpornost na stres"
        icon={<Zap className="h-4 w-4 text-primary" />}
        compute={() => calcStressPerformance(reviewLog)}
        delay={2}
      >
        {(stressPerf) => !stressPerf ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nedovoljno podataka.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Usporedba tačnosti u normalnim vs. brzim (stresnim) odgovorima.</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-2xl tabular-nums">{stressPerf.normalAvgGrade}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Normalni ({stressPerf.normalCount})</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-2xl tabular-nums">{stressPerf.stressAvgGrade}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Stresni ({stressPerf.stressCount})</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className={`text-2xl tabular-nums ${stressPerf.stressResistance >= 70 ? "text-success" : stressPerf.stressResistance >= 40 ? "text-warning" : "text-destructive"}`}>
                  {stressPerf.stressResistance}%
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Otpornost</p>
              </div>
            </div>
            <Progress value={stressPerf.stressResistance} className="h-2" />
          </div>
        )}
      </LazyChart>

      {/* 4. Friction Analysis */}
      <LazyChart
        label="Analiza frikcije"
        icon={<ArrowRightLeft className="h-4 w-4 text-primary" />}
        compute={() => calcFrictionAnalysis(reviewLog)}
        delay={3}
      >
        {(friction) => friction.transitions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nedovoljno podataka.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Vrijeme tranzicije između predmeta.</p>
            {friction.transitions.slice(0, 6).map((t, i) => (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${t.isSlow ? "border border-warning/20 bg-warning/5" : "bg-secondary/30"}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-xs font-medium">{catNameMap[t.fromCategory] || t.fromCategory}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="truncate text-xs font-medium">{catNameMap[t.toCategory] || t.toCategory}</span>
                </div>
                <span className={`text-xs tabular-nums font-medium ${t.isSlow ? "text-warning" : "text-muted-foreground"}`}>
                  {t.avgTransitionMinutes} min
                </span>
              </div>
            ))}
            {friction.suggestion && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-xs text-muted-foreground">💡 {friction.suggestion}</p>
              </div>
            )}
          </div>
        )}
      </LazyChart>

      {/* 5. Recovery Rate */}
      <LazyChart
        label="Indeks oporavka"
        icon={<HeartPulse className="h-4 w-4 text-primary" />}
        compute={() => calcRecoveryRate()}
        delay={4}
      >
        {(recovery) => !recovery ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nedovoljno podataka.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Koliko brzo se vraćaš na "Vrijedan" nakon "Lijen" dana.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className={`text-2xl tabular-nums ${recovery.recoveryIndex >= 70 ? "text-success" : recovery.recoveryIndex >= 40 ? "text-warning" : "text-destructive"}`}>
                  {recovery.recoveryIndex}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Indeks</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-2xl tabular-nums">{recovery.avgRecoveryDays}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Prosjek dana</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-2xl tabular-nums text-success">{recovery.fastRecoveries}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Brzi (≤1d)</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-2xl tabular-nums text-destructive">{recovery.slowRecoveries}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Spori (≥3d)</p>
              </div>
            </div>
            <Progress value={recovery.recoveryIndex} className="h-2" />
          </div>
        )}
      </LazyChart>

      {/* 6. Blind Spots */}
      <LazyChart
        label="Slijepe tačke"
        icon={<Eye className="h-4 w-4 text-destructive" />}
        compute={() => calcBlindSpots(cards)}
        delay={5}
      >
        {(blindSpots) => blindSpots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nema detektovanih slijepih tačaka.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Kartice sa visokom sigurnošću, ali lošim rezultatom — iluzija znanja.</p>
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
        )}
      </LazyChart>

      {/* 7. Weak Hooks */}
      <LazyChart
        label="Slabe kuke"
        icon={<Wrench className="h-4 w-4 text-warning" />}
        compute={() => calcWeakHooks()}
        delay={6}
      >
        {(weakHooks) => weakHooks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nema slabih kuka.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Kartice sa kukama, ali sporim prisjećanjem (&gt;3s).</p>
            {weakHooks.map((hook, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-warning/20 bg-warning/5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{hook.question}</p>
                  <p className="text-[10px] text-muted-foreground">{hook.category} • {(hook.avgLatencyMs / 1000).toFixed(1)}s prosjek</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </LazyChart>
    </div>
  );
}
