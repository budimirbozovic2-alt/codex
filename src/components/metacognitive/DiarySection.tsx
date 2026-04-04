import { BookOpen, Clock, Brain, AlertTriangle, CheckCircle, XCircle, Target } from "lucide-react";
import { useState, useMemo, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ReviewLogEntry } from "@/lib/storage";
import { loadPlanner, getSmartSuggestion, calcVelocity } from "@/lib/planner-storage";
import { SectionState } from "@/lib/spaced-repetition";
import { Card } from "@/lib/spaced-repetition";
import {
  loadDiary, addDiaryEntry, DiaryEntry, setLastAnalysisDate,
  getTodayReviewStats,
  getTimeDistribution, RESERVOIR_LABELS, RESERVOIR_COLORS,
} from "@/lib/metacognitive-storage";
import { format, startOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const WeeklyChart = lazy(() => import("./WeeklyChart"));

interface Props {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  catNameMap: Record<string, string>;
}

export default function DiarySection({ cards, reviewLog, catNameMap }: Props) {
  const [diary, setDiary] = useState<DiaryEntry[]>(() => loadDiary());
  const [dailyGoal, setDailyGoal] = useState("");
  const [selfAnalysis, setSelfAnalysis] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = diary.find(d => d.date === today);
  const todayStats = useMemo(() => getTodayReviewStats(reviewLog), [reviewLog]);
  const todayTime = useMemo(() => getTimeDistribution(1), []);

  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  const plannerGoal = useMemo(() => {
    const config = loadPlanner();
    if (!config.finalGoalDate) return null;
    const velocity = calcVelocity(reviewLog, 7);
    const suggestion = getSmartSuggestion(null, cards, config.finalGoalDate, velocity, config.bufferPercent ?? 20);
    const now = Date.now();
    const dueCount = cards.reduce((sum, c) => sum + c.sections.filter(s => s.state !== SectionState.New && s.nextReview <= now).length, 0);
    return suggestion ? { suggestedNew: suggestion.suggestedToday, due: dueCount } : null;
  }, [cards, reviewLog]);

  const handleSave = () => {
    const entry = addDiaryEntry({ date: today, dailyGoal: dailyGoal || todayEntry?.dailyGoal || "", selfAnalysis });
    setLastAnalysisDate(today);
    setDiary(prev => {
      const idx = prev.findIndex(d => d.date === today);
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
      return [...prev, entry];
    });
    setSelfAnalysis("");
  };

  const recentDays = useMemo(() => {
    const days: { date: string; successes: number; lapses: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayStart = startOfDay(d).getTime();
      const dayEnd = dayStart + 86400000;
      const dayEntries = reviewLog.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);
      days.push({
        date: format(d, "EEE dd"),
        successes: dayEntries.filter(e => e.grade === 4).length,
        lapses: dayEntries.filter(e => e.grade <= 2).length,
        total: dayEntries.length,
      });
    }
    return days;
  }, [reviewLog]);

  const subjectProgress = useMemo(() => {
    const dayStart = startOfDay(new Date()).getTime();
    const todayEntries = reviewLog.filter(e => e.timestamp >= dayStart);
    const grouped = new Map<string, Set<string>>();
    for (const e of todayEntries) {
      const key = e.category;
      if (!grouped.has(key)) grouped.set(key, new Set());
      grouped.get(key)!.add(`${e.cardId}:${e.sectionId ?? 0}`);
    }
    return Array.from(grouped.entries())
      .map(([catId, sections]) => ({ catId, name: catNameMap[catId] || catId, count: sections.size }))
      .sort((a, b) => b.count - a.count);
  }, [reviewLog, catNameMap]);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{todayStats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">Ukupno danas</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-2xl font-bold text-success">{todayStats.successes.length}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Uspjesi (4)</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-2xl font-bold text-destructive">{todayStats.lapses.length}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Lapsusi (1-2)</div>
        </div>
      </div>

      {todayTime.totalMs > 60000 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Radno vrijeme danas</span>
          </div>
          <div className="flex h-2.5 rounded-md overflow-hidden bg-secondary">
            {todayTime.review > 0 && <div style={{ width: `${(todayTime.review / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.review }} />}
            {todayTime.learning > 0 && <div style={{ width: `${(todayTime.learning / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.learning }} />}
            {todayTime.creative > 0 && <div style={{ width: `${(todayTime.creative / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.creative }} />}
            {todayTime.analysis > 0 && <div style={{ width: `${(todayTime.analysis / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.analysis }} />}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Efektivno: {Math.round(todayTime.cognitiveMs / 60000)} min</span>
            <span>Logistika: {Math.round(todayTime.logisticMs / 60000)} min</span>
          </div>
        </div>
      )}

      <Suspense fallback={<Skeleton className="h-[240px] w-full rounded-xl" />}>
        <WeeklyChart data={recentDays} />
      </Suspense>

      {subjectProgress.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> Danas po predmetima
          </h3>
          <div className="space-y-2">
            {subjectProgress.map(s => (
              <div key={s.catId} className="flex items-center justify-between py-1">
                <span className="text-sm truncate mr-2">{s.name}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {todayStats.lapses.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Današnji lapsusi
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {todayStats.lapses.map((l, i) => {
              const card = cardMap.get(l.cardId);
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${l.grade === 1 ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>
                    {l.grade}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{card?.question || "Nepoznata kartica"}</p>
                    <p className="text-xs text-muted-foreground">{catNameMap[l.category] || l.category}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todayStats.successes.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" /> Današnji uspjesi
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {todayStats.successes.map((s, i) => {
              const card = cardMap.get(s.cardId);
              const hasMnemonic = card?.tags?.includes("memorizacija");
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-success/5 border border-success/10">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-success text-success-foreground">4</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{card?.question || "Nepoznata kartica"}</p>
                    <p className="text-xs text-muted-foreground">
                      {catNameMap[s.category] || s.category}
                      {hasMnemonic && " · Mnemotehnika"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" /> Dnevna samoanaliza
        </h3>
        {todayEntry && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground mb-1">Cilj dana:</p>
            <p className="text-sm">{todayEntry.dailyGoal || "—"}</p>
            {todayEntry.selfAnalysis && (
              <>
                <p className="text-xs text-muted-foreground mt-2 mb-1">Analiza:</p>
                <p className="text-sm">{todayEntry.selfAnalysis}</p>
              </>
            )}
          </div>
        )}
        <div className="space-y-3">
          {plannerGoal && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 p-2">
              <Target className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs text-primary">
                Preporučeni cilj danas: <strong>{plannerGoal.suggestedNew} novih</strong> + <strong>{plannerGoal.due} dospjelih</strong>
              </span>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dnevni cilj</label>
            <Input
              value={dailyGoal}
              onChange={e => setDailyGoal(e.target.value)}
              placeholder="Npr. Savladati 3 nova zakona..."
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Šta je bilo dobro? Šta mijenjam sutra?</label>
            <Textarea
              value={selfAnalysis}
              onChange={e => setSelfAnalysis(e.target.value)}
              placeholder="Kratka refleksija o današnjem učenju..."
              rows={3}
              className="text-sm"
            />
          </div>
          <Button onClick={handleSave} size="sm" disabled={!selfAnalysis.trim()}>
            Sačuvaj analizu
          </Button>
        </div>
      </div>

      {diary.filter(d => d.date !== today).length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium">Istorija dnevnika</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {diary
              .filter(d => d.date !== today)
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 14)
              .map(d => (
                <div key={d.id} className="p-3 rounded-lg bg-secondary/50 border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{d.date}</span>
                  </div>
                  {d.dailyGoal && <p className="text-xs text-muted-foreground">Cilj: {d.dailyGoal}</p>}
                  <p className="text-sm">{d.selfAnalysis}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
