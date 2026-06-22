import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared shell for subject-dashboard insight widgets (Spremnost, Leech, Prognoza). */
export const SUBJECT_COMPACT_PANEL_CLASS =
  "glass-card rounded-xl border border-border/60 px-4 py-3";

interface Props {
  ariaLabel: string;
  icon?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SubjectCompactPanel({
  ariaLabel,
  icon,
  title,
  trailing,
  action,
  children,
  className,
}: Props) {
  const showHeader = icon || title || trailing || action;

  return (
    <section
      aria-label={ariaLabel}
      className={cn(SUBJECT_COMPACT_PANEL_CLASS, className)}
    >
      {showHeader && (
        <div
          className={cn(
            "flex items-center justify-between gap-2",
            children && "mb-2",
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {icon}
            {title != null && (
              <span className="text-sm font-semibold text-foreground truncate">
                {title}
              </span>
            )}
            {trailing}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
