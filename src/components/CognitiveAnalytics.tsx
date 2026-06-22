import { AlertTriangle, Shield, Zap, ArrowRightLeft, HeartPulse, Eye, Wrench } from "lucide-react";
import { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { Progress } from "@/components/ui/progress";
import { runWeakHooksAnalysis } from "@/lib/services/weakHooksService";
import { analyticsClient } from "@/lib/analytics/workerClient";
import { loadPlanner } from "@/domains/planner";
import LazyChart from "@/components/LazyChart";
import InfoPanel from "@/components/InfoPanel";
import { useCognitiveStats } from "@/hooks/useCognitiveStats";

interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  catNameMap: Record<string, string>;
  /** When set, restricts to a single subject and hides cross-category sections (friction, recovery, weak hooks). */
  categoryId?: string;
}

/** Small reusable list item for the "Korišćeni podaci" section inside an InfoPanel. */
function DataRow({ label, value }: { label: string; value: number | string }) {
  return (
    <li className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">{value}</span>
    </li>
  );
}

export default function CognitiveAnalytics({ cards, categories, reviewLog, catNameMap, categoryId }: Props) {
  const isScoped = !!categoryId;

  // ─── Per-subject data counters (used inside InfoPanels) ───
  const counts = useCognitiveStats(cards, reviewLog);
  const examDateLabel = counts.examDate || "nije postavljen";

  return (
    <div className="space-y-6">
      {/* 1. Interference Index */}
      <LazyChart
        label="Indeks interferencije"
        icon={<AlertTriangle className="h-4 w-4 text-warning" />}
        compute={() => analyticsClient.runInterference(cards)}
        delay={0}
        info={
          <InfoPanel title="Indeks interferencije">
            <p><b>Šta mjeri:</b> parove kartica iz istog predmeta čije se tipične greške i formulacije pitanja preklapaju — tj. mjesta gdje mozak miješa srodne pojmove.</p>
            <p><b>Kako se računa:</b> skor = min(100, brojZajedničkihGrešaka·30 + sličnostPitanja·70). U prikaz ulaze parovi sa skorom ≥ 20.</p>
            <p><b>Korišćeni podaci za ovaj predmet:</b></p>
            <ul className="space-y-0.5 pt-1">
              <DataRow label="Kartice u predmetu" value={counts.cards} />
              <DataRow label="Kartice sa zabilježenim greškama" value={counts.cardsWithErrors} />
              <DataRow label="Aktivne (nesavladane) greške" value={counts.activeErrors} />
            </ul>
          </InfoPanel>
        }
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
          return analyticsClient.runCategoryStability(cards, categories, planner.finalGoalDate);
        }}
        delay={1}
        info={
          <InfoPanel title="Stabilnost memorije">
            <p><b>Šta mjeri:</b> prosječnu FSRS „stability“ (otpornost na zaborav, u danima) i trenutnu „retrievability“ (vjerovatnoću prisjećanja sada) za sekcije ovog predmeta.</p>
            <p><b>Kako se računa:</b> R = exp(-elapsedDana / stability). Sekcija je <b>kritična</b> ako se njena R spušta ispod 85% do datuma cilja iz Strateškog plana.</p>
            <p><b>Korišćeni podaci za ovaj predmet:</b></p>
            <ul className="space-y-0.5 pt-1">
              <DataRow label="Sekcije ukupno" value={counts.totalSections} />
              <DataRow label="Sekcije sa istorijom ponavljanja" value={counts.sectionsWithReview} />
              <DataRow label="Datum cilja (planner)" value={examDateLabel} />
            </ul>
          </InfoPanel>
        }
      >
        {(stabilityData) => stabilityData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nedovoljno podataka.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{isScoped ? "Procijenjeno vrijeme do zaborava za ovaj predmet." : "Procijenjeno vrijeme do zaborava po kategoriji."}</p>
            {[...stabilityData].sort((a, b) => a.avgStability - b.avgStability).map(cat => {
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
        compute={() => analyticsClient.runStressPerformance(reviewLog)}
        delay={2}
        info={
          <InfoPanel title="Otpornost na stres">
            <p><b>Šta mjeri:</b> koliko ti pada tačnost kad odgovaraš brzo (pod „stresom“) u odnosu na uobičajen tempo.</p>
            <p><b>Kako se računa:</b> prag stresa = 50% tvoje prosječne latencije; otpornost = max(0, (1 − pad/3)·100). Minimum za prikaz: 5 normalnih + 3 stresna odgovora.</p>
            <p><b>Korišćeni podaci za ovaj predmet:</b></p>
            <ul className="space-y-0.5 pt-1">
              <DataRow label="Review zapisi predmeta" value={counts.reviewLog} />
              <DataRow label="Latencije za kartice predmeta" value={counts.subjectLatency} />
            </ul>
            <p className="text-[10px]">Latencija se loguje globalno; metrika spaja review predmeta sa latencijom istog odgovora (±30s).</p>
          </InfoPanel>
        }
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

      {/* 4. Friction Analysis — only in global view */}
      {!isScoped && (
        <LazyChart
          label="Analiza frikcije"
          icon={<ArrowRightLeft className="h-4 w-4 text-primary" />}
          compute={() => analyticsClient.runFrictionAnalysis(reviewLog)}
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
      )}

      {/* 5. Recovery Rate — only in global view */}
      {!isScoped && (
        <LazyChart
          label="Indeks oporavka"
          icon={<HeartPulse className="h-4 w-4 text-primary" />}
          compute={() => analyticsClient.runRecovery()}
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
      )}

      {/* 6. Blind Spots */}
      <LazyChart
        label="Slijepe tačke"
        icon={<Eye className="h-4 w-4 text-destructive" />}
        compute={async () => {
          const spots = await analyticsClient.runBlindSpots(cards);
          return categoryId ? spots.filter(s => s.category === categoryId) : spots;
        }}
        delay={5}
        info={
          <InfoPanel title="Slijepe tačke">
            <p><b>Šta mjeri:</b> kartice na kojima si bio siguran u tačan odgovor (sigurnost ≥ 4/5), a stvarna ocjena bila niska (≤ 2/4) — klasična „iluzija znanja“.</p>
            <p><b>Kako se računa:</b> agregira se iz dnevnika kalibracije (samoprocjena vs. ocjena) i filtrira na kartice ovog predmeta.</p>
            <p><b>Korišćeni podaci za ovaj predmet:</b></p>
            <ul className="space-y-0.5 pt-1">
              <DataRow label="Kalibracijski zapisi (predmet)" value={counts.subjectCalibration} />
              <DataRow label="Kartice u predmetu" value={counts.cards} />
            </ul>
            <p className="text-[10px]">Minimum za prikaz: ukupno 5+ kalibracijskih zapisa u sistemu.</p>
          </InfoPanel>
        }
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
                  <span className="text-muted-foreground">{catNameMap[spot.category] || spot.category}</span>
                  <span className="text-warning">Sigurnost: {spot.confidence}/5</span>
                  <span className="text-destructive">Ocjena: {spot.actualGrade}/4</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </LazyChart>

      {/* 7. Weak Hooks — only in global view */}
      {!isScoped && (
        <LazyChart
          label="Slabe kuke"
          icon={<Wrench className="h-4 w-4 text-warning" />}
          compute={() => runWeakHooksAnalysis()}
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
                    <p className="text-[10px] text-muted-foreground">{catNameMap[hook.category] || hook.category} • {(hook.avgLatencyMs / 1000).toFixed(1)}s prosjek</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </LazyChart>
      )}
    </div>
  );
}
