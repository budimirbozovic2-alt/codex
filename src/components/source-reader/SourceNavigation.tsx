import { memo } from "react";
import type { Source } from "@/lib/sources-storage";

/**
 * Props for the SourceNavigation component.
 */
interface Props {
  /** The source being navigated */
  source: Source;
  /** Callback for when a heading is clicked to scroll to it */
  onScrollToHeading: (id: string) => void;
}

/**
 * Component that renders the source's outline in a sticky sidebar.
 */
export const SourceNavigation = memo(function SourceNavigation({ source, onScrollToHeading }: Props) {
  if (!source.outline || source.outline.length === 0) return null;

  return (
    <div className="w-56 flex-shrink-0 sticky top-20 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="rounded-lg border bg-card p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sadržaj</h4>
        <nav className="space-y-0.5">
          {source.outline.map(h => (
            <button key={h.id} onClick={() => onScrollToHeading(h.id)}
              className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-secondary transition-colors truncate text-muted-foreground hover:text-foreground"
              style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
            >
              {h.text}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
});
