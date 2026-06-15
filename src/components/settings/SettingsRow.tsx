import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsRow({ label, hint, children, className }: SettingsRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-3.5 min-h-[52px]", className)}>
      <div className="min-w-0 flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface SettingsRowWideProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsRowWide({ label, hint, children, className }: SettingsRowWideProps) {
  return (
    <div className={cn("py-3.5 space-y-2.5", className)}>
      <div>
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
