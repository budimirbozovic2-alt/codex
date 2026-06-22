import { Check, ChevronRight, Zap } from "lucide-react";
import React from "react";
import { Card } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";

export type SagaSidebarMode = "minimized" | "active";

interface Props {
  satellites: Card[];
  activeIndex: number;
  completedIds: Set<string>;
  mode: SagaSidebarMode;
}

const SagaSatelliteSidebar = React.memo(function SagaSatelliteSidebar({
  satellites,
  activeIndex,
  completedIds,
  mode,
}: Props) {
  if (satellites.length === 0) return null;

  return (
    <aside className="w-full lg:w-72 shrink-0 space-y-2">
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Blic sateliti ({satellites.length})
        </div>
        <ul className="space-y-1.5">
          {satellites.map((sat, i) => {
            const isDone = completedIds.has(sat.id);
            const isActive = mode === "active" && i === activeIndex && !isDone;
            const isPending = mode === "minimized" || (mode === "active" && i > activeIndex && !isDone);

            return (
              <li
                key={sat.id}
                className={cn(
                  "rounded-lg border px-3 py-2 transition-all",
                  isActive && "border-primary bg-primary/5 shadow-sm",
                  isDone && "border-success/30 bg-success/5 opacity-80",
                  isPending && !isDone && "border-dashed border-muted-foreground/20 bg-muted/20",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5 shrink-0">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-xs leading-snug truncate",
                        isActive ? "font-medium text-foreground" : "text-muted-foreground",
                        mode === "minimized" && "line-clamp-1",
                      )}
                      title={sat.question}
                    >
                      {sat.question || "(Bez pitanja)"}
                    </p>
                    {isActive && (
                      <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                        <ChevronRight className="h-3 w-3" /> Aktivno
                      </p>
                    )}
                  </div>
                  {isDone && <Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />}
                </div>
              </li>
            );
          })}
        </ul>
        {mode === "minimized" && (
          <p className="text-[10px] text-muted-foreground pt-1 border-t">
            Blic provjere počinju nakon ocjene eseja.
          </p>
        )}
      </div>
    </aside>
  );
});

export default SagaSatelliteSidebar;
