import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface ChartTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-md text-xs space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? `${p.value}%` : p.value}</p>
      ))}
    </div>
  );
}

interface Props {
  ratioHistory: { name: string; "Stvarni ponavljanje": number | null }[];
  targetReviewPct: number;
}

export default function DashboardChart({ ratioHistory, targetReviewPct }: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
      className="rounded-xl bg-card border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="font-serif text-lg">Omjer ponavljanja (14 dana)</h3>
      </div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ratioHistory}>
            <defs>
              <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={targetReviewPct} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Cilj ${targetReviewPct}%`, position: "right", fontSize: 10, fill: "hsl(var(--destructive))" }} />
            <Area type="monotone" dataKey="Stvarni ponavljanje" stroke="hsl(var(--primary))" fill="url(#gradActual)" strokeWidth={2} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 justify-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-primary" /> Stvarni % ponavljanja</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-destructive" style={{ borderTop: "2px dashed" }} /> Idealni cilj</span>
      </div>
    </motion.div>
  );
}
