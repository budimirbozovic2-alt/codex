import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, LayoutGrid, TrendingUp, Brain, Layers, BookOpen, Target, Clock, Flame, Activity, CalendarClock, ChevronRight, Award } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, getCardScore, getSectionScore, getCardRetrievability, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { ReviewLogEntry } from "@/lib/storage";
import { getDisciplineTrend } from "@/lib/planner-storage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import ActivityHeatmap from "./ActivityHeatmap";
import RetentionChart from "./RetentionChart";
import ForgettingCurve from "./ForgettingCurve";
import MetacognitiveCenter from "./MetacognitiveCenter";

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
  onSendToWorkshop?: (cardId: string) => void;
}

const MASTERY_COLORS = [
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-card-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-card-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function MyStats({ cards, categories, subcategories, categoryStats, reviewLog, srSettings, onBack, onShowKnowledgeMap, onShowPlanner, onSendToWorkshop }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "metacognitive">("overview");

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

  const disciplineTrend = useMemo(() => getDisciplineTrend(30), []);

  const hasData = cards.length > 0;

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <h2 className="text-3xl font-serif">Moje statistike</h2>
        <p className="text-muted-foreground mt-1">Svi grafikoni, analitika i metakognitivni alati</p>
      </motion.div>

      {/* Tab switch between Overview and Metacognitive */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
            <TrendingUp className="h-3.5 w-3.5" /> Pregled
          </TabsTrigger>
          <TabsTrigger value="metacognitive" className="gap-1.5 text-xs sm:text-sm">
            <Brain className="h-3.5 w-3.5" /> Analitika
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6 mt-4">
            {/* Knowledge Map Widget */}
            {onShowKnowledgeMap && cards.length > 0 && (() => {
              const levelCounts = [0, 0, 0, 0, 0, 0];
              cards.forEach((c) => { levelCounts[getCardMasteryLevel(c)]++; });
              const total = cards.length;
              return (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={onShowKnowledgeMap}
                  className="w-full rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group text-left space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      <h3 className="font-serif text-lg">Mapa Znanja</h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-secondary">
                    {levelCounts.map((count, lvl) => {
                      if (count === 0) return null;
                      return (
                        <div
                          key={lvl}
                          style={{ width: `${(count / total) * 100}%`, backgroundColor: MASTERY_LEVELS[lvl].color }}
                          className="transition-all"
                        />
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

            {/* Planner Widget */}
            {onShowPlanner && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={onShowPlanner}
                className="w-full rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group text-left space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <h3 className="font-serif text-lg">Strateški Planer</h3>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs text-muted-foreground">Poveži svoj plan sa stvarnim progresom, postavi cilj i prati brzinu učenja.</p>
              </motion.button>
            )}

            {/* Heatmap + Retention */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ActivityHeatmap reviewLog={reviewLog} />
              <RetentionChart reviewLog={reviewLog} />
            </div>

            {hasData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 14-day Activity Chart */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl bg-card border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="font-serif text-lg">Aktivnost (14 dana)</h3>
                  </div>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activityData}>
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
                        <Tooltip content={<CustomTooltip />} />
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

                {/* Mastery Distribution */}
                {masteryData.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl bg-card border p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" />
                      <h3 className="font-serif text-lg">Distribucija znanja</h3>
                    </div>
                    <div className="h-[200px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={masteryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                            {masteryData.map((_, idx) => (
                              <Cell key={idx} fill={MASTERY_COLORS[idx % MASTERY_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center text-xs text-muted-foreground">
                      {masteryData.map((d, i) => (
                        <span key={d.name} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MASTERY_COLORS[i] }} />
                          {d.name} ({d.value})
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Category Scores */}
                {categoryChartData.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-xl bg-card border p-5 space-y-4 md:col-span-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <h3 className="font-serif text-lg">Znanje po kategorijama</h3>
                    </div>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryChartData} barSize={32}>
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="Znanje" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Forgetting Curve */}
            <ForgettingCurve cards={cards} categories={categories} />

            {/* Discipline Trend Chart */}
            {disciplineTrend.length > 2 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-xl bg-card border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  <h3 className="font-serif text-lg">Trend discipline</h3>
                </div>
                <p className="text-xs text-muted-foreground">Postotak "vrijednih" (🚀) dana u klizećem 7-dnevnom prozoru</p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={disciplineTrend}>
                      <defs>
                        <linearGradient id="gradDiscipline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="diligentPct" name="Vrijedni dani %" stroke="hsl(var(--success))" fill="url(#gradDiscipline)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="metacognitive">
          {/* Embed MetacognitiveCenter inline without its own header/back button */}
          <MetacognitiveCenter cards={cards} categories={categories} reviewLog={reviewLog} onBack={onBack} settings={srSettings} embedded onSendToWorkshop={onSendToWorkshop} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
