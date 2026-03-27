import { useMemo } from "react";


import { loadCalibration, getCalibrationStats } from "@/lib/metacognitive-storage";
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import Gauge from "lucide-react/dist/esm/icons/gauge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";

export default function CalibrationTab() {
  const calibration = useMemo(() => loadCalibration(), []);
  const stats = useMemo(() => getCalibrationStats(calibration), [calibration]);

  const distributionData = useMemo(() => {
    const groups: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    calibration.forEach(e => { groups[e.confidence]?.push(e.actualGrade); });
    return Object.entries(groups).map(([conf, grades]) => ({
      confidence: `Sig. ${conf}`,
      avgGrade: grades.length > 0 ? +(grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : 0,
      count: grades.length,
    }));
  }, [calibration]);

  const pieData = [
    { name: "Prekalibrisan", value: stats.overconfident, fill: "hsl(var(--destructive))" },
    { name: "Potkalibris.", value: stats.underconfident, fill: "hsl(var(--warning))" },
    { name: "Kalibrisan", value: stats.calibrated, fill: "hsl(var(--success))" },
  ].filter(d => d.value > 0);

  if (calibration.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <Gauge className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h3 className="text-lg font-medium">Nema podataka o kalibraciji</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Tokom ponavljanja, prije otkrivanja odgovora bićete upitani za nivo sigurnosti (1-5).
          Podaci se automatski prikupljaju.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">Mjerenja</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-success">{stats.calibrated}</div>
          <div className="text-xs text-muted-foreground mt-1">Kalibrisano</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className={`text-2xl font-bold ${stats.avgDelta > 0.3 ? "text-destructive" : stats.avgDelta < -0.3 ? "text-warning" : "text-success"}`}>
            {stats.avgDelta > 0 ? "+" : ""}{stats.avgDelta.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.avgDelta > 0.3 ? "Iluzija znanja ⚠️" : stats.avgDelta < -0.3 ? "Potcjenjivanje" : "Dobra kalibracija ✓"}
          </div>
        </div>
      </div>

      {stats.avgDelta > 0.3 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Iluzija znanja detektovana</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vaša procjena sigurnosti je u prosjeku {stats.avgDelta.toFixed(1)} poena viša od stvarnog znanja.
              Usporite i budite kritičniji pri procjeni.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Distribucija kalibracije</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
              {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Sigurnost vs. Stvarna ocjena</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distributionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="confidence" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Bar dataKey="avgGrade" name="Prosj. ocjena" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Idealno: svaki nivo sigurnosti odgovara proporcionalnoj ocjeni. Ako su "Sigurnost 5" ocjene niske — imate iluziju znanja.
        </p>
      </div>
    </div>
  );
}
