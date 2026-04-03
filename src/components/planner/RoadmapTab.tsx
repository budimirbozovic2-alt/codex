import { TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart,
} from "recharts";
import { ChartTooltip, PHASE_COLORS } from "./planner-constants";
import type { BurnupDataPoint, SubjectPlan } from "@/types/planner";

interface Props {
  burnupData: BurnupDataPoint[];
  projectionText: string;
  velocity: number;
  remaining: number;
  totalSections: number;
  subjectPlans: SubjectPlan[];
  bufferPercent: number;
}

export default function RoadmapTab({
  burnupData, projectionText, velocity, remaining, totalSections,
  subjectPlans, bufferPercent,
}: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="space-y-5">

      {/* Burn-up Chart */}
      <div className="rounded-xl bg-card border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-medium">Burn-up Chart</h3>
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
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-success" style={{ borderTop: "2px dashed" }} /> Idealna linija{bufferPercent > 0 ? ` (−${bufferPercent}% buffer)` : ""}</span>
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
          <h3 className="text-lg font-medium">Simulacija završetka</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{projectionText}</p>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
          <div className="text-center">
            <p className="text-xl tabular-nums">{velocity.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">kartica/dan</p>
          </div>
          <div className="text-center">
            <p className="text-xl tabular-nums">{remaining}</p>
            <p className="text-[10px] text-muted-foreground">preostalo</p>
          </div>
          <div className="text-center">
            <p className="text-xl tabular-nums">{totalSections}</p>
            <p className="text-[10px] text-muted-foreground">ukupno cjelina</p>
          </div>
        </div>
      </div>

      {/* Per-subject snapshot */}
      {subjectPlans.length > 0 && (
        <div className="rounded-xl bg-card border p-5 space-y-3">
          <h4 className="text-sm font-medium">Progres po predmetima</h4>
          {subjectPlans.map((p, i) => (
            <div key={p.categoryId} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] }} />
                  {p.categoryName}
                  {p.weight > 1 && <span className="text-[9px] text-warning">(težak)</span>}
                </span>
                <span className="text-muted-foreground tabular-nums">{p.learnedSections}/{p.totalSections}</span>
              </div>
              <Progress value={p.pct} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
