import { motion } from "framer-motion";
import { BarChart3, Target } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { getDisciplineEmoji } from "@/lib/planner-storage";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "./planner-constants";
import type { DisciplineLogEntry, DisciplineTrendPoint } from "@/types/planner";

interface Props {
  disciplineLog: DisciplineLogEntry[];
  disciplineTrend: DisciplineTrendPoint[];
  streak: number;
  bestStreak: number;
  currentPhase: { name: string } | null;
  phaseDisciplinePct: number;
}

export default function DisciplineTab({
  disciplineLog, disciplineTrend,
  streak, bestStreak,
  currentPhase, phaseDisciplinePct,
}: Props) {
  return (
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
  );
}
