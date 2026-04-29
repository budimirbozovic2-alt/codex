import { useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { FileText } from "lucide-react";

interface Props {
  markdown: string;
  /** Called when user clicks a [[Wiki Link]]. Argument is the raw title inside brackets. */
  onWikiLink: (title: string) => void;
  /** Set of normalized (lowercase, trimmed) titles that already exist — used for styling. */
  existingTitles: Set<string>;
  /** Linked sources rendered as a footer block. */
  linkedSources?: { id: string; title: string }[];
  /** Optional click handler when user activates a linked source chip. */
  onSourceClick?: (sourceId: string) => void;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Lightweight markdown renderer (no external deps) supporting:
 * `**bold**`, `*italic*`, `\`code\``, `## H2`, `### H3`, `- list`, blank lines, and `[[Wiki Links]]`.
 * Wiki-links are rendered as `<button data-wiki="title">` so we can attach a single delegated handler.
 */
function renderMarkdown(md: string, existingTitles: Set<string>): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };

  const inline = (raw: string): string => {
    let s = escapeHtml(raw);
    // wiki-links FIRST (before other inline replacements that could touch brackets)
    s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, t: string) => {
      const title = t.trim();
      const exists = existingTitles.has(title.toLowerCase());
      const cls = exists
        ? "text-primary underline decoration-dotted underline-offset-2 hover:bg-primary/10 px-0.5 rounded"
        : "text-amber-600 dark:text-amber-400 underline decoration-dotted underline-offset-2 hover:bg-amber-500/10 px-0.5 rounded";
      return `<button type="button" data-wiki="${escapeHtml(title)}" class="${cls}">${escapeHtml(title)}</button>`;
    });
    s = s.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-[0.9em]">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return s;
  };

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      closeList();
      out.push("");
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h3 class="text-base font-semibold mt-4 mb-2">${inline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h2 class="text-lg font-semibold mt-5 mb-2">${inline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeList();
      out.push(`<h1 class="text-xl font-bold mt-6 mb-3">${inline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      if (!inList) { out.push('<ul class="list-disc pl-5 my-2 space-y-1">'); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*-\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="my-2 leading-relaxed">${inline(line)}</p>`);
  }
  closeList();
  return out.filter(Boolean).join("\n");
}

export default function ZettelPreview({ markdown, onWikiLink, existingTitles, linkedSources, onSourceClick }: Props) {
  const html = useMemo(() => sanitizeHtml(renderMarkdown(markdown, existingTitles)), [markdown, existingTitles]);

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-md overflow-hidden">
      <div
        className="prose prose-sm max-w-none p-4 overflow-y-auto flex-1 text-foreground"
        onClick={(e) => {
          const t = e.target as HTMLElement;
          const btn = t.closest("button[data-wiki]") as HTMLButtonElement | null;
          if (btn) {
            e.preventDefault();
            const title = btn.getAttribute("data-wiki") ?? "";
            if (title) onWikiLink(title);
          }
        }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground italic">Nema sadržaja. Počnite kucati u editoru lijevo.</p>' }}
      />
      {linkedSources && linkedSources.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            <FileText className="h-3 w-3" /> Izvori
          </div>
          <div className="flex flex-wrap gap-1.5">
            {linkedSources.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSourceClick?.(s.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-background hover:bg-accent/50 text-[11px] transition-colors"
              >
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[200px]">{s.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
