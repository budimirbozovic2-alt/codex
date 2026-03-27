import { memo, lazy, Suspense } from "react";
import { LayoutGrid, TrendingUp, Brain, Layers, Clock, ChevronRight } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { motion } from "framer-motion";
import { MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { Card } from "@/lib/spaced-repetition";
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

interface OverviewTabProps {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  activityData: any[];
  masteryData: { name: string; value: number }[];
  categoryChartData: any[];
  levelCounts: number[];
  ratioHistory: any[] | null;
  todayTime: any | null;
  focusRatio: { progress: number; targetReviewPct: number };
  onShowKnowledgeMap?: () => void;
}

export default function OverviewTab({
  cards, categories, reviewLog, activityData, masteryData, categoryChartData,
  levelCounts, ratioHistory, todayTime, focusRatio, onShowKnowledgeMap,
}: OverviewTabProps) {
  const hasData = cards.length > 0;
  const total = cards.length;

  return (
    <div className="space-y-6 mt-4">
      {onShowKnowledgeMap && total > 0 && (
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
      )}

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

      {ratioHistory && ratioHistory.some(d => d["Stvarni ponavljanje"] !== null) && (
        <Suspense fallback={<div className="h-[280px] glass-card rounded-xl animate-pulse" />}>
          <DashboardChart ratioHistory={ratioHistory} targetReviewPct={focusRatio.targetReviewPct} />
        </Suspense>
      )}

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
  );
}
