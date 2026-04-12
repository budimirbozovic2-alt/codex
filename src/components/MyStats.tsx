import { TrendingUp, Target, Clock, Flame, CalendarClock, Activity } from "lucide-react";
import { useState, useMemo, lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { motion } from "framer-motion";

import InfoPanel from "@/components/InfoPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import { ReviewLogEntry } from "@/lib/storage";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { useStatsData } from "@/hooks/useStatsData";

const OverviewTab = lazy(() => import("./stats/OverviewTab"));
const LatencyTab = lazy(() => import("./stats/LatencyTab"));
const ResistanceTab = lazy(() => import("./stats/ResistanceTab"));
const PredictionTab = lazy(() => import("./stats/PredictionTab"));
const EfficiencyTab = lazy(() => import("./stats/EfficiencyTab"));
const CalibrationTab = lazy(() => import("./stats/CalibrationTab"));

interface Props {
  cards: Card[];
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  
  onShowPlanner?: () => void;
}

export default function MyStats({ cards, categories, categoryRecords, subcategories, categoryStats, reviewLog, srSettings, onShowPlanner }: Props) {
  const [activeTab, setActiveTab] = useState<string>("overview");

  const catNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of categoryRecords) map[r.id] = r.name;
    return map;
  }, [categoryRecords]);

  const {
    weights, focusRatio, ratioHistory, todayTime,
    activityData, masteryData, categoryChartData, levelCounts,
  } = useStatsData({ cards, categories, categoryStats, reviewLog, srSettings });

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="imperial-title">Statistika</h2>
            <p className="text-muted-foreground mt-1">FSRS analitika, grafikoni i kvantitativni podaci</p>
          </div>
          <InfoPanel title="Kako radi Statistika?">
            <p><strong className="text-foreground">Pregled</strong> — heatmapa aktivnosti, distribucija znanja, kriva zaboravljanja, omjer ponavljanja (14 dana) i efektivno učenje danas.</p>
            <p><strong className="text-foreground">Kalibracija</strong> — upoređuje procjenu sigurnosti (1-4) sa stvarnom ocjenom radi detekcije iluzije znanja.</p>
            <p><strong className="text-foreground">Latencija</strong> — vrijeme do otkrivanja odgovora. Prag: &lt;3 sekunde.</p>
            <p><strong className="text-foreground">Otpor</strong> — kombinovani skor lapsusa, latencije i zaboravljanja.</p>
            <p><strong className="text-foreground">Predikcija</strong> — predikcija budućeg opterećenja po predmetima.</p>
            <p><strong className="text-foreground">Efikasnost</strong> — omjer produktivnog učenja (Deep Work) naspram površnog (Shallow Work) sa trendom po sesijama.</p>
            <div className="pt-1 border-t border-border mt-1">
              <p className="font-medium text-foreground mb-1">Prečice</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between"><span>Globalna pretraga</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">Ctrl+K</kbd></div>
                <div className="flex items-center justify-between"><span>Workflow sidebar</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">M</kbd></div>
                <div className="flex items-center justify-between"><span>Zatvori modal</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">ESC</kbd></div>
              </div>
            </div>
          </InfoPanel>
        </div>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="space-y-1">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <TrendingUp className="h-3.5 w-3.5" /> Pregled
            </TabsTrigger>
            <TabsTrigger value="calibration" className="gap-1.5 text-xs sm:text-sm">
              <Target className="h-3.5 w-3.5" /> Kalibracija
            </TabsTrigger>
            <TabsTrigger value="latency" className="gap-1.5 text-xs sm:text-sm">
              <Clock className="h-3.5 w-3.5" /> Latencija
            </TabsTrigger>
            <TabsTrigger value="resistance" className="gap-1.5 text-xs sm:text-sm">
              <Flame className="h-3.5 w-3.5" /> Otpor
            </TabsTrigger>
          </TabsList>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="prediction" className="gap-1.5 text-xs sm:text-sm">
              <CalendarClock className="h-3.5 w-3.5" /> Predikcija
            </TabsTrigger>
            <TabsTrigger value="efficiency" className="gap-1.5 text-xs sm:text-sm">
              <Activity className="h-3.5 w-3.5" /> Efikasnost
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Pregled">
              <OverviewTab
                cards={cards}
                categories={categories}
                reviewLog={reviewLog}
                activityData={activityData}
                masteryData={masteryData}
                categoryChartData={categoryChartData}
                levelCounts={levelCounts}
                ratioHistory={ratioHistory}
                todayTime={todayTime}
                focusRatio={focusRatio}
                
              />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="calibration">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Kalibracija">
              <CalibrationTab />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="latency">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Latencija">
              <LatencyTab />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="resistance">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Otpor">
              <ResistanceTab cards={cards} categories={categories} reviewLog={reviewLog} weights={weights} catNameMap={catNameMap} />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="prediction">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Predikcija">
              <PredictionTab cards={cards} categories={categories} reviewLog={reviewLog} catNameMap={catNameMap} />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="efficiency">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Efikasnost">
              <EfficiencyTab />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

      </Tabs>
    </div>
  );
}
