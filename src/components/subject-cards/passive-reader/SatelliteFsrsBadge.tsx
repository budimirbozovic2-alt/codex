import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  SATELLITE_FSRS_LABELS,
  type SatelliteFsrsStatus,
} from "./satellite-fsrs-status";

const TONE: Record<SatelliteFsrsStatus, string> = {
  new: "bg-muted/50 text-muted-foreground",
  due: "bg-warning/15 text-warning",
  leech: "bg-destructive/15 text-destructive",
  ok: "bg-success/15 text-success",
};

interface Props {
  status: SatelliteFsrsStatus;
  className?: string;
}

function SatelliteFsrsBadgeImpl({ status, className }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide",
              TONE[status],
              className,
            )}
          >
            {SATELLITE_FSRS_LABELS[status]}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs max-w-[200px]">
          {status === "new" && "Blic još nije ocijenjen u Learn/Review sesiji."}
          {status === "due" && "FSRS interval je istekao — spreman za konsolidaciju."}
          {status === "leech" && "Previše padova — prioritet za saniranje."}
          {status === "ok" && "Stabilan — nije dospjelo."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const SatelliteFsrsBadge = memo(SatelliteFsrsBadgeImpl);
