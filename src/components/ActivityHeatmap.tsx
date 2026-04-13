import { useMemo } from "react";
import { ReviewLogEntry } from "@/lib/storage";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";

interface Props {
  reviewLog: ReviewLogEntry[];
}

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

const INTENSITY_CLASSES = [
  "bg-muted",
  "bg-primary/20",
  "bg-primary/40",
  "bg-primary/60",
  "bg-primary/80",
];

export default function ActivityHeatmap({ reviewLog }: Props) {
  // R3 fix: defer discipline log load to avoid blocking paint
  const disciplineLog = useDeferredCompute(async () => {
    const { loadDisciplineLog, getDisciplineEmoji } = await import("@/lib/planner-storage");
    const log = loadDisciplineLog();
    const map = new Map<string, string>();
    log.forEach(e => map.set(e.date, getDisciplineEmoji(e.status)));
    return map;
  }, []);

  const { grid, months } = useMemo(() => {
    const DAYS = 91;
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const counts: Record<string, number> = {};
    reviewLog.forEach((e) => {
      const key = getDayKey(e.timestamp);
      counts[key] = (counts[key] || 0) + 1;
    });

    const maxCount = Math.max(1, ...Object.values(counts));

    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - DAYS + 1);

    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + mondayOffset);

    const cells: { key: string; count: number; intensity: number; date: Date; discipline: string | undefined }[] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;

    const cursor = new Date(startDate);
    let col = 0;
    while (cursor <= now) {
      const weekStart = new Date(cursor);
      for (let row = 0; row < 7; row++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + row);
        const key = getDayKey(d.getTime());
        const count = counts[key] || 0;
        const intensity = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4));

        if (d.getMonth() !== lastMonth) {
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];
          months.push({ label: monthNames[d.getMonth()], col });
          lastMonth = d.getMonth();
        }

        // Convert to ISO date for discipline lookup
        const isoKey = d.toISOString().slice(0, 10);
        cells.push({ key, count, intensity, date: new Date(d), discipline: disciplineLog.get(isoKey) });
      }
      cursor.setDate(cursor.getDate() + 7);
      col++;
    }

    const totalWeeks = col;
    const grid: typeof cells[number][][] = Array.from({ length: 7 }, () => []);
    cells.forEach((cell, i) => {
      const row = i % 7;
      grid[row].push(cell);
    });

    return { grid, months };
  }, [reviewLog, disciplineLog]);

  const dayLabels = ["P", "U", "S", "Č", "P", "S", "N"];

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Aktivnost</h3>

      {/* Month labels */}
      <div className="flex gap-[3px] ml-6 text-[10px] text-muted-foreground">
        {grid[0] && grid[0].map((cell, colIdx) => {
          const m = months.find((m) => m.col === colIdx);
          return (
            <div key={colIdx} className="w-[13px] text-center">
              {m ? m.label : ""}
            </div>
          );
        })}
      </div>

      <div className="flex gap-[3px]">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] text-[10px] text-muted-foreground w-5">
          {dayLabels.map((l, i) => (
            <div key={i} className="h-[13px] flex items-center justify-end pr-0.5">{i % 2 === 0 ? l : ""}</div>
          ))}
        </div>

        {/* Grid */}
        <TooltipProvider delayDuration={100}>
          <div className="flex gap-[3px]">
            {grid[0] && grid[0].map((_, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-[3px]">
                {grid.map((row, rowIdx) => {
                  const cell = row[colIdx];
                  if (!cell) return <div key={rowIdx} className="w-[13px] h-[13px]" />;
                  return (
                    <Tooltip key={rowIdx}>
                      <TooltipTrigger asChild>
                        <div className={`w-[13px] h-[13px] rounded-sm ${INTENSITY_CLASSES[cell.intensity]} transition-colors relative flex items-center justify-center`}>
                          {cell.discipline && (
                            <span className="text-[7px] leading-none">{cell.discipline}</span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {cell.count} ponavljanja — {formatDate(cell.key)}
                        {cell.discipline && ` ${cell.discipline}`}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground justify-end">
        <span>Manje</span>
        {INTENSITY_CLASSES.map((cls, i) => (
          <div key={i} className={`w-[11px] h-[11px] rounded-sm ${cls}`} />
        ))}
        <span>Više</span>
        <span className="ml-2">🚀 Vrijedan</span>
        <span>😐</span>
        <span>🐢 Lijen</span>
      </div>
    </div>
  );
}
