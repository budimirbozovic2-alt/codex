import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PageHeaderBackAction {
  label?: string;
  onClick: () => void;
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  titleIcon?: ReactNode;
  back?: PageHeaderBackAction;
  actions?: ReactNode;
  scopeBadge?: string;
  className?: string;
  /** Extra content below title row (e.g. filter toggles). */
  footer?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  titleIcon,
  back,
  actions,
  scopeBadge,
  className,
  footer,
}: PageHeaderProps) {
  const { t } = useI18n();

  return (
    <header className={cn("space-y-2 pb-2", className)}>
      {(back || actions) && (
        <div className="flex items-center justify-between gap-3">
          {back ? (
            <button
              type="button"
              onClick={back.onClick}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              {back.label ?? t("common.back")}
            </button>
          ) : (
            <span />
          )}
          {actions && (
            <div className="flex items-center gap-1 shrink-0">{actions}</div>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-display text-4xl md:text-5xl text-foreground text-balance">
              {title}
            </h1>
            {titleIcon}
            {scopeBadge && (
              <Badge variant="secondary" className="text-xs self-center">
                {scopeBadge}
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-muted-foreground text-sm text-pretty">{subtitle}</p>
          )}
        </div>
      </div>

      {footer}
    </header>
  );
}
