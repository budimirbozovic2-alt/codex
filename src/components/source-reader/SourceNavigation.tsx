import { memo } from "react";
import type { Source } from "@/domains/sources/sources-storage";

interface Props {
  source: Source;
  onScrollToHeading: (id: string) => void;
}

export const SourceNavigation = memo(function SourceNavigation({ source, onScrollToHeading }: Props) {
  const hasOutline = source.outline && source.outline.length > 0;

  return (
    <div className="w-56 flex-shrink-0 sticky top-20 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="rounded-lg border bg-card p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sadržaj</h4>
        {hasOutline ? (
          <nav className="space-y-0.5">
            {source.outline!.map(h => (
              <button key={h.id} onClick={() => onScrollToHeading(h.id)}
                className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-secondary transition-colors truncate text-muted-foreground hover:text-foreground"
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
              >
                {h.text}
              </button>
            ))}
          </nav>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Nema naslova — dodajte H1/H2 u tekstu da biste vidjeli sadržaj ovdje.
          </p>
        )}
      </div>
    </div>
  );
});
