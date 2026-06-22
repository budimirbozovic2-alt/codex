import { useMemo } from "react";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  reviewLog: ReviewLogEntry[];
}

function getWeekKey(ts: number): string {
  const d = new Date(ts);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function weekLabel(key: string): string {
  // Parse year and week
  const [year, w] = key.split("-W");
  const weekNum = parseInt(w);
  // Approximate start date
  const jan1 = new Date(parseInt(year), 0, 1);
  const startDate = new Date(jan1.getTime() + (weekNum - 1) * 7 * 86400000);
  return `${String(startDate.getDate()).padStart(2, "0")}.${String(startDate.getMonth() + 1).padStart(2, "0")}`;
}

export default function RetentionChart({ reviewLog }: Props) {
  const data = useMemo(() => {
    if (reviewLog.length === 0) return [];

    const weeks: Record<string, { totalGrade: number; count: number; successCount: number }> = {};
    reviewLog.forEach((e) => {
      const key = getWeekKey(e.timestamp);
      if (!weeks[key]) weeks[key] = { totalGrade: 0, count: 0, successCount: 0 };
      weeks[key].totalGrade += e.grade;
      weeks[key].count += 1;
      if (e.grade >= 3) weeks[key].successCount += 1;
    });

    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // Last 12 weeks
      .map(([key, val]) => ({
        week: weekLabel(key),
        avgGrade: Math.round((val.totalGrade / val.count) * 10) / 10,
        retention: Math.round((val.successCount / val.count) * 100),
        count: val.count,
      }));
  }, [reviewLog]);

  if (data.length < 2) {
    return (
      <div className="glass-card rounded-xl p-5 space-y-2">
        <h3 className="text-eyebrow normal-case tracking-normal">Retencija tokom vremena</h3>
        <p className="text-xs text-muted-foreground">Potrebno je najmanje 2 sedmice podataka.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-2">
      <h3 className="text-eyebrow normal-case tracking-normal">Retencija tokom vremena</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="fill-muted-foreground" unit="%" />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(value: number, name: string) =>
              name === "retention" ? [`${value}%`, "Uspješnost"] : [value, "Prosj. ocjena"]
            }
            labelFormatter={(label) => `Sedmica od ${label}`}
          />
          <Line type="monotone" dataKey="retention" className="stroke-primary" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
