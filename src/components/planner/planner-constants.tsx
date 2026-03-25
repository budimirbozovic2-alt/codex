import { CheckCircle, AlertTriangle, XCircle, Target } from "lucide-react";

export const STATUS_CONFIG = {
  green: { icon: CheckCircle, color: "text-success", bg: "bg-success/10 border-success/30", label: "Napreduješ odlično. Tvoj plan je vrlo realan." },
  yellow: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10 border-warning/30", label: "" },
  red: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", label: "" },
  "no-goal": { icon: Target, color: "text-muted-foreground", bg: "bg-secondary border-border", label: "Postavi konačni cilj da aktiviraš predikcije." },
};

export const PHASE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "hsl(var(--accent-foreground))",
];

export const ChartTooltip = ({ active, payload, label }: any) => {
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
