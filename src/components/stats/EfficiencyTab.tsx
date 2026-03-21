import { useMemo } from "react";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as Activity } from "lucide-react/dist/esm/icons/activity";
import {
  loadSlippageLog, getDeepWorkStats, getTimeDistribution,
  getWeeklyTimeDistribution, RESERVOIR_LABELS, RESERVOIR_COLORS,
} from "@/lib/metacognitive-storage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
} from "recharts";

export default function EfficiencyTab() {
  const slippageLog = useMemo(() => loadSlippageLog(), []);
  const deepWork = useMemo(() => getDeepWorkStats(7), []);
  const deepWork30 = useMemo(() => getDeepWorkStats(30), []);
  const todayTime = useMemo(() => getTimeDistribution(1), []);
  const weekTime = useMemo(() => getTimeDistribution(7), []);
  const weeklyChart = useMemo(() => getWeeklyTimeDistribution(), []);

  const formatMs = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const slippageStats = useMemo(() => {
    if (slippageLog.length === 0) return null;
    const slippages = slippageLog.filter(e => e.slippageMs !== null).map(e => e.slippageMs!);
    if (slippages.length === 0) return null;
    const avg = slippages.reduce((a, b) => a + b, 0) / slippages.length;
    const min = Math.min(...slippages);
    const max = Math.max(...slippages);
    return { avg, min, max, count: slippages.length };
  }, [slippageLog]);

  const slippageChartData = useMemo(() => {
    return slippageLog
      .filter(e => e.slippageMs !== null)
      .slice(-14)
      .map(e => ({
        date: e.date.slice(5),
        slippage: +(e.slippageMs! / 1000).toFixed(0),
      }));
  }, [slippageLog]);

  const deepWorkPieData = [
    { name: "Deep Work", value: deepWork.deepWorkPercent, fill: "hsl(var(--success))" },
    { name: "Shallow Work", value: deepWork.shallowWorkPercent, fill: "hsl(var(--warning))" },
  ].filter(d => d.value > 0);

  const isHealthyRatio = deepWork.deepWorkPercent >= 70;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{slippageStats ? formatMs(slippageStats.avg) : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Prosj. Slippage</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{slippageStats ? formatMs(slippageStats.min) : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Najbolji</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className={`text-2xl font-bold ${isHealthyRatio ? "text-success" : "text-warning"}`}>{deepWork.deepWorkPercent}%</div>
          <div className="text-xs text-muted-foreground mt-1">Deep Work (7d)</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{formatMs(deepWork.totalMs)}</div>
          <div className="text-xs text-muted-foreground mt-1">Ukupno (7d)</div>
        </div>
      </div>

      {(todayTime.totalMs > 60000 || weekTime.totalMs > 60000) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="text-sm font-medium">Distribucija vremena</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {todayTime.totalMs > 60000 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Danas</p>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={140}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: RESERVOIR_LABELS.review, value: Math.round(todayTime.review / 60000), fill: RESERVOIR_COLORS.review },
                          { name: RESERVOIR_LABELS.learning, value: Math.round(todayTime.learning / 60000), fill: RESERVOIR_COLORS.learning },
                          { name: RESERVOIR_LABELS.creative, value: Math.round(todayTime.creative / 60000), fill: RESERVOIR_COLORS.creative },
                          { name: RESERVOIR_LABELS.analysis, value: Math.round(todayTime.analysis / 60000), fill: RESERVOIR_COLORS.analysis },
                        ].filter(d => d.value > 0)}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3}
                      >
                        {[RESERVOIR_COLORS.review, RESERVOIR_COLORS.learning, RESERVOIR_COLORS.creative, RESERVOIR_COLORS.analysis]
                          .filter((_, i) => [todayTime.review, todayTime.learning, todayTime.creative, todayTime.analysis][i] > 0)
                          .map((fill, i) => <Cell key={i} fill={fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => `${v} min`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 text-xs">
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.review }} />{RESERVOIR_LABELS.review}: {Math.round(todayTime.review / 60000)}m</p>
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.learning }} />{RESERVOIR_LABELS.learning}: {Math.round(todayTime.learning / 60000)}m</p>
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.creative }} />{RESERVOIR_LABELS.creative}: {Math.round(todayTime.creative / 60000)}m</p>
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.analysis }} />{RESERVOIR_LABELS.analysis}: {Math.round(todayTime.analysis / 60000)}m</p>
                    <p className="pt-1 border-t text-muted-foreground">Neto kogn.: {todayTime.cognitivePct}%</p>
                  </div>
                </div>
              </div>
            )}
            {weekTime.totalMs > 60000 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Prosjek sedmice</p>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={140}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: RESERVOIR_LABELS.review, value: Math.round(weekTime.review / 60000), fill: RESERVOIR_COLORS.review },
                          { name: RESERVOIR_LABELS.learning, value: Math.round(weekTime.learning / 60000), fill: RESERVOIR_COLORS.learning },
                          { name: RESERVOIR_LABELS.creative, value: Math.round(weekTime.creative / 60000), fill: RESERVOIR_COLORS.creative },
                          { name: RESERVOIR_LABELS.analysis, value: Math.round(weekTime.analysis / 60000), fill: RESERVOIR_COLORS.analysis },
                        ].filter(d => d.value > 0)}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3}
                      >
                        {[RESERVOIR_COLORS.review, RESERVOIR_COLORS.learning, RESERVOIR_COLORS.creative, RESERVOIR_COLORS.analysis]
                          .filter((_, i) => [weekTime.review, weekTime.learning, weekTime.creative, weekTime.analysis][i] > 0)
                          .map((fill, i) => <Cell key={i} fill={fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => `${v} min`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 text-xs">
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.review }} />{RESERVOIR_LABELS.review}: {Math.round(weekTime.review / 60000)}m</p>
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.learning }} />{RESERVOIR_LABELS.learning}: {Math.round(weekTime.learning / 60000)}m</p>
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.creative }} />{RESERVOIR_LABELS.creative}: {Math.round(weekTime.creative / 60000)}m</p>
                    <p><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RESERVOIR_COLORS.analysis }} />{RESERVOIR_LABELS.analysis}: {Math.round(weekTime.analysis / 60000)}m</p>
                    <p className="pt-1 border-t text-muted-foreground">Neto kogn.: {weekTime.cognitivePct}%</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {weeklyChart.some(d => d.review + d.learning + d.creative + d.analysis > 0) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="text-sm font-medium">Sedmična distribucija (min po danu)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyChart}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="m" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => `${v} min`} />
              <Bar dataKey="review" name={RESERVOIR_LABELS.review} stackId="a" fill={RESERVOIR_COLORS.review} radius={[0, 0, 0, 0]} />
              <Bar dataKey="learning" name={RESERVOIR_LABELS.learning} stackId="a" fill={RESERVOIR_COLORS.learning} radius={[0, 0, 0, 0]} />
              <Bar dataKey="creative" name={RESERVOIR_LABELS.creative} stackId="a" fill={RESERVOIR_COLORS.creative} radius={[0, 0, 0, 0]} />
              <Bar dataKey="analysis" name={RESERVOIR_LABELS.analysis} stackId="a" fill={RESERVOIR_COLORS.analysis} radius={[4, 4, 0, 0]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {deepWork.totalMs > 0 && !isHealthyRatio && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium">Previše pasivnog učenja</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deep Work je {deepWork.deepWorkPercent}% — preporučeno ≥70%. Više koristite aktivno prisjećanje i ponavljanje.
            </p>
          </div>
        </div>
      )}

      {slippageStats && slippageStats.avg > 300000 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <Clock className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium">Visok Slippage</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              U prosjeku vam treba {formatMs(slippageStats.avg)} od otvaranja aplikacije do početka učenja.
            </p>
          </div>
        </div>
      )}

      {deepWork.totalMs > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Deep Work vs. Shallow Work (7 dana)</h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={deepWorkPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {deepWorkPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-success" />
                <div>
                  <p className="text-sm font-medium">Deep Work: {formatMs(deepWork.deepWorkMs)}</p>
                  <p className="text-xs text-muted-foreground">Ponavljanje + Aktivno prisjećanje + Lanac</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-warning" />
                <div>
                  <p className="text-sm font-medium">Shallow: {formatMs(deepWork.shallowWorkMs)}</p>
                  <p className="text-xs text-muted-foreground">Slobodno čitanje</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-2">Cilj: ≥70% Deep Work</p>
            </div>
          </div>
        </div>
      )}

      {slippageChartData.length > 1 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Slippage trend (sekunde)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={slippageChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="s" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
              <Area type="monotone" dataKey="slippage" name="Slippage" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Slippage = vrijeme od otvaranja aplikacije do prvog klika na učenje/ponavljanje.</p>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-3">Mjesečni pregled</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-xs text-muted-foreground">Deep Work (30d)</p>
            <p className="text-lg font-bold">{deepWork30.deepWorkPercent}%</p>
            <p className="text-xs text-muted-foreground">{formatMs(deepWork30.deepWorkMs)}</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-xs text-muted-foreground">Ukupno (30d)</p>
            <p className="text-lg font-bold">{formatMs(deepWork30.totalMs)}</p>
            <p className="text-xs text-muted-foreground">{slippageLog.length} sesija</p>
          </div>
        </div>
      </div>

      {slippageLog.length === 0 && deepWork.totalMs === 0 && (
        <div className="mt-8 text-center space-y-3 py-12">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <h3 className="text-lg font-medium">Nema podataka o efikasnosti</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Slippage i Deep Work omjer se automatski prate pri korištenju aplikacije.
          </p>
        </div>
      )}
    </div>
  );
}
