import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/EmptyState";

interface Props {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
}

/** Inline error panel for failed data fetches — distinct from empty lists. */
export function FetchErrorPanel({
  title,
  description,
  backTo,
  backLabel = "Nazad",
  onRetry,
  retryLabel = "Pokušaj ponovo",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 animate-fade-up">
      <div className="space-y-2 max-w-md">
        <h2 className="text-display text-2xl text-foreground text-balance">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="default" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {backTo && (
          <Button variant="outline" size="sm" asChild>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export { EmptyState };
