import { memo } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import { ContentRenderer } from "@/components/ui/ContentRenderer";
import type { Card } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";
import { getSatelliteFsrsStatus } from "./satellite-fsrs-status";
import { SatelliteFsrsBadge } from "./SatelliteFsrsBadge";

interface Props {
  satellites: Card[];
  expandedId: string | null;
  onToggle: (satelliteId: string) => void;
}

function PassiveReaderSatellitePanelImpl({ satellites, expandedId, onToggle }: Props) {
  if (satellites.length === 0) return null;

  return (
    <aside className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
        <Zap className="h-3.5 w-3.5 text-primary" />
        Blic potpitanja ({satellites.length})
      </div>

      <ul className="space-y-1.5" role="list">
        {satellites.map((sat, i) => {
          const isOpen = expandedId === sat.id;
          const panelId = `passive-sat-panel-${sat.id}`;
          const triggerId = `passive-sat-trigger-${sat.id}`;
          const fsrsStatus = getSatelliteFsrsStatus(sat);

          return (
            <li key={sat.id} className="rounded-lg border border-border/60 overflow-hidden">
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => onToggle(sat.id)}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors",
                  isOpen ? "bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                  {i + 1}.
                </span>
                <span
                  className={cn(
                    "text-xs leading-snug flex-1 min-w-0",
                    isOpen ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {sat.question || "(Bez pitanja)"}
                </span>
                <SatelliteFsrsBadge status={fsrsStatus} />
              </button>

              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  className="border-t bg-muted/10 px-3 py-3 space-y-3"
                >
                  {(sat.sections ?? []).length > 0 ? (
                    sat.sections!.map((sec) => (
                      <section key={sec.id} className="space-y-1">
                        {sec.title && (
                          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            {sec.title}
                          </h4>
                        )}
                        <ContentRenderer
                          className="prose prose-sm max-w-none card-prose text-sm"
                          doc={sec.contentDoc}
                        />
                      </section>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Nema sadržaja odgovora.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export const PassiveReaderSatellitePanel = memo(PassiveReaderSatellitePanelImpl);
