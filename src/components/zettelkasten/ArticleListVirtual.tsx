import { useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";

interface RootSubLite {
  id: string;
  name: string;
}

interface Props {
  articles: KnowledgeBaseArticle[];
  rootSubs: RootSubLite[];
  onOpen: (id: string) => void;
}

// Each row renders a single article entry: title row + optional 2-line preview.
// `line-clamp-2` caps preview to 2 lines (~16px each). Title row is ~22px.
// Padding (12px top + 12px bottom) + border = ~24px chrome. 8px gap.
const ROW_HEIGHT = 84;
const GAP = 8;
const VIRTUALIZATION_THRESHOLD = 50;

interface RowData {
  articles: KnowledgeBaseArticle[];
  rootSubs: RootSubLite[];
  onOpen: (id: string) => void;
}

function ArticleRow(props: RowComponentProps<RowData>) {
  const { index, style, articles, rootSubs, onOpen } = props;
  const a = articles[index];
  if (!a) return null;
  const sub = rootSubs.find(s => s.id === a.rootSubcategoryId);
  const preview = a.content.replace(/[#*`[\]]/g, "").trim().slice(0, 140);
  const isDraft = a.content.trim().length === 0;

  return (
    <div style={{ ...style, paddingBottom: GAP }}>
      <button
        type="button"
        onClick={() => onOpen(a.id)}
        className="w-full h-full text-left p-3 rounded-md border border-border hover:bg-accent/50 transition-colors flex flex-col justify-center"
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className={`font-semibold text-sm truncate ${
            isDraft ? "text-muted-foreground italic" : "text-foreground"
          }`}>
            {a.title}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isDraft && (
              <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded">
                Draft
              </span>
            )}
            {sub && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {sub.name}
              </span>
            )}
          </div>
        </div>
        {preview && (
          <div className="text-xs text-muted-foreground line-clamp-2">{preview}</div>
        )}
      </button>
    </div>
  );
}

export default function ArticleListVirtual({ articles, rootSubs, onOpen }: Props) {
  const useVirtualization = articles.length >= VIRTUALIZATION_THRESHOLD;

  const rowProps = useMemo<RowData>(
    () => ({ articles, rootSubs, onOpen }),
    [articles, rootSubs, onOpen],
  );

  // Small lists: render plain grid (preserves natural document flow + variable row height).
  if (!useVirtualization) {
    return (
      <div className="grid gap-2">
        {articles.map(a => {
          const sub = rootSubs.find(s => s.id === a.rootSubcategoryId);
          const preview = a.content.replace(/[#*`[\]]/g, "").trim().slice(0, 140);
          const isDraft = a.content.trim().length === 0;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpen(a.id)}
              className="text-left p-3 rounded-md border border-border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className={`font-semibold text-sm truncate ${
                  isDraft ? "text-muted-foreground italic" : "text-foreground"
                }`}>
                  {a.title}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isDraft && (
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded">
                      Draft
                    </span>
                  )}
                  {sub && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {sub.name}
                    </span>
                  )}
                </div>
              </div>
              {preview && (
                <div className="text-xs text-muted-foreground line-clamp-2">{preview}</div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Large lists: react-window. Cap container height at 700px so the list
  // gets its own inner scroll and outer scroll doesn't fight it.
  const totalHeight = Math.min(articles.length * (ROW_HEIGHT + GAP), 700);

  return (
    <List
      defaultHeight={totalHeight}
      rowCount={articles.length}
      rowHeight={ROW_HEIGHT + GAP}
      overscanCount={6}
      rowComponent={ArticleRow}
      rowProps={rowProps}
      style={{ height: totalHeight }}
    />
  );
}
