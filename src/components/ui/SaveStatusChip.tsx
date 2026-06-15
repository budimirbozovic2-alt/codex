import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Props {
  status: SaveStatus;
  className?: string;
}

const LABELS: Record<Exclude<SaveStatus, "idle">, string> = {
  dirty: "Nesačuvane izmjene",
  saving: "Čuvam…",
  saved: "Sačuvano",
  error: "Greška pri čuvanju",
};

export function SaveStatusChip({ status, className }: Props) {
  if (status === "idle") return null;

  const label = LABELS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
        status === "dirty" && "border-warning/30 bg-warning/10 text-warning",
        status === "saving" && "border-primary/30 bg-primary/10 text-primary",
        status === "saved" && "border-success/30 bg-success/10 text-success",
        status === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "saved" && <Check className="h-3 w-3" />}
      {status === "error" && <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}
