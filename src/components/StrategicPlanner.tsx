import { useState, useMemo, useCallback } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { Trash2, Pencil, Clock, BarChart3, GripVertical } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import {
  loadPlanner, savePlanner, StudyDecade, PlannerConfig,
  calcVelocity, calcEstimatedFinish, getPlannerStatus, getDailySuggestion, buildProgressCurve,
  calcDailyTimeRecommendation,
  loadDisciplineLog, getDisciplineEmoji, getDisciplineLabel, getDisciplineTrend,
  getCognitiveDebt,
} from "@/lib/planner-storage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format, differenceInDays, addDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, Bar, BarChart,
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

// ─── Per-decade progress calculation ─────────────────────
function calcDecadeProgress(decade: StudyDecade, cards: SRCard[]) {
  const relevantCards = decade.categories.length > 0
    ? cards.filter(c => decade.categories.includes(c.category))
    : cards;
  const total = relevantCards.reduce((s, c) => s + c.sections.length, 0);
  let learned = 0;
  relevantCards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) learned++; }));
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  return { total, learned, pct };
}

// ─── Sequential decade start dates ──────────────────────
function getSequentialStartDates(decades: StudyDecade[]): Map<string, string> {
  const map = new Map<string, string>();
  if (decades.length === 0) return map;
  let cursor = new Date(decades[0].startDate);
  decades.forEach(d => {
    map.set(d.id, cursor.toISOString().slice(0, 10));
    cursor = addDays(cursor, d.durationDays);
  });
  return map;
}

function getCurrentDecade(decades: StudyDecade[]): StudyDecade | null {
  const starts = getSequentialStartDates(decades);
  const today = startOfDay(new Date());
  for (let i = decades.length - 1; i >= 0; i--) {
    const d = decades[i];
    const start = new Date(starts.get(d.id)!);
    if (today >= start) return d;
  }
  return decades[0] || null;
}
// ─── Draggable Decade Item ───────────────────────────────
interface DecadeItemProps {
  decade: ReturnType<typeof calcDecadeProgress> & StudyDecade;
  index: number;
  isCurrent: boolean;
  isEditing: boolean;
  editName: string;
  editDays: string;
  setEditName: (v: string) => void;
  setEditDays: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onRemove: () => void;
  decadeStart: string;
}

function DecadeItem({ decade: d, index: i, isCurrent, isEditing, editName, editDays, setEditName, setEditDays, onSaveEdit, onCancelEdit, onStartEdit, onRemove, decadeStart }: DecadeItemProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={d}
      dragListener={false}
      dragControls={controls}
      className={cn("p-3 rounded-lg border bg-secondary/30 space-y-2", isCurrent && "ring-1 ring-primary/50")}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 25px -5px rgba(0,0,0,0.15)", zIndex: 50 }}
    >
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 h-8 text-sm" />
          <Input type="number" value={editDays} onChange={e => setEditDays(e.target.value)} className="w-20 h-8 text-sm" min={1} />
          <Button size="sm" variant="outline" className="h-8" onClick={onSaveEdit}>Sačuvaj</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={onCancelEdit}>Otkaži</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DECADE_COLORS[i % DECADE_COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{d.name}</p>
              {isCurrent && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Aktivna</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {d.durationDays} dana • {decadeStart} → {decadeStart ? format(addDays(new Date(decadeStart), d.durationDays), "dd.MM") : ""}
              {d.categories.length > 0 ? ` • ${d.categories.join(", ")}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onStartEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {/* Per-decade progress bar */}
      <div className="flex items-center gap-2">
        <Progress value={d.pct} className="h-2 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">{d.learned}/{d.total} ({d.pct}%)</span>
      </div>
    </Reorder.Item>
  );
}

export default function StrategicPlanner({ cards, categories, reviewLog, onBack }: Props) {
  const [newDecadeName, setNewDecadeName] = useState("");
  const [newDecadeDays, setNewDecadeDays] = useState("30");
  const [newDecadeCats, setNewDecadeCats] = useState<string[]>([]);
  const [goalDate, setGoalDate] = useState<Date | undefined>(config.finalGoalDate ? new Date(config.finalGoalDate) : undefined);
  const [editingDecadeId, setEditingDecadeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDays, setEditDays] = useState("");
  const [activeTab, setActiveTab] = useState<"planner" | "discipline" | "weekly">("planner");

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

  // Due cards count
  const dueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => {
      if (s.nextReview && s.nextReview <= now) count++;
    }));
    return count;
  }, [cards]);

  // Time recommendation
  const timeRec = useMemo(() => {
    if (!dailySuggestion) return null;
    return calcDailyTimeRecommendation(dailySuggestion.suggestedToday, velocity, dueCount);
  }, [dailySuggestion, velocity, dueCount]);

  // Cognitive debt
  const debt = useMemo(() => getCognitiveDebt(dailySuggestion?.suggestedToday ?? 0), [dailySuggestion]);

  // Discipline data
  const disciplineLog = useMemo(() => loadDisciplineLog(), []);
  const disciplineTrend = useMemo(() => getDisciplineTrend(30), []);

  // Sequential decade dates
  const decadeStarts = useMemo(() => getSequentialStartDates(config.decades), [config.decades]);
  const currentDecade = useMemo(() => getCurrentDecade(config.decades), [config.decades]);

  // Per-decade progress
  const decadeProgress = useMemo(() => {
    return config.decades.map(d => ({ ...d, ...calcDecadeProgress(d, cards) }));
  }, [config.decades, cards]);

  // Weekly review data (last 7 days)
  const weeklyData = useMemo(() => {
    const days: { day: string; newSections: number; reviews: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const dayStr = d.toISOString().slice(0, 10);
      const dayStart = startOfDay(d).getTime();
      const dayEnd = dayStart + 86400000;
      let newSections = 0;
      let reviews = 0;
      reviewLog.forEach(e => {
        if (e.timestamp >= dayStart && e.timestamp < dayEnd) {
          reviews++;
        }
      });
      // Count first-seen sections on this day
      const firstSeen = new Map<string, number>();
      reviewLog.forEach(e => {
        const key = `${e.cardId}:${e.sectionId}`;
        const prev = firstSeen.get(key);
        if (!prev || e.timestamp < prev) firstSeen.set(key, e.timestamp);
      });
      firstSeen.forEach(ts => {
        if (ts >= dayStart && ts < dayEnd) newSections++;
      });
      days.push({ day: format(d, "EEE"), newSections, reviews });
    }
    return days;
  }, [reviewLog]);

  const statusCfg = STATUS_CONFIG[plannerStatus.status];
  const StatusIcon = statusCfg.icon;

  const save = useCallback((updated: PlannerConfig) => {
    setConfig(updated);
    savePlanner(updated);
  }, []);

  const addDecade = () => {
    if (!newDecadeName.trim()) return;
    const lastDecade = config.decades[config.decades.length - 1];
    const lastStart = lastDecade ? decadeStarts.get(lastDecade.id) : null;
    const startDate = lastDecade && lastStart
      ? addDays(new Date(lastStart), lastDecade.durationDays).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const decade: StudyDecade = {
      id: crypto.randomUUID(),
      name: newDecadeName.trim(),
      durationDays: parseInt(newDecadeDays) || 30,
      categories: newDecadeCats,
      startDate,
    };
    save({ ...config, decades: [...config.decades, decade] });
    setNewDecadeName("");
    setNewDecadeDays("30");
    setNewDecadeCats([]);
  };

  const removeDecade = (id: string) => {
    save({ ...config, decades: config.decades.filter(d => d.id !== id) });
  };

  const startEditDecade = (d: StudyDecade) => {
    setEditingDecadeId(d.id);
    setEditName(d.name);
    setEditDays(String(d.durationDays));
  };

  const saveEditDecade = () => {
    if (!editingDecadeId) return;
    const updated = config.decades.map(d =>
      d.id === editingDecadeId ? { ...d, name: editName.trim() || d.name, durationDays: parseInt(editDays) || d.durationDays } : d
    );
    save({ ...config, decades: updated });
    setEditingDecadeId(null);
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
        name: date.slice(5),
        "Stvarni progres": actualMap.has(date) ? lastActual : null,
        "Planirani progres": plannedMap.has(date) ? lastPlanned : null,
      };
    });
  }, [reviewLog, totalSections, config.finalGoalDate, config.createdAt]);

  const totalTimelineDays = useMemo(() => config.decades.reduce((s, d) => s + d.durationDays, 0), [config.decades]);

  return (
    <div className="space-y-6">
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
            <p><strong className="text-foreground">Konačni cilj</strong> — postavi datum ispita.</p>
            <p><strong className="text-foreground">Dekade</strong> — faze učenja sa automatskim sekvencijalnim datumima.</p>
            <p><strong className="text-foreground">Discipline Tracker</strong> — prati tvoju dosljednost i kognitivni dug.</p>
          </InfoPanel>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mt-4 p-1 rounded-lg bg-secondary/50">
          {([
            { key: "planner" as const, label: "Planer", icon: Target },
            { key: "discipline" as const, label: "Disciplina", icon: BarChart3 },
            { key: "weekly" as const, label: "Sedmični pregled", icon: Calendar },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ═══════════ TAB: PLANNER ═══════════ */}
      {activeTab === "planner" && (
        <>
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

            {/* Decades list with progress, editing & drag-and-drop */}
            {config.decades.length > 0 && (
              <div className="space-y-3">
                {/* Timeline bar */}
                {totalTimelineDays > 0 && (
                  <div className="flex h-6 rounded-lg overflow-hidden bg-secondary">
                    {config.decades.map((d, i) => {
                      const isCurrent = currentDecade?.id === d.id;
                      return (
                        <div
                          key={d.id}
                          style={{ width: `${(d.durationDays / totalTimelineDays) * 100}%`, backgroundColor: DECADE_COLORS[i % DECADE_COLORS.length] }}
                          className={cn("flex items-center justify-center overflow-hidden relative", isCurrent && "ring-2 ring-foreground ring-offset-1")}
                        >
                          <span className="text-[9px] font-bold text-primary-foreground truncate px-1">{d.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Reorder.Group
                  axis="y"
                  values={config.decades}
                  onReorder={(newOrder) => save({ ...config, decades: newOrder })}
                  className="space-y-2"
                >
                  {decadeProgress.map((d, i) => (
                    <DecadeItem
                      key={d.id}
                      decade={d}
                      index={i}
                      isCurrent={currentDecade?.id === d.id}
                      isEditing={editingDecadeId === d.id}
                      editName={editName}
                      editDays={editDays}
                      setEditName={setEditName}
                      setEditDays={setEditDays}
                      onSaveEdit={saveEditDecade}
                      onCancelEdit={() => setEditingDecadeId(null)}
                      onStartEdit={() => startEditDecade(d)}
                      onRemove={() => removeDecade(d.id)}
                      decadeStart={decadeStarts.get(d.id) || ""}
                    />
                  ))}
                </Reorder.Group>
              </div>
            )}

            {/* Add decade form */}
            <div className="space-y-3 p-4 rounded-lg border border-dashed">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nova dekada</p>
              <div className="flex gap-2">
                <Input value={newDecadeName} onChange={e => setNewDecadeName(e.target.value)} placeholder="Naziv (npr. Anatomija fokus)" className="flex-1" />
                <Input type="number" value={newDecadeDays} onChange={e => setNewDecadeDays(e.target.value)} placeholder="Dana" className="w-20" min={1} />
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

            {/* Daily suggestion + Time recommendation */}
            {dailySuggestion && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Sugestija za danas</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{dailySuggestion.message}</p>
                  <div className="flex items-center gap-4 mt-2">
                    {dailySuggestion.suggestedToday > 0 && (
                      <p className="text-lg font-serif text-primary">{dailySuggestion.suggestedToday} novih cjelina</p>
                    )}
                    {timeRec && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{timeRec.message}</span>
                        <span className="text-[10px]">({dueCount} dospjelih + {dailySuggestion.suggestedToday} novih)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Cognitive debt */}
            {debt && (
              <div className="flex items-start gap-3 p-3 rounded-xl border border-warning/30 bg-warning/5">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-warning">{debt.message}</p>
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
        </>
      )}

      {/* ═══════════ TAB: DISCIPLINE ═══════════ */}
      {activeTab === "discipline" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-5">

          {/* Recent discipline entries */}
          <div className="rounded-xl bg-card border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-lg">Disciplina — Posljednjih 14 dana</h3>
            </div>

            {disciplineLog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Još nema zabilježenih podataka. Disciplina se automatski prati nakon svake sesije učenja.
              </p>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {disciplineLog.slice(-14).map((entry, i) => (
                  <div key={i} className="text-center space-y-1">
                    <span className="text-lg">{getDisciplineEmoji(entry.status)}</span>
                    <p className="text-[9px] text-muted-foreground">{entry.date.slice(5)}</p>
                    <p className="text-[10px] font-medium">{entry.planCompletion}%</p>
                  </div>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="flex gap-4 justify-center text-xs text-muted-foreground pt-2 border-t">
              <span>🚀 Vrijedan (≥90%)</span>
              <span>😐 Neutralan (70-89%)</span>
              <span>🐢 Lijen (&lt;70%)</span>
            </div>
          </div>

          {/* Discipline trend chart */}
          {disciplineTrend.length > 3 && (
            <div className="rounded-xl bg-card border p-5 space-y-4">
              <h4 className="text-sm font-medium">Trend dosljednosti (7-dnevni prosjek)</h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={disciplineTrend}>
                    <defs>
                      <linearGradient id="gradDiscipline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="diligentPct" name="Dosljednost %" stroke="hsl(var(--success))" fill="url(#gradDiscipline)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════════ TAB: WEEKLY REVIEW ═══════════ */}
      {activeTab === "weekly" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-5">

          <div className="rounded-xl bg-card border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-lg">Sedmični pregled</h3>
            </div>

            {/* Weekly bar chart */}
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="newSections" name="Nove cjeline" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="reviews" name="Ukupno ponavljanja" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly summary stats */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div className="text-center">
                <p className="text-xl font-serif tabular-nums">{weeklyData.reduce((s, d) => s + d.newSections, 0)}</p>
                <p className="text-[10px] text-muted-foreground">novih cjelina</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-serif tabular-nums">{weeklyData.reduce((s, d) => s + d.reviews, 0)}</p>
                <p className="text-[10px] text-muted-foreground">ukupno ponavljanja</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-serif tabular-nums">
                  {(weeklyData.reduce((s, d) => s + d.newSections, 0) / 7).toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground">prosjek/dan</p>
              </div>
            </div>
          </div>

          {/* Per-decade snapshot */}
          {decadeProgress.length > 0 && (
            <div className="rounded-xl bg-card border p-5 space-y-3">
              <h4 className="text-sm font-medium">Progres po dekadama</h4>
              {decadeProgress.map((d, i) => (
                <div key={d.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DECADE_COLORS[i % DECADE_COLORS.length] }} />
                      {d.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{d.learned}/{d.total}</span>
                  </div>
                  <Progress value={d.pct} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
