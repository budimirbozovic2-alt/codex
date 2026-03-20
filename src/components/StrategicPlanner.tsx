import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as Plus } from "lucide-react/dist/esm/icons/plus";
import { default as Calendar } from "lucide-react/dist/esm/icons/calendar";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { default as TrendingUp } from "lucide-react/dist/esm/icons/trending-up";
import { default as Lightbulb } from "lucide-react/dist/esm/icons/lightbulb";
import { default as CheckCircle } from "lucide-react/dist/esm/icons/check-circle";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as XCircle } from "lucide-react/dist/esm/icons/x-circle";
import InfoPanel from "@/components/InfoPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import {
  loadPlanner, savePlanner, StudyDecade, PlannerConfig,
  calcVelocity, calcEstimatedFinish, getPlannerStatus, getDailySuggestion, buildProgressCurve,
} from "@/lib/planner-storage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart,
} from "recharts";

interface Props {
  cards: SRCard[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  onBack: () => void;
}

const STATUS_CONFIG = {
  green: { icon: CheckCircle, color: "text-success", bg: "bg-success/10 border-success/30", label: "Napreduješ odlično. Tvoj plan je vrlo realan." },
  yellow: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10 border-warning/30", label: "" },
  red: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", label: "" },
  "no-goal": { icon: Target, color: "text-muted-foreground", bg: "bg-secondary border-border", label: "Postavi konačni cilj da aktiviraš predikcije." },
};

const DECADE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "hsl(var(--accent-foreground))",
];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-card-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.stroke }} className="text-xs">
          {p.name}: <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function StrategicPlanner({ cards, categories, reviewLog, onBack }: Props) {
  const [config, setConfig] = useState<PlannerConfig>(() => loadPlanner());
  const [newDecadeName, setNewDecadeName] = useState("");
  const [newDecadeDays, setNewDecadeDays] = useState("30");
  const [newDecadeCats, setNewDecadeCats] = useState<string[]>([]);
  const [goalDate, setGoalDate] = useState<Date | undefined>(config.finalGoalDate ? new Date(config.finalGoalDate) : undefined);

  const totalSections = useMemo(() => cards.reduce((s, c) => s + c.sections.length, 0), [cards]);
  const learnedSections = useMemo(() => {
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) count++; }));
    return count;
  }, [cards]);

  const velocity = useMemo(() => calcVelocity(reviewLog, 7), [reviewLog]);
  const remaining = totalSections - learnedSections;
  const estimatedFinish = useMemo(() => calcEstimatedFinish(remaining, velocity), [remaining, velocity]);
  const plannerStatus = useMemo(() => getPlannerStatus(estimatedFinish, config.finalGoalDate), [estimatedFinish, config.finalGoalDate]);
  const dailySuggestion = useMemo(() => getDailySuggestion(totalSections, learnedSections, config.finalGoalDate, velocity), [totalSections, learnedSections, config.finalGoalDate, velocity]);

  const statusCfg = STATUS_CONFIG[plannerStatus.status];
  const StatusIcon = statusCfg.icon;

  const save = useCallback((updated: PlannerConfig) => {
    setConfig(updated);
    savePlanner(updated);
  }, []);

  const addDecade = () => {
    if (!newDecadeName.trim()) return;
    const decade: StudyDecade = {
      id: crypto.randomUUID(),
      name: newDecadeName.trim(),
      durationDays: parseInt(newDecadeDays) || 30,
      categories: newDecadeCats,
      startDate: new Date().toISOString().slice(0, 10),
    };
    save({ ...config, decades: [...config.decades, decade] });
    setNewDecadeName("");
    setNewDecadeDays("30");
    setNewDecadeCats([]);
  };

  const removeDecade = (id: string) => {
    save({ ...config, decades: config.decades.filter(d => d.id !== id) });
  };

  const setFinalGoal = (date: Date | undefined) => {
    setGoalDate(date);
    save({ ...config, finalGoalDate: date ? date.toISOString().slice(0, 10) : null });
  };

  const toggleCat = (cat: string) => {
    setNewDecadeCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  // Progress chart data
  const chartData = useMemo(() => {
    const { planned, actual } = buildProgressCurve(reviewLog, totalSections, config.finalGoalDate, config.createdAt);

    // Merge into a single timeline
    const allDates = new Set([...planned.map(p => p.date), ...actual.map(a => a.date)]);
    const sorted = Array.from(allDates).sort();

    const plannedMap = new Map(planned.map(p => [p.date, p.value]));
    const actualMap = new Map(actual.map(a => [a.date, a.value]));

    let lastActual = 0;
    let lastPlanned = 0;
    return sorted.map(date => {
      const av = actualMap.get(date);
      const pv = plannedMap.get(date);
      if (av !== undefined) lastActual = av;
      if (pv !== undefined) lastPlanned = pv;
      return {
        name: date.slice(5), // MM-DD
        "Stvarni progres": actualMap.has(date) ? lastActual : null,
        "Planirani progres": plannedMap.has(date) ? lastPlanned : null,
      };
    });
  }, [reviewLog, totalSections, config.finalGoalDate, config.createdAt]);

  // Timeline bar
  const totalTimelineDays = useMemo(() => {
    return config.decades.reduce((s, d) => s + d.durationDays, 0);
  }, [config.decades]);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-serif">Strateški planer</h2>
            <p className="text-muted-foreground mt-1">Poveži svoj plan sa stvarnim progresom</p>
          </div>
          <InfoPanel title="Kako radi Strateški planer?">
            <p><strong className="text-foreground">Konačni cilj</strong> — postavi datum ispita. Sistem prati da li si na putu da stigneš.</p>
            <p><strong className="text-foreground">Dekade</strong> — podijeli učenje u faze (npr. „Anatomija fokus — 30 dana"). Svaka dekada se vezuje za kategorije.</p>
            <p><strong className="text-foreground">Reality Check</strong> — na osnovu tvoje brzine učenja (sekcija/dan) sistem predviđa datum završetka i upozorava ako kasniš.</p>
            <p><strong className="text-foreground">Statusi:</strong></p>
            <ul className="space-y-1 pl-3">
              <li>🟢 Na pravom putu</li>
              <li>🟡 Malo kasniš — potrebno ubrzanje</li>
              <li>🔴 Značajno kašnjenje</li>
            </ul>
          </InfoPanel>
        </div>
      </motion.div>

      {/* ─── Section A: Planer ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-xl bg-card border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-lg">Plan i dekade</h3>
        </div>

        {/* Goal date picker */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Konačni cilj (ispit):</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("gap-2", !goalDate && "text-muted-foreground")}>
                <Calendar className="h-4 w-4" />
                {goalDate ? format(goalDate, "dd.MM.yyyy") : "Odaberi datum"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarUI
                mode="single"
                selected={goalDate}
                onSelect={setFinalGoal}
                disabled={(date) => date < new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {goalDate && (
            <span className="text-xs text-muted-foreground">
              ({differenceInDays(goalDate, new Date())} dana do cilja)
            </span>
          )}
        </div>

        {/* Decades list */}
        {config.decades.length > 0 && (
          <div className="space-y-3">
            {/* Timeline bar */}
            {totalTimelineDays > 0 && (
              <div className="flex h-6 rounded-lg overflow-hidden bg-secondary">
                {config.decades.map((d, i) => (
                  <div
                    key={d.id}
                    style={{ width: `${(d.durationDays / totalTimelineDays) * 100}%`, backgroundColor: DECADE_COLORS[i % DECADE_COLORS.length] }}
                    className="flex items-center justify-center overflow-hidden"
                  >
                    <span className="text-[9px] font-bold text-primary-foreground truncate px-1">{d.name}</span>
                  </div>
                ))}
              </div>
            )}

            {config.decades.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border bg-secondary/30">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DECADE_COLORS[i % DECADE_COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.durationDays} dana • {d.categories.length > 0 ? d.categories.join(", ") : "Sve kategorije"}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDecade(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add decade form */}
        <div className="space-y-3 p-4 rounded-lg border border-dashed">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nova dekada</p>
          <div className="flex gap-2">
            <Input
              value={newDecadeName}
              onChange={e => setNewDecadeName(e.target.value)}
              placeholder="Naziv (npr. Anatomija fokus)"
              className="flex-1"
            />
            <Input
              type="number"
              value={newDecadeDays}
              onChange={e => setNewDecadeDays(e.target.value)}
              placeholder="Dana"
              className="w-20"
              min={1}
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${newDecadeCats.includes(cat) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" onClick={addDecade} disabled={!newDecadeName.trim()} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Dodaj dekadu
          </Button>
        </div>
      </motion.div>

      {/* ─── Section B: Reality Check ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl bg-card border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-lg">Reality Check</h3>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl font-serif tabular-nums">{velocity.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">cjelina/dan (7d)</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl font-serif tabular-nums">{remaining}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">preostalo</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl font-serif tabular-nums">
              {estimatedFinish ? format(estimatedFinish, "dd.MM.yy") : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">proj. završetak</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl font-serif tabular-nums">
              {config.finalGoalDate ? format(new Date(config.finalGoalDate), "dd.MM.yy") : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">cilj</p>
          </div>
        </div>

        {/* Status light */}
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${statusCfg.bg}`}>
          <StatusIcon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${statusCfg.color}`} />
          <div>
            <p className={`text-sm font-medium ${statusCfg.color}`}>
              {plannerStatus.status === "green" && statusCfg.label}
              {plannerStatus.status === "yellow" && `Kasniš ${plannerStatus.daysLate} dana. Povećaj tempo.`}
              {plannerStatus.status === "red" && `Tvoj trenutni tempo nije dovoljan za ovaj plan. Kasniš ${plannerStatus.daysLate} dana.`}
              {plannerStatus.status === "no-goal" && statusCfg.label}
            </p>
            {plannerStatus.status !== "no-goal" && plannerStatus.status !== "green" && (
              <p className="text-xs text-muted-foreground mt-1">
                Potrebna brzina: {remaining > 0 && config.finalGoalDate
                  ? `${Math.ceil(remaining / Math.max(1, differenceInDays(new Date(config.finalGoalDate), new Date())))} cjelina/dan`
                  : "—"}
              </p>
            )}
          </div>
        </div>

        {/* Daily suggestion */}
        {dailySuggestion && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
            <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Sugestija za danas</p>
              <p className="text-xs text-muted-foreground mt-0.5">{dailySuggestion.message}</p>
              {dailySuggestion.suggestedToday > 0 && (
                <p className="text-lg font-serif text-primary mt-1">{dailySuggestion.suggestedToday} novih cjelina</p>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* ─── Section C: Progress Chart ─── */}
      {chartData.length > 2 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-lg">Planirana vs. stvarna kriva progresa</h3>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="gradActualProgress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Stvarni progres" stroke="hsl(var(--primary))" fill="url(#gradActualProgress)" strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="Planirani progres" stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 justify-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-primary" /> Stvarni progres</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-success" style={{ borderTop: "2px dashed" }} /> Planirani progres</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
