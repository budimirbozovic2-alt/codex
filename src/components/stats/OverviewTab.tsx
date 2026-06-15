import { memo, lazy, Suspense } from "react";
import { TrendingUp, Brain, Layers, Clock, Signal } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/lib/motion";

import { Card } from "@/lib/spaced-repetition";
import { MASTERY_LEVELS } from "@/lib/mastery";
import { ReviewLogEntry } from "@/lib/storage";
import ActivityHeatmap from "../ActivityHeatmap";
import RetentionChart from "../RetentionChart";
import ForgettingCurve from "../ForgettingCurve";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";

const DashboardChart = lazy(() => import("@/components/DashboardChart"));

const MASTERY_COLORS = [
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
];

// ─── Chart data shapes (typed instead of any[]) ──────────

export interface ActivityPoint {
  name: string;
  Ponavljanja: number;
  "Nove kartice": number;
}

export interface CategoryBarPoint {
  name: string;
  Znanje: number;
}

export interface RatioHistoryPoint {
  name: string;
  "Stvarni ponavljanje": number | null;
  "Stvarni učenje"?: number | null;
  [key: string]: string | number | null | undefined;
}

export interface TodayTimeStat {
  totalMs: number;
  cognitiveMs: number;
  cognitivePct: number;
  review: number;
  learning: number;
  creative: number;
  analysis: number;
}

// ─── Memoized chart components ───────────────────────────

const ActivityChart = memo(function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-eyebrow normal-case tracking-normal">Aktivnost (14 dana)</h3>
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
    </m.div>
  );
});

const MasteryPieChart = memo(function MasteryPieChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return null;
  return (
    <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h3 className="text-eyebrow normal-case tracking-normal">Distribucija znanja</h3>
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
    </m.div>
  );
});

const CategoryBarChart = memo(function CategoryBarChart({ data }: { data: CategoryBarPoint[] }) {
  if (data.length === 0) return null;
  return (
    <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-xl p-5 space-y-4 md:col-span-2">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-eyebrow normal-case tracking-normal">Znanje po kategorijama</h3>
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
    </m.div>
  );
});

const MasteryLevelsChart = memo(function MasteryLevelsChart({ counts }: { counts: number[] }) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass-card rounded-xl p-5 space-y-4 md:col-span-2"
    >
      <div className="flex items-center gap-2">
        <Signal className="h-4 w-4 text-primary" />
        <h3 className="text-eyebrow normal-case tracking-normal">Nivoi savladavanja (kartice)</h3>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
        {counts.map((count, i) => {
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={i}
              className="h-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: MASTERY_LEVELS[i].color }}
              title={`${MASTERY_LEVELS[i].label}: ${count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {counts.map((count, i) =>
          count > 0 ? (
            <span key={i} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: MASTERY_LEVELS[i].color }}
              />
              {MASTERY_LEVELS[i].label}
              <span className="tabular-nums text-foreground">{count}</span>
              <span className="text-muted-foreground/70">({Math.round((count / total) * 100)}%)</span>
            </span>
          ) : null,
        )}
      </div>
    </m.div>
  );
});

interface OverviewTabProps {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  activityData: ActivityPoint[] | null;
  masteryData: { name: string; value: number }[] | null;
  categoryChartData: CategoryBarPoint[];
  levelCounts: number[] | null;
  ratioHistory: RatioHistoryPoint[] | null;
  todayTime: TodayTimeStat | null;
  focusRatio: { progress: number; targetReviewPct: number };
  catNameMap: Record<string, string>;
}

export default function OverviewTab({
  cards, categories, reviewLog, activityData, masteryData, categoryChartData,
  levelCounts, ratioHistory, todayTime, focusRatio, catNameMap,
}: OverviewTabProps) {
  const hasData = cards.length > 0;
  const chartsReady = activityData !== null && masteryData !== null && levelCounts !== null;

  return (
    <div className="space-y-6 mt-4">
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
            {chartsReady && activityData
              ? <ActivityChart data={activityData} />
              : <Skeleton className="h-[260px] rounded-xl" />}
          </ErrorBoundary>
          <ErrorBoundary compact label="Distribucija znanja">
            {chartsReady && masteryData
              ? <MasteryPieChart data={masteryData} />
              : <Skeleton className="h-[260px] rounded-xl" />}
          </ErrorBoundary>
          <ErrorBoundary compact label="Kategorije">
            <CategoryBarChart data={categoryChartData} />
          </ErrorBoundary>
          <ErrorBoundary compact label="Nivoi savladavanja">
            {chartsReady && levelCounts
              ? <MasteryLevelsChart counts={levelCounts} />
              : <Skeleton className="h-[120px] rounded-xl md:col-span-2" />}
          </ErrorBoundary>
        </div>
      )}

      <ErrorBoundary compact label="Kriva zaboravljanja">
        <ForgettingCurve cards={cards} categories={categories} catNameMap={catNameMap} />
      </ErrorBoundary>

      {ratioHistory && ratioHistory.some(d => d["Stvarni ponavljanje"] !== null) && (
        <Suspense fallback={<Skeleton className="h-[280px] rounded-xl" />}>
          <DashboardChart ratioHistory={ratioHistory} targetReviewPct={focusRatio.targetReviewPct} />
        </Suspense>
      )}

      {todayTime && todayTime.totalMs > 60000 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-eyebrow normal-case tracking-normal">Efektivno učenje danas</h3>
            </div>
            <span className="text-lg font-medium text-primary tabular-nums">
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
        </m.div>
      )}
    </div>
  );
}
