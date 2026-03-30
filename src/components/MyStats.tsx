import { TrendingUp, Target, Clock, Flame, CalendarClock, Activity, HeartPulse } from "lucide-react";
import { useState, lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { motion } from "framer-motion";

import InfoPanel from "@/components/InfoPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { useStatsData } from "@/hooks/useStatsData";
const HealthMonitor = lazy(() => import("@/components/HealthMonitor"));

const OverviewTab = lazy(() => import("./stats/OverviewTab"));
const LatencyTab = lazy(() => import("./stats/LatencyTab"));
const ResistanceTab = lazy(() => import("./stats/ResistanceTab"));
const PredictionTab = lazy(() => import("./stats/PredictionTab"));
const EfficiencyTab = lazy(() => import("./stats/EfficiencyTab"));
const CalibrationTab = lazy(() => import("./stats/CalibrationTab"));

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  onShowKnowledgeMap?: () => void;
  onShowPlanner?: () => void;
}

export default function MyStats({ cards, categories, subcategories, categoryStats, reviewLog, srSettings, onShowKnowledgeMap, onShowPlanner }: Props) {
  const [activeTab, setActiveTab] = useState<string>("overview");

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
            <p><strong className="text-foreground">Kalibracija</strong> — upoređuje procjenu sigurnosti (1-5) sa stvarnom ocjenom radi detekcije iluzije znanja.</p>
            <p><strong className="text-foreground">Latencija</strong> — vrijeme do otkrivanja odgovora. Prag: &lt;3 sekunde.</p>
            <p><strong className="text-foreground">Otpor</strong> — kombinovani skor lapsusa, latencije i zaboravljanja.</p>
            <p><strong className="text-foreground">Predikcija</strong> — predikcija budućeg opterećenja po predmetima.</p>
            <p><strong className="text-foreground">Efikasnost</strong> — omjer produktivnog učenja (Deep Work) naspram površnog (Shallow Work) sa trendom po sesijama.</p>
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
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="prediction" className="gap-1.5 text-xs sm:text-sm">
              <CalendarClock className="h-3.5 w-3.5" /> Predikcija
            </TabsTrigger>
            <TabsTrigger value="efficiency" className="gap-1.5 text-xs sm:text-sm">
              <Activity className="h-3.5 w-3.5" /> Efikasnost
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-1.5 text-xs sm:text-sm">
              <HeartPulse className="h-3.5 w-3.5" /> Zdravlje
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
                onShowKnowledgeMap={onShowKnowledgeMap}
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
              <ResistanceTab cards={cards} categories={categories} reviewLog={reviewLog} weights={weights} />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="prediction">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Predikcija">
              <PredictionTab cards={cards} categories={categories} reviewLog={reviewLog} />
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

        <TabsContent value="health">
          <Suspense fallback={<TabSkeleton />}>
            <ErrorBoundary label="Zdravlje baze">
              <HealthMonitor />
            </ErrorBoundary>
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
