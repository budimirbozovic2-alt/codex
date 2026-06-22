import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { Card } from "@/lib/spaced-repetition";
import { buildDueForecast } from "@/lib/review/due-forecast";
import { cn } from "@/lib/utils";
import { SubjectCompactPanel } from "@/components/subject/SubjectCompactPanel";

interface Props {
  cards: Card[];
  horizonDays?: number;
  className?: string;
  variant?: "default" | "compact" | "embedded";
}

export function DueForecastWidget({
  cards,
  horizonDays = 7,
  className,
  variant = "default",
}: Props) {
  const forecast = useMemo(
    () => buildDueForecast(cards, horizonDays),
    [cards, horizonDays],
  );

  if (cards.length === 0) {
    if (variant === "embedded") {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nema kartica za prognozu.
        </p>
      );
    }
    return null;
  }

  const maxCount = Math.max(1, ...forecast.days.map((d) => d.count));

  const chart = (compact: boolean) => (
    <div className={cn("flex items-end gap-1.5", compact ? "h-12" : "h-24")}>
      {forecast.days.map((day) => {
        const pct = (day.count / maxCount) * 100;
        const barMaxH = compact ? "h-8" : "h-16";
        return (
          <div key={day.dayOffset} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <span className="text-[10px] font-semibold tabular-nums text-foreground leading-none">
              {day.count || "·"}
            </span>
            <div className={cn("w-full flex items-end justify-center", barMaxH)}>
              <div
                className={cn(
                  "w-full max-w-[2rem] rounded-t transition-all",
                  day.dayOffset === 0 ? "bg-primary" : "bg-primary/45",
                )}
                style={{ height: `${Math.max(day.count > 0 ? 8 : 2, pct)}%` }}
                title={`${day.label}: ${day.count}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-none">
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (variant === "embedded") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Za {horizonDays} dana:{" "}
          <strong className="text-foreground tabular-nums">~{forecast.totalUpcoming}</strong>{" "}
          dospjelih sekcija
        </p>
        {chart(true)}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <SubjectCompactPanel
        ariaLabel="Prognoza dospjelih"
        className={className}
        icon={<CalendarClock className="h-3.5 w-3.5 text-primary shrink-0" />}
        title="Prognoza konsolidacije"
        trailing={
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            ~{forecast.totalUpcoming} / {horizonDays}d
          </span>
        }
      >
        {chart(true)}
      </SubjectCompactPanel>
    );
  }

  return (
    <section
      className={cn("glass-card rounded-xl p-5 space-y-4", className)}
      aria-label="Prognoza dospjelih"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Prognoza konsolidacije</h3>
        </div>
        <p className="text-xs text-muted-foreground text-right">
          Za {horizonDays} dana:{" "}
          <strong className="text-foreground tabular-nums">~{forecast.totalUpcoming}</strong>{" "}
          dospjelih sekcija
        </p>
      </div>
      {chart(false)}
    </section>
  );
}
