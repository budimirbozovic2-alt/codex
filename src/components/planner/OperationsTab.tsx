import { useState } from "react";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { StudyPhase, PlannerConfig, calcRebalancedQuota } from "@/lib/planner-storage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format, differenceInDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Clock, RefreshCw, Shield, Flame, Target, Plus, Calendar, Zap, Lightbulb, AlertTriangle } from "lucide-react";
import PhaseItem from "./PhaseItem";
import { STATUS_CONFIG, PHASE_COLORS } from "./planner-constants";
import type { PhaseProgressItem, DynamicDateItem, SmartSuggestionItem, TimeRecommendation, CognitiveDebtItem } from "@/types/planner";

interface Props {
  config: PlannerConfig;
  save: (c: PlannerConfig) => void;
  categories: string[];
  phaseProgressList: PhaseProgressItem[];
  dynamicDates: DynamicDateItem[];
  totalTimelineDays: number;
  velocity: number;
  remaining: number;
  estimatedFinish: Date | null;
  plannerStatus: { status: string; daysLate: number };
  smartSuggestion: SmartSuggestionItem | null;
  timeRec: TimeRecommendation | null;
  debt: CognitiveDebtItem | null;
  dueCount: number;
  onNavigateToDatabase?: (category: string) => void;
}

export default function OperationsTab({
  config, save, categories,
  phaseProgressList, dynamicDates, totalTimelineDays,
  velocity, remaining, estimatedFinish, plannerStatus,
  smartSuggestion, timeRec, debt, dueCount,
  onNavigateToDatabase,
}: Props) {
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDays, setNewPhaseDays] = useState("30");
  const [newPhaseCats, setNewPhaseCats] = useState<string[]>([]);
  const [goalDate, setGoalDate] = useState<Date | undefined>(config.finalGoalDate ? new Date(config.finalGoalDate) : undefined);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDays, setEditDays] = useState("");
  const [showBufferSettings, setShowBufferSettings] = useState(false);

  const statusCfg = STATUS_CONFIG[plannerStatus.status as keyof typeof STATUS_CONFIG];
  const StatusIcon = statusCfg.icon;

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
    save({ ...config });
  };

  return (
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
                  onOpenInDB={() => {
                    if (p.categories.length > 0 && onNavigateToDatabase) {
                      onNavigateToDatabase(p.categories[0]);
                    }
                  }}
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
  );
}
