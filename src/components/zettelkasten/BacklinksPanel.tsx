import { useMemo } from "react";
import { ArrowLeftRight, FileText } from "lucide-react";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";

interface Props {
  articles: KnowledgeBaseArticle[];
  activeArticle: KnowledgeBaseArticle;
  onOpen: (id: string) => void;
}

const WIKI_RE = /\[\[([^\]]+)\]\]/g;

/** Returns articles that contain a [[link]] pointing to `targetTitle`. */
function findBacklinks(
  articles: KnowledgeBaseArticle[],
  targetId: string,
  targetTitle: string,
): { article: KnowledgeBaseArticle; snippet: string }[] {
  const norm = targetTitle.trim().toLowerCase();
  const out: { article: KnowledgeBaseArticle; snippet: string }[] = [];
  for (const a of articles) {
    if (a.id === targetId) continue;
    let match: RegExpExecArray | null;
    WIKI_RE.lastIndex = 0;
    while ((match = WIKI_RE.exec(a.content)) !== null) {
      if (match[1].trim().toLowerCase() === norm) {
        const idx = match.index;
        const start = Math.max(0, idx - 40);
        const end = Math.min(a.content.length, idx + match[0].length + 40);
        const raw = a.content.slice(start, end).replace(/\s+/g, " ").trim();
        out.push({ article: a, snippet: (start > 0 ? "…" : "") + raw + (end < a.content.length ? "…" : "") });
        break;
      }
    }
  }
  return out;
}

export default function BacklinksPanel({ articles, activeArticle, onOpen }: Props) {
  const backlinks = useMemo(
    () => findBacklinks(articles, activeArticle.id, activeArticle.title),
    [articles, activeArticle.id, activeArticle.title],
  );

  return (
    <div className="rounded-md border border-border bg-card/60">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Backlinks
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted">
          {backlinks.length}
        </span>
      </div>
      {backlinks.length === 0 ? (
        <p className="px-3 py-3 text-xs italic text-muted-foreground">
          Nijedan članak ne upućuje na ovaj. Dodaj <code className="text-[10px]">[[{activeArticle.title}]]</code> u drugi članak.
        </p>
      ) : (
        <ul className="divide-y divide-border max-h-48 overflow-y-auto">
          {backlinks.map(({ article, snippet }) => (
            <li key={article.id}>
              <button
                type="button"
                onClick={() => onOpen(article.id)}
                className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{article.title}</span>
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
