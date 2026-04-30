import { ArrowLeftRight, FileText, Pause } from "lucide-react";
import { useBacklinks } from "@/lib/backlink-index";

interface Props {
  subjectId: string;
  activeArticleId: string;
  activeTitle: string;
  onOpen: (id: string) => void;
  /** When true, BacklinksPanel freezes its last computed result and skips
   *  re-scanning the article corpus. Re-enabled when the user exits edit mode. */
  isEditing?: boolean;
}

/**
 * Backlinks display.
 *
 * Heavy lifting is delegated to the global `backlinkIndex` (O(1) lookup, kept
 * fresh by event-bus events from save/delete). This component is now pure
 * presentation: it subscribes to one slot via `useSyncExternalStore` and
 * renders. No regex scans here, ever.
 */
export default function BacklinksPanel({ subjectId, activeArticleId, activeTitle, onOpen, isEditing = false }: Props) {
  const backlinks = useBacklinks(subjectId, activeTitle, activeArticleId, isEditing);

  return (
    <div className="rounded-md border border-border bg-card/60">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Backlinks
        {isEditing && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-warning"
            title="Backlinks su pauzirani tokom uređivanja radi performansi. Osvježiće se nakon izlaska iz režima uređivanja."
          >
            <Pause className="h-3 w-3" />
            pauzirano
          </span>
        )}
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted">
          {backlinks.length}
        </span>
      </div>
      {backlinks.length === 0 ? (
        <p className="px-3 py-3 text-xs italic text-muted-foreground">
          Nijedan članak ne upućuje na ovaj. Dodaj <code className="text-[10px]">[[{activeTitle}]]</code> u drugi članak.
        </p>
      ) : (
        <ul className="divide-y divide-border max-h-48 overflow-y-auto">
          {backlinks.map(({ articleId, title, snippet }) => (
            <li key={articleId}>
              <button
                type="button"
                onClick={() => onOpen(articleId)}
                className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
