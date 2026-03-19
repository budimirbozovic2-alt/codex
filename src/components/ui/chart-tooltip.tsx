/**
 * Shared recharts custom tooltip — replaces duplicated CustomTooltip
 * across MyStats, ForgettingCurve, StrategicPlanner, etc.
 */

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  /** Optional prefix for the label, e.g. "Dan" → "Dan 5" */
  labelPrefix?: string;
  /** Optional suffix for values, e.g. "%" */
  valueSuffix?: string;
}

export function ChartTooltip({ active, payload, label, labelPrefix, valueSuffix }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-card-foreground">
        {labelPrefix ? `${labelPrefix} ${label}` : label}
      </p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs text-muted-foreground">
          {p.name}: <span className="font-medium text-card-foreground">
            {p.value}{valueSuffix || ""}
          </span>
        </p>
      ))}
    </div>
  );
}
