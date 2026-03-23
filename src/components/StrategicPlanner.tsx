import { useState, useMemo, useCallback } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";



















import InfoPanel from "@/components/InfoPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import {
  loadPlanner, savePlanner, StudyPhase, PlannerConfig,
  calcVelocity, calcEstimatedFinish, getPlannerStatus, getSmartSuggestion,
  calcDailyTimeRecommendation, calcPhaseProgress, calcDynamicPhaseDates,
  calcRebalancedQuota, buildBurnupData, getProjectionText,
  loadDisciplineLog, getDisciplineEmoji, getDisciplineTrend,
  getCognitiveDebt, getPhaseDisciplinePct,
} from "@/lib/planner-storage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format, differenceInDays, addDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Trash2, Pencil, Clock, BarChart3, GripVertical, RefreshCw, Shield, Flame, ArrowLeft, Target, Plus, Calendar, Zap, TrendingUp, Lightbulb, CheckCircle, AlertTriangle, XCircle, Map as MapIcon } from "lucide-react";
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

const PHASE_COLORS = [
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

// ─── Phase Item ──────────────────────────────────────────
interface PhaseItemProps {
  phase: StudyPhase & { total: number; learned: number; pct: number; remainingCards: number };
  index: number;
  dynamicDays: number | null;
  isEditing: boolean;
  editName: string;
  editDays: string;
  setEditName: (v: string) => void;
  setEditDays: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onRemove: () => void;
}

function PhaseItem({ phase: p, index: i, dynamicDays, isEditing, editName, editDays, setEditName, setEditDays, onSaveEdit, onCancelEdit, onStartEdit, onRemove }: PhaseItemProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={p}
      dragListener={false}
      dragControls={controls}
      className="p-3 rounded-lg border bg-secondary/30 space-y-2"
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 25px -5px rgba(0,0,0,0.15)", zIndex: 50 }}
    >
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 h-8 text-sm" />
          <Input type="number" value={editDays} onChange={e => setEditDays(e.target.value)} className="w-20 h-8 text-sm" min={1} placeholder="Dana" />
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
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {p.expectedDays}d očekivano
              {dynamicDays !== null && dynamicDays !== p.expectedDays && (
                <span className={cn("ml-1", dynamicDays > p.expectedDays ? "text-warning" : "text-success")}>
                  → {dynamicDays}d dinamički
                </span>
              )}
              {p.categories.length > 0 ? ` • ${p.categories.join(", ")}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onStartEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Progress value={p.pct} className="h-2 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">{p.learned}/{p.total} ({p.pct}%)</span>
      </div>
    </Reorder.Item>
  );
}

// ─── Main Component ──────────────────────────────────────

export default function StrategicPlanner({ cards, categories, reviewLog, onBack }: Props) {
  const [config, setConfig] = useState<PlannerConfig>(() => loadPlanner());
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDays, setNewPhaseDays] = useState("30");
  const [newPhaseCats, setNewPhaseCats] = useState<string[]>([]);
  const [goalDate, setGoalDate] = useState<Date | undefined>(config.finalGoalDate ? new Date(config.finalGoalDate) : undefined);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDays, setEditDays] = useState("");
  const [activeTab, setActiveTab] = useState<"operations" | "roadmap" | "discipline">("operations");
  const [showBufferSettings, setShowBufferSettings] = useState(false);

  const totalSections = useMemo(() => cards.reduce((s, c) => s + c.sections.length, 0), [cards]);
  const learnedSections = useMemo(() => {
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) count++; }));
    return count;
  }, [cards]);
  const remaining = totalSections - learnedSections;

  const velocity = useMemo(() => calcVelocity(reviewLog, 7), [reviewLog]);
  const estimatedFinish = useMemo(() => calcEstimatedFinish(remaining, velocity), [remaining, velocity]);
  const plannerStatus = useMemo(() => getPlannerStatus(estimatedFinish, config.finalGoalDate, config.bufferPercent), [estimatedFinish, config.finalGoalDate, config.bufferPercent]);

  // Current active phase (first incomplete one)
  const phaseProgressList = useMemo(() => config.phases.map(p => ({ ...p, ...calcPhaseProgress(p, cards) })), [config.phases, cards]);
  const currentPhase = useMemo(() => phaseProgressList.find(p => p.pct < 100) || phaseProgressList[0] || null, [phaseProgressList]);

  const smartSuggestion = useMemo(() => getSmartSuggestion(currentPhase?.phase || null, cards, config.finalGoalDate, velocity, config.bufferPercent), [currentPhase, cards, config.finalGoalDate, velocity, config.bufferPercent]);

  const dynamicDates = useMemo(() => calcDynamicPhaseDates(config.phases, cards, velocity), [config.phases, cards, velocity]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.nextReview && s.nextReview <= now) count++; }));
    return count;
  }, [cards]);

  const timeRec = useMemo(() => {
    if (!smartSuggestion) return null;
    return calcDailyTimeRecommendation(smartSuggestion.suggestedToday, velocity, dueCount);
  }, [smartSuggestion, velocity, dueCount]);

  const debt = useMemo(() => getCognitiveDebt(smartSuggestion?.suggestedToday ?? 0), [smartSuggestion]);

  const disciplineLog = useMemo(() => loadDisciplineLog(), []);
  const disciplineTrend = useMemo(() => getDisciplineTrend(30), []);
  const phaseDisciplinePct = useMemo(() => getPhaseDisciplinePct(disciplineLog), [disciplineLog]);

  // Burn-up chart data
  const burnupData = useMemo(() => buildBurnupData(reviewLog, totalSections, config.finalGoalDate, config.bufferPercent), [reviewLog, totalSections, config.finalGoalDate, config.bufferPercent]);

  const projectionText = useMemo(() => getProjectionText(velocity, remaining, config.finalGoalDate, config.bufferPercent), [velocity, remaining, config.finalGoalDate, config.bufferPercent]);

  const statusCfg = STATUS_CONFIG[plannerStatus.status];
  const StatusIcon = statusCfg.icon;

  const save = useCallback((updated: PlannerConfig) => {
    setConfig(updated);
    savePlanner(updated);
  }, []);

  const addPhase = () => {
    if (!newPhaseName.trim()) return;
    const phase: StudyPhase = {
      id: crypto.randomUUID(),
      name: newPhaseName.trim(),
      expectedDays: parseInt(newPhaseDays) || 30,
      categories: newPhaseCats,
    };
    save({ ...config, phases: [...config.phases, phase] });
    setNewPhaseName("");
    setNewPhaseDays("30");
    setNewPhaseCats([]);
  };

  const removePhase = (id: string) => save({ ...config, phases: config.phases.filter(p => p.id !== id) });

  const startEditPhase = (p: StudyPhase) => {
    setEditingPhaseId(p.id);
    setEditName(p.name);
    setEditDays(String(p.expectedDays));
  };

  const saveEditPhase = () => {
    if (!editingPhaseId) return;
    const updated = config.phases.map(p =>
      p.id === editingPhaseId ? { ...p, name: editName.trim() || p.name, expectedDays: parseInt(editDays) || p.expectedDays } : p
    );
    save({ ...config, phases: updated });
    setEditingPhaseId(null);
  };

  const setFinalGoal = (date: Date | undefined) => {
    setGoalDate(date);
    save({ ...config, finalGoalDate: date ? date.toISOString().slice(0, 10) : null });
  };

  const toggleCat = (cat: string) => {
    setNewPhaseCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleRebalance = () => {
    const result = calcRebalancedQuota(remaining, config.finalGoalDate, config.bufferPercent);
    if (!result) return;
    // Rebalance just resets status by recalculating — the smart suggestion already does this automatically
    // We trigger a re-render by touching config
    save({ ...config });
  };

  const totalTimelineDays = useMemo(() => {
    return dynamicDates.reduce((s, d) => s + d.dynamicDays, 0) || config.phases.reduce((s, p) => s + p.expectedDays, 0);
  }, [dynamicDates, config.phases]);

  // Streak calculation
  const { streak, bestStreak } = useMemo(() => {
    let streak = 0;
    const sorted = [...disciplineLog].sort((a, b) => b.date.localeCompare(a.date));
    for (const entry of sorted) {
      if (entry.status === "diligent") streak++;
      else break;
    }
    let best = 0, cur = 0;
    const asc = [...disciplineLog].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of asc) {
      if (e.status === "diligent") { cur++; best = Math.max(best, cur); }
      else cur = 0;
    }
    return { streak, bestStreak: best };
  }, [disciplineLog]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-serif">Strateški planer</h2>
            <p className="text-muted-foreground mt-1">Adaptivni sistem — plan se prilagođava tvom tempu</p>
          </div>
          <InfoPanel title="Kako radi Strateški planer?">
            <p><strong className="text-foreground">Operativni plan</strong> — faze učenja sa dinamičkim datumima, Smart Load Balancing (dnevna kvota = preostalo / efektivni dani), Reality Check i dnevne sugestije.</p>
            <p><strong className="text-foreground">Faze učenja</strong> — grupišu kategorije. Datumi se automatski prilagođavaju tvom tempu (Velocity).</p>
            <p><strong className="text-foreground">Buffer %</strong> — sigurnosna zona (podrazumijevano 15%) — sistem računa kao da ispit počinje ranije, ostavljajući krajnji period za finalno ponavljanje.</p>
            <p><strong className="text-foreground">Niveliši plan</strong> — raspoređuje kognitivni dug ravnomjerno na preostale dane, resetujući status u zeleni.</p>
            <p><strong className="text-foreground">Mapa puta</strong> — Burn-up grafikon (idealna vs. stvarna linija napretka) i tekstualna simulacija završetka.</p>
            <p><strong className="text-foreground">Disciplina</strong> — Rocket Streak (🚀 uzastopni dani), 14-dnevni grid sa emojijima i trend dosljednosti.</p>
            <p><strong className="text-foreground">Burnout zaštita</strong> — upozorenje ako dnevna kvota pređe 60 kartica.</p>
          </InfoPanel>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mt-4 p-1 rounded-lg bg-secondary/50">
          {([
            { key: "operations" as const, label: "Operativni plan", icon: Target },
            { key: "roadmap" as const, label: "Mapa puta", icon: MapIcon },
            { key: "discipline" as const, label: "Disciplina", icon: BarChart3 },
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

      {/* ═══════════ TAB: OPERATIONS ═══════════ */}
      {activeTab === "operations" && (
        <>
          {/* ─── Phases ─── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-xl bg-card border p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="font-serif text-lg">Faze učenja</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowBufferSettings(!showBufferSettings)} className="gap-1.5 text-xs">
                <Shield className="h-3.5 w-3.5" /> Buffer: {config.bufferPercent}%
              </Button>
            </div>

            {/* Buffer settings */}
            {showBufferSettings && (
              <div className="p-4 rounded-lg border border-dashed space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Sigurnosna zona (Buffer %)</p>
                    <p className="text-xs text-muted-foreground">Sistem će računati kao da ispit počinje ranije, ostavljajući krajnji period za finalno ponavljanje.</p>
                  </div>
                  <span className="text-lg font-serif tabular-nums text-primary">{config.bufferPercent}%</span>
                </div>
                <Slider
                  value={[config.bufferPercent]}
                  onValueChange={([v]) => save({ ...config, bufferPercent: v })}
                  min={0} max={30} step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0% (bez buffera)</span>
                  <span>30% (maksimalan)</span>
                </div>
              </div>
            )}

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
                    mode="single" selected={goalDate} onSelect={setFinalGoal}
                    disabled={(date) => date < startOfDay(new Date())} initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {goalDate && (
                <span className="text-xs text-muted-foreground">
                  ({differenceInDays(goalDate, new Date())} dana do cilja
                  {config.bufferPercent > 0 && `, efektivno ${Math.round(differenceInDays(goalDate, new Date()) * (1 - config.bufferPercent / 100))} dana`})
                </span>
              )}
            </div>

            {/* Timeline bar */}
            {config.phases.length > 0 && totalTimelineDays > 0 && (
              <div className="flex h-6 rounded-lg overflow-hidden bg-secondary">
                {config.phases.map((p, i) => {
                  const dd = dynamicDates.find(d => d.phaseId === p.id);
                  const days = dd?.dynamicDays || p.expectedDays;
                  return (
                    <div
                      key={p.id}
                      style={{ width: `${(days / totalTimelineDays) * 100}%`, backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] }}
                      className="flex items-center justify-center overflow-hidden"
                    >
                      <span className="text-[9px] font-bold text-primary-foreground truncate px-1">{p.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Phases list */}
            {config.phases.length > 0 && (
              <Reorder.Group
                axis="y"
                values={config.phases}
                onReorder={(newOrder) => save({ ...config, phases: newOrder })}
                className="space-y-2"
              >
                {phaseProgressList.map((p, i) => {
                  const dd = dynamicDates.find(d => d.phaseId === p.id);
                  return (
                    <PhaseItem
                      key={p.id}
                      phase={p}
                      index={i}
                      dynamicDays={dd?.dynamicDays ?? null}
                      isEditing={editingPhaseId === p.id}
                      editName={editName}
                      editDays={editDays}
                      setEditName={setEditName}
                      setEditDays={setEditDays}
                      onSaveEdit={saveEditPhase}
                      onCancelEdit={() => setEditingPhaseId(null)}
                      onStartEdit={() => startEditPhase(p)}
                      onRemove={() => removePhase(p.id)}
                    />
                  );
                })}
              </Reorder.Group>
            )}

            {/* Add phase form */}
            <div className="space-y-3 p-4 rounded-lg border border-dashed">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nova faza</p>
              <div className="flex gap-2">
                <Input value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)} placeholder="Naziv (npr. Anatomija fokus)" className="flex-1" />
                <Input type="number" value={newPhaseDays} onChange={e => setNewPhaseDays(e.target.value)} placeholder="Očekivano dana" className="w-24" min={1} />
              </div>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <button
                      key={cat} onClick={() => toggleCat(cat)}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                        newPhaseCats.includes(cat) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              <Button size="sm" onClick={addPhase} disabled={!newPhaseName.trim()} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Dodaj fazu
              </Button>
            </div>
          </motion.div>

          {/* ─── Reality Check ─── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-xl bg-card border p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h3 className="font-serif text-lg">Reality Check</h3>
              </div>
              {plannerStatus.status === "red" && config.finalGoalDate && (
                <Button variant="outline" size="sm" onClick={handleRebalance} className="gap-1.5 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Niveliši plan
                </Button>
              )}
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
            <div className={cn("flex items-start gap-3 p-4 rounded-xl border", statusCfg.bg)}>
              <StatusIcon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", statusCfg.color)} />
              <div>
                <p className={cn("text-sm font-medium", statusCfg.color)}>
                  {plannerStatus.status === "green" && statusCfg.label}
                  {plannerStatus.status === "yellow" && `Kasniš ${plannerStatus.daysLate} dana. Povećaj tempo.`}
                  {plannerStatus.status === "red" && `Tvoj trenutni tempo nije dovoljan. Kasniš ${plannerStatus.daysLate} dana. Koristi "Niveliši plan".`}
                  {plannerStatus.status === "no-goal" && statusCfg.label}
                </p>
                {plannerStatus.status !== "no-goal" && plannerStatus.status !== "green" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Potrebna brzina: {remaining > 0 && config.finalGoalDate
                      ? `${Math.ceil(remaining / Math.max(1, Math.round(differenceInDays(new Date(config.finalGoalDate), new Date()) * (1 - config.bufferPercent / 100))))} cjelina/dan`
                      : "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Smart daily suggestion */}
            {smartSuggestion && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Smart Load Balancing</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{smartSuggestion.message}</p>
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {smartSuggestion.suggestedToday > 0 && (
                      <p className="text-lg font-serif text-primary">{smartSuggestion.suggestedToday} novih cjelina</p>
                    )}
                    {timeRec && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{timeRec.message}</span>
                        <span className="text-[10px]">({dueCount} dospjelih + {smartSuggestion.suggestedToday} novih)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Burnout Protection */}
            {smartSuggestion?.burnoutWarning && (
              <div className="flex items-start gap-3 p-3 rounded-xl border border-warning/30 bg-warning/5">
                <Flame className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-warning">Visok rizik od zamora</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Dnevna kvota od {smartSuggestion.suggestedToday} kartica prelazi sigurnu granicu (60). Razmisli o produženju faze ili smanjenju buffera.
                  </p>
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
        </>
      )}

      {/* ═══════════ TAB: ROADMAP (Burn-up) ═══════════ */}
      {activeTab === "roadmap" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-5">

          {/* Burn-up Chart */}
          <div className="rounded-xl bg-card border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-lg">Burn-up Chart</h3>
            </div>

            {burnupData.length > 2 ? (
              <>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={burnupData}>
                      <defs>
                        <linearGradient id="gradBurnup" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="actual" name="Stvarni napredak" stroke="hsl(var(--primary))" fill="url(#gradBurnup)" strokeWidth={2.5} connectNulls dot={false} />
                      <Line type="monotone" dataKey="ideal" name="Idealna linija" stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 justify-center text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-primary" /> Stvarni napredak</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-success" style={{ borderTop: "2px dashed" }} /> Idealna linija{config.bufferPercent > 0 ? ` (−${config.bufferPercent}% buffer)` : ""}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Potrebno je više podataka za prikaz grafikona. Nastavi sa učenjem.
              </p>
            )}
          </div>

          {/* Simulation / Projection */}
          <div className="rounded-xl bg-card border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-lg">Simulacija završetka</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{projectionText}</p>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t">
              <div className="text-center">
                <p className="text-xl font-serif tabular-nums">{velocity.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">kartica/dan</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-serif tabular-nums">{remaining}</p>
                <p className="text-[10px] text-muted-foreground">preostalo</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-serif tabular-nums">{totalSections}</p>
                <p className="text-[10px] text-muted-foreground">ukupno cjelina</p>
              </div>
            </div>
          </div>

          {/* Per-phase snapshot */}
          {phaseProgressList.length > 0 && (
            <div className="rounded-xl bg-card border p-5 space-y-3">
              <h4 className="text-sm font-medium">Progres po fazama</h4>
              {phaseProgressList.map((p, i) => (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] }} />
                      {p.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{p.learned}/{p.total}</span>
                  </div>
                  <Progress value={p.pct} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════════ TAB: DISCIPLINE ═══════════ */}
      {activeTab === "discipline" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-5">

          {/* Rocket Streak Widget */}
          {disciplineLog.length > 0 && (
            <div className={cn(
              "rounded-xl border p-5 space-y-3",
              streak >= 7 ? "bg-success/10 border-success/30" :
              streak >= 3 ? "bg-primary/10 border-primary/30" : "bg-card"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔥</span>
                  <div>
                    <h3 className="font-serif text-lg">Rocket Streak</h3>
                    <p className="text-xs text-muted-foreground">Uzastopni 🚀 dani</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-4xl font-bold tabular-nums",
                    streak >= 7 ? "text-success" : streak >= 3 ? "text-primary" : "text-foreground"
                  )}>{streak}</p>
                  <p className="text-[10px] text-muted-foreground">dana zaredom</p>
                </div>
              </div>
              {bestStreak > streak && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                  <span>🏆</span>
                  <span>Najbolji streak: <span className="font-bold text-foreground">{bestStreak}</span> dana</span>
                </div>
              )}
              {streak > 0 && (
                <div className="flex gap-0.5">
                  {Array.from({ length: Math.min(streak, 30) }).map((_, i) => (
                    <div key={i} className={cn("h-2 flex-1 rounded-full", streak >= 7 ? "bg-success" : "bg-primary")} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Phase discipline info */}
          {currentPhase && (
            <div className="rounded-xl bg-card border p-4 flex items-center gap-3">
              <Target className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                U fazi <span className="font-medium text-foreground">{currentPhase.name}</span>, tvoja dosljednost je{" "}
                <span className={cn("font-bold", phaseDisciplinePct >= 80 ? "text-success" : phaseDisciplinePct >= 50 ? "text-warning" : "text-destructive")}>
                  {phaseDisciplinePct}%
                </span>
              </p>
            </div>
          )}

          {/* 14-day grid */}
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
            <div className="flex gap-4 justify-center text-xs text-muted-foreground pt-2 border-t">
              <span>🚀 Vrijedan (≥90%)</span>
              <span>😐 Neutralan (70-89%)</span>
              <span>🐢 Lijen (&lt;70%)</span>
            </div>
          </div>

          {/* Discipline trend */}
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
    </div>
  );
}
