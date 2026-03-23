import { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface StatusIcon {
  key: string;
  icon: ReactNode;
  color: string;
  label: string;
  critical: boolean;
  extraLabel?: string;
}

interface Props {
  icons: StatusIcon[];
  onExport?: () => void;
  storagePercent?: number;
}

export const StatusIconsRow = memo(function StatusIconsRow({ icons, onExport, storagePercent }: Props) {
  if (icons.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}
        className="flex items-center gap-2 flex-wrap">
        {icons.map(si => (
          <Tooltip key={si.key}>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-card cursor-default ${si.color}`}>
                {si.icon}
                {si.critical && <span className="text-xs font-medium">{si.key === "memory" ? "Memorija" : si.key === "storage" ? `${storagePercent}%` : ""}</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">{si.label}</p>
              {si.key === "backup" && onExport && (
                <button onClick={onExport} className="mt-1 text-xs text-primary underline">Napravi backup</button>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </motion.div>
    </TooltipProvider>
  );
});
