import { useMemo } from "react";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { loadLatency, getLatencyStats } from "@/lib/metacognitive-storage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export default function LatencyTab() {
  const latency = useMemo(() => loadLatency(), []);
  const stats = useMemo(() => getLatencyStats(latency), [latency]);

  const histogramData = useMemo(() => {
    const buckets: Record<string, number> = { "0-1s": 0, "1-2s": 0, "2-3s": 0, "3-5s": 0, "5-10s": 0, "10s+": 0 };
    latency.forEach(e => {
      const s = e.latencyMs / 1000;
      if (s <= 1) buckets["0-1s"]++;
      else if (s <= 2) buckets["1-2s"]++;
      else if (s <= 3) buckets["2-3s"]++;
      else if (s <= 5) buckets["3-5s"]++;
      else if (s <= 10) buckets["5-10s"]++;
      else buckets["10s+"]++;
    });
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [latency]);

  const byCategoryData = useMemo(() => {
    const groups: Record<string, number[]> = {};
    latency.forEach(e => {
      if (!groups[e.category]) groups[e.category] = [];
      groups[e.category].push(e.latencyMs);
    });
    return Object.entries(groups).map(([cat, times]) => ({
      category: cat.length > 15 ? cat.slice(0, 15) + "…" : cat,
      avgLatency: +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1),
      count: times.length,
    })).sort((a, b) => b.avgLatency - a.avgLatency);
  }, [latency]);

  if (latency.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h3 className="text-lg font-medium">Nema podataka o latenciji</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Vrijeme od prikaza pitanja do klika na "Otkrij odgovor" automatski se mjeri tokom ponavljanja.
        </p>
      </div>
    );
  }

  const automatedPercent = stats.total > 0 ? Math.round((stats.automated / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{(stats.avg / 1000).toFixed(1)}s</div>
          <div className="text-xs text-muted-foreground mt-1">Prosječna latencija</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-success">{automatedPercent}%</div>
          <div className="text-xs text-muted-foreground mt-1">Automatizovano (≤3s)</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-destructive">{stats.notAutomated}</div>
          <div className="text-xs text-muted-foreground mt-1">Nije automatiz. (&gt;3s)</div>
        </div>
      </div>

      {stats.avg > 3000 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium">Spor priziv informacija</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Prosječno vam treba {(stats.avg / 1000).toFixed(1)}s da se sjetite. Cilj je &lt;3s za automatizovano znanje.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Distribucija vremena priziva</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={histogramData}>
            <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Bar dataKey="count" name="Broj" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
              {histogramData.map((d, i) => (
                <Cell key={i} fill={d.range === "0-1s" || d.range === "1-2s" || d.range === "2-3s" ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {byCategoryData.length > 1 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Latencija po kategorijama</h3>
          <ResponsiveContainer width="100%" height={Math.max(150, byCategoryData.length * 35)}>
            <BarChart data={byCategoryData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="s" />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
              <Bar dataKey="avgLatency" name="Prosj. (s)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                {byCategoryData.map((d, i) => (
                  <Cell key={i} fill={d.avgLatency <= 3 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
