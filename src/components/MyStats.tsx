import { ArrowLeft, LayoutGrid, TrendingUp, Brain, Layers, Target, Clock, Flame, CalendarClock, Activity, ChevronRight } from "lucide-react";
import { useState, useMemo, memo, lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { motion } from "framer-motion";


import InfoPanel from "@/components/InfoPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, getSectionScore, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { ReviewLogEntry } from "@/lib/storage";
import { getTimeDistribution } from "@/lib/metacognitive-storage";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import ActivityHeatmap from "./ActivityHeatmap";
import RetentionChart from "./RetentionChart";
import ForgettingCurve from "./ForgettingCurve";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";
const DashboardChart = lazy(() => import("@/components/DashboardChart"));

// Lazy-load extracted tab components
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
  onBack: () => void;
  onShowKnowledgeMap?: () => void;
  onShowPlanner?: () => void;
}

const MASTERY_COLORS = [
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
];

// ─── Memoized chart components ───────────────────────────

const ActivityChart = memo(function ActivityChart({ data }: { data: any[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg">Aktivnost (14 dana)</h3>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gradReviewsStats" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCreatedStats" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="Ponavljanja" stroke="hsl(var(--primary))" fill="url(#gradReviewsStats)" strokeWidth={2} />
            <Area type="monotone" dataKey="Nove kartice" stroke="hsl(var(--success))" fill="url(#gradCreatedStats)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 justify-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-primary" /> Ponavljanja</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-success" /> Nove kartice</span>
      </div>
    </motion.div>
  );
});

const MasteryPieChart = memo(function MasteryPieChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg">Distribucija znanja</h3>
      </div>
      <div className="h-[200px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
              {data.map((_, idx) => (
                <Cell key={idx} fill={MASTERY_COLORS[idx % MASTERY_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center text-xs text-muted-foreground">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MASTERY_COLORS[i] }} />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </motion.div>
  );
});

const CategoryBarChart = memo(function CategoryBarChart({ data }: { data: any[] }) {
  if (data.length === 0) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-xl p-5 space-y-4 md:col-span-2">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg">Znanje po kategorijama</h3>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={32}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="Znanje" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
});

// ─── Main component ──────────────────────────────────────

export default function MyStats({ cards, categories, subcategories, categoryStats, reviewLog, srSettings, onBack, onShowKnowledgeMap, onShowPlanner }: Props) {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const weights = srSettings?.resistanceWeights ?? DEFAULT_SR_SETTINGS.resistanceWeights;

  // Focus ratio for ratio chart
  const focusRatio = useMemo(() => {
    if (srSettings.dailyGoal === 0) return { progress: 0, targetReviewPct: 5 };
    const progress = srSettings.dailyGoal > 0 && cards.length > 0
      ? Math.round((cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0) /
        Math.max(1, cards.reduce((s, c) => s + c.sections.length, 0))) * 100)
      : 0;
    return { progress, targetReviewPct: Math.max(5, progress) };
  }, [cards, srSettings]);

  // 14-day ratio history (deferred)
  const ratioHistory = useDeferredCompute(() => {
    const now = new Date();
    const days = eachDayOfInterval({ start: subDays(now, 13), end: now });
    const sectionFirstSeen = new Map<string, number>();
    reviewLog.forEach(e => {
      const key = `${e.cardId}:${e.sectionId}`;
      const prev = sectionFirstSeen.get(key);
      if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
    });
    return days.map(day => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 86400000;
      const dayEntries = reviewLog.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd);
      let review = 0, newL = 0;
      dayEntries.forEach(e => {
        const key = `${e.cardId}:${e.sectionId}`;
        const firstSeen = sectionFirstSeen.get(key) || e.timestamp;
        if (firstSeen < dayStart) review++; else newL++;
      });
      const total = review + newL;
      return {
        name: format(day, "dd.MM"),
        "Stvarni ponavljanje": total > 0 ? Math.round((review / total) * 100) : null,
        "Idealni cilj": focusRatio.targetReviewPct,
      };
    });
  }, [reviewLog, focusRatio]);

  // Effective learning time distribution (deferred)
  const todayTime = useDeferredCompute(() => getTimeDistribution(1), []);

  const activityData = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 13);
    const days = eachDayOfInterval({ start, end: now });
    return days.map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 86400000;
      const reviews = reviewLog.filter((r) => r.timestamp >= dayStart && r.timestamp < dayEnd).length;
      const created = cards.filter((c) => c.createdAt >= dayStart && c.createdAt < dayEnd).length;
      return { name: format(day, "dd.MM"), Ponavljanja: reviews, "Nove kartice": created };
    });
  }, [reviewLog, cards]);

  const masteryData = useMemo(() => {
    let novo = 0, ucenje = 0, napredno = 0, savladano = 0;
    cards.forEach((c) => {
      c.sections.forEach((s) => {
        const score = getSectionScore(s);
        if (score === 0) novo++;
        else if (score < 40) ucenje++;
        else if (score < 70) napredno++;
        else savladano++;
      });
    });
    return [
      { name: "Novo", value: novo },
      { name: "Učenje", value: ucenje },
      { name: "Napredno", value: napredno },
      { name: "Savladano", value: savladano },
    ].filter((d) => d.value > 0);
  }, [cards]);

  const categoryChartData = useMemo(() => {
    return categories
      .filter((cat) => categoryStats[cat]?.total > 0)
      .map((cat) => ({
        name: cat.length > 12 ? cat.slice(0, 12) + "…" : cat,
        Znanje: categoryStats[cat].score,
        Kartice: categoryStats[cat].total,
      }));
  }, [categories, categoryStats]);

  const hasData = cards.length > 0;

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-display">Laboratorija znanja</h2>
            <p className="text-muted-foreground mt-1">FSRS analitika, grafikoni i kvantitativni podaci</p>
          </div>
          <InfoPanel title="Kako radi Laboratorija znanja?">
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
          <div className="space-y-6 mt-4">
            {onShowKnowledgeMap && cards.length > 0 && (() => {
              const levelCounts = [0, 0, 0, 0, 0, 0];
              cards.forEach((c) => { levelCounts[getCardMasteryLevel(c)]++; });
              const total = cards.length;
              return (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={onShowKnowledgeMap}
                  className="w-full glass-card rounded-xl p-5 hover:border-primary/40 transition-colors group text-left space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-lg">Mapa Znanja</h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-secondary">
                    {levelCounts.map((count, lvl) => {
                      if (count === 0) return null;
                      return (
                        <div key={lvl} style={{ width: `${(count / total) * 100}%`, backgroundColor: MASTERY_LEVELS[lvl].color }} className="transition-all" />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {levelCounts.map((count, lvl) => {
                      if (count === 0) return null;
                      return (
                        <div key={lvl} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MASTERY_LEVELS[lvl].color }} />
                          {MASTERY_LEVELS[lvl].label}: <span className="font-medium text-foreground">{Math.round(count / total * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.button>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ErrorBoundary compact label="Heatmap aktivnosti">
                <ActivityHeatmap reviewLog={reviewLog} />
              </ErrorBoundary>
              <ErrorBoundary compact label="Grafikon retencije">
                <RetentionChart reviewLog={reviewLog} />
              </ErrorBoundary>
            </div>

            {hasData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ErrorBoundary compact label="Grafikon aktivnosti">
                  <ActivityChart data={activityData} />
                </ErrorBoundary>
                <ErrorBoundary compact label="Distribucija znanja">
                  <MasteryPieChart data={masteryData} />
                </ErrorBoundary>
                <ErrorBoundary compact label="Kategorije">
                  <CategoryBarChart data={categoryChartData} />
                </ErrorBoundary>
              </div>
            )}

            <ErrorBoundary compact label="Kriva zaboravljanja">
              <ForgettingCurve cards={cards} categories={categories} />
            </ErrorBoundary>

            {/* Ratio Chart (14 dana) — premješteno sa Dashboarda */}
            {ratioHistory && ratioHistory.some(d => d["Stvarni ponavljanje"] !== null) && (
              <Suspense fallback={<div className="h-[280px] glass-card rounded-xl animate-pulse" />}>
                <DashboardChart ratioHistory={ratioHistory} targetReviewPct={focusRatio.targetReviewPct} />
              </Suspense>
            )}

            {/* Efektivno učenje danas — premješteno sa Dashboarda */}
            {todayTime && todayTime.totalMs > 60000 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-lg">Efektivno učenje danas</h3>
                  </div>
                  <span className="text-lg font-display text-primary tabular-nums">
                    {Math.floor(todayTime.cognitiveMs / 3600000) > 0
                      ? `${Math.floor(todayTime.cognitiveMs / 3600000)}h ${Math.round((todayTime.cognitiveMs % 3600000) / 60000)}min`
                      : `${Math.round(todayTime.cognitiveMs / 60000)} min`}
                  </span>
                </div>
                <div className="flex h-3 rounded-md overflow-hidden bg-secondary">
                  {todayTime.review > 0 && <div className="bg-primary transition-all" style={{ width: `${(todayTime.review / todayTime.totalMs) * 100}%` }} title="Ponavljanje" />}
                  {todayTime.learning > 0 && <div className="bg-success transition-all" style={{ width: `${(todayTime.learning / todayTime.totalMs) * 100}%` }} title="Učenje" />}
                  {todayTime.creative > 0 && <div className="bg-warning transition-all" style={{ width: `${(todayTime.creative / todayTime.totalMs) * 100}%` }} title="Kreativ/Admin" />}
                  {todayTime.analysis > 0 && <div className="bg-muted-foreground/30 transition-all" style={{ width: `${(todayTime.analysis / todayTime.totalMs) * 100}%` }} title="Analiza" />}
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Ponavljanje {Math.round(todayTime.review / 60000)}m</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> Učenje {Math.round(todayTime.learning / 60000)}m</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /> Admin {Math.round(todayTime.creative / 60000)}m</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Analiza {Math.round(todayTime.analysis / 60000)}m</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Neto kognitivni rad: {todayTime.cognitivePct}% • Logistika: {100 - todayTime.cognitivePct}%
                </p>
              </motion.div>
            )}
          </div>
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
      </Tabs>
    </div>
  );
}
