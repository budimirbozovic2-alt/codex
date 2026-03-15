import { Brain, Clock, Layers, BookOpen, TrendingUp, AlertTriangle, Download, HardDrive, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, getCardScore, getSectionScore, getCardRetrievability, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry, getStorageUsage, isBackupOverdue, getLastBackupTime } from "@/lib/storage";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import ActivityHeatmap from "./ActivityHeatmap";
import RetentionChart from "./RetentionChart";
import StreakWidget from "./StreakWidget";

interface Props {
  stats: { due: number; total: number; totalSections: number; learnedSections: number };
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  categories: string[];
  subcategories: Record<string, string[]>;
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  onExport?: () => void;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-destructive";
  return (
    <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
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

export default function Dashboard({ stats, categoryStats, categories, cards, reviewLog, srSettings, onExport }: Props) {
  const avgRetrievability = useMemo(() => {
    const reviewed = cards.filter((c) => c.sections.some((s) => s.lastReviewed !== null));
    if (reviewed.length === 0) return 0;
    return Math.round(reviewed.reduce((sum, c) => sum + getCardRetrievability(c), 0) / reviewed.length);
  }, [cards]);

  const topStats = [
    { label: "Za ponavljanje", value: stats.due, icon: Clock, accent: "text-primary" },
    { label: "Ukupno pitanja", value: stats.total, icon: Layers, accent: "text-muted-foreground" },
    { label: "Naučene cjeline", value: stats.learnedSections, icon: BookOpen, accent: "text-success" },
    { label: "Pamćenje", value: `${avgRetrievability}%`, icon: Brain, accent: avgRetrievability >= 90 ? "text-success" : avgRetrievability >= 70 ? "text-warning" : "text-destructive" },
  ];

  const categoryChartData = useMemo(() => {
    return categories
      .filter((cat) => categoryStats[cat]?.total > 0)
      .map((cat) => ({
        name: cat.length > 12 ? cat.slice(0, 12) + "…" : cat,
        Znanje: categoryStats[cat].score,
        Kartice: categoryStats[cat].total,
      }));
  }, [categories, categoryStats]);

  const activityData = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 13);
    const days = eachDayOfInterval({ start, end: now });

    return days.map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 86400000;
      const reviews = reviewLog.filter((r) => r.timestamp >= dayStart && r.timestamp < dayEnd).length;
      const created = cards.filter((c) => c.createdAt >= dayStart && c.createdAt < dayEnd).length;
      return {
        name: format(day, "dd.MM"),
        Ponavljanja: reviews,
        "Nove kartice": created,
      };
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

  const hasData = cards.length > 0;
  const storageUsage = useMemo(() => getStorageUsage(), [cards, reviewLog]);
  const backupOverdue = useMemo(() => isBackupOverdue(), []);
  const lastBackup = useMemo(() => getLastBackupTime(), []);

  return (
    <div className="space-y-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight">
          Učenje kroz<br />
          <span className="text-primary">ponavljanje</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-md">
          Esejska i blic pitanja sa praćenjem znanja.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {topStats.map(({ label, value, icon: Icon, accent }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="rounded-xl bg-card border p-5"
          >
            <Icon className={`h-5 w-5 ${accent} mb-3`} />
            <p className="text-3xl font-serif">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </motion.div>
        ))}
      </div>

      {/* Alerts */}
      {(backupOverdue || storageUsage.percent > 70) && (
        <div className="space-y-3">
          {backupOverdue && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Vrijeme je za backup</p>
                <p className="text-xs text-muted-foreground">
                  {lastBackup > 0 ? `Posljednji backup: ${new Date(lastBackup).toLocaleDateString("sr-Latn")}` : "Nikad niste napravili backup."}
                  {" "}Podaci su samo u ovom pretraživaču.
                </p>
              </div>
              {onExport && (
                <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
                  <Download className="h-3.5 w-3.5" /> Izvezi
                </button>
              )}
            </motion.div>
          )}
          {storageUsage.percent > 70 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex items-center gap-3 p-4 rounded-xl border ${storageUsage.percent > 90 ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}>
              <HardDrive className={`h-5 w-5 flex-shrink-0 ${storageUsage.percent > 90 ? "text-destructive" : "text-warning"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium">Prostor za podatke: {storageUsage.percent}%</p>
                <p className="text-xs text-muted-foreground">
                  {(storageUsage.usedBytes / 1024 / 1024).toFixed(1)} MB / {(storageUsage.maxBytes / 1024 / 1024).toFixed(0)} MB iskorišteno
                </p>
              </div>
              <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full transition-all ${storageUsage.percent > 90 ? "bg-destructive" : "bg-warning"}`} style={{ width: `${storageUsage.percent}%` }} />
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Streak + Heatmap + Retention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StreakWidget reviewLog={reviewLog} dailyGoal={srSettings.dailyGoal} />
        <ActivityHeatmap reviewLog={reviewLog} />
      </div>
      <RetentionChart reviewLog={reviewLog} />

      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Activity Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-card border p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-lg">Aktivnost (14 dana)</h3>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <defs>
                    <linearGradient id="gradReviews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Ponavljanja" stroke="hsl(var(--primary))" fill="url(#gradReviews)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Nove kartice" stroke="hsl(var(--success))" fill="url(#gradCreated)" strokeWidth={2} />
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-xl bg-card border p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <h3 className="font-serif text-lg">Distribucija znanja</h3>
              </div>
              <div className="h-[200px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={masteryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
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

          {/* Category Scores Bar Chart */}
          {categoryChartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="rounded-xl bg-card border p-5 space-y-4 md:col-span-2"
            >
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

      {/* Category list */}
      {categories.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="space-y-4"
        >
          <h2 className="text-2xl font-serif">Pregled kategorija</h2>
          <div className="grid gap-3">
            {categories.map((cat) => {
              const s = categoryStats[cat];
              if (!s || s.total === 0) return null;
              return (
                <div key={cat} className="rounded-xl bg-card border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{cat}</span>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{s.score}%</span>
                      {s.due > 0 && (
                        <span className="text-primary">{s.due} za ponavljanje</span>
                      )}
                    </div>
                  </div>
                  <ScoreBar score={s.score} />
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
