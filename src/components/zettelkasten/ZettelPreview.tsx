import { useMemo, Fragment } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { FileText } from "lucide-react";
import EmbeddedMindMap from "./EmbeddedMindMap";

interface Props {
  markdown: string;
  /** Called when user clicks a [[Wiki Link]]. Argument is the raw title inside brackets. */
  onWikiLink: (title: string) => void;
  /** Set of normalized (lowercase, trimmed) titles that already exist — used for styling. */
  existingTitles: Set<string>;
  /** Subset of existingTitles whose article body is empty (draft placeholders). */
  emptyTitles?: Set<string>;
  /** Linked sources rendered as a footer block. */
  linkedSources?: { id: string; title: string }[];
  /** Optional click handler when user activates a linked source chip. */
  onSourceClick?: (sourceId: string) => void;
  /** Required to render embedded mind-map references. */
  categoryId: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(md: string, existingTitles: Set<string>, emptyTitles: Set<string>): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };

  const inline = (raw: string): string => {
    let s = escapeHtml(raw);
    s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, t: string) => {
      const title = t.trim();
      const low = title.toLowerCase();
      const exists = existingTitles.has(low);
      const empty = exists && emptyTitles.has(low);
      let cls: string;
      if (!exists) {
        cls = "zettel-wikilink text-amber-600 dark:text-amber-400 underline decoration-dotted underline-offset-2 hover:bg-amber-500/10 px-0.5 rounded cursor-pointer";
      } else if (empty) {
        cls = "zettel-wikilink text-muted-foreground italic underline decoration-dashed decoration-muted-foreground/60 underline-offset-2 hover:bg-muted px-0.5 rounded cursor-pointer";
      } else {
        cls = "zettel-wikilink text-primary underline decoration-solid underline-offset-2 hover:bg-primary/10 px-0.5 rounded cursor-pointer";
      }
      // Use <a> + id (allowed by global sanitizer) instead of <button> + data-* (stripped).
      // Title is base64-encoded (UTF-8 safe) into the id so it survives sanitization.
      const encoded = `wl-${btoa(unescape(encodeURIComponent(title))).replace(/=+$/, "")}`;
      return `<a id="${encoded}" class="${cls}">${escapeHtml(title)}</a>`;
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

interface Segment {
  kind: "markdown" | "mindmap";
  /** For markdown segments, raw markdown text. For mindmap segments, the mind-map id. */
  payload: string;
}

const MINDMAP_RE = /^::mindmap\[([A-Za-z0-9_-]+)\]\s*$/;

function splitSegments(md: string): Segment[] {
  const lines = md.split(/\r?\n/);
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n").replace(/^\n+|\n+$/g, "");
    if (text.length > 0) segments.push({ kind: "markdown", payload: text });
    buffer = [];
  };

  for (const line of lines) {
    const m = line.match(MINDMAP_RE);
    if (m) {
      flushBuffer();
      segments.push({ kind: "mindmap", payload: m[1] });
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();
  return segments;
}

export default function ZettelPreview({
  markdown,
  onWikiLink,
  existingTitles,
  emptyTitles,
  linkedSources,
  onSourceClick,
  categoryId,
}: Props) {
  const segments = useMemo(() => splitSegments(markdown), [markdown]);
  const emptySet = emptyTitles ?? new Set<string>();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const btn = t.closest("button[data-wiki]") as HTMLButtonElement | null;
    if (btn) {
      e.preventDefault();
      const title = btn.getAttribute("data-wiki") ?? "";
      if (title) onWikiLink(title);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-md overflow-hidden">
      <div
        className="prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto flex-1 text-foreground"
        onClick={handleClick}
      >
        {segments.length === 0 && (
          <p className="text-muted-foreground italic">Nema sadržaja. Pređi u režim uređivanja da napišeš bilješku.</p>
        )}
        {segments.map((seg, i) => {
          if (seg.kind === "mindmap") {
            return (
              <EmbeddedMindMap key={`mm-${i}-${seg.payload}`} mindMapId={seg.payload} categoryId={categoryId} />
            );
          }
          const html = sanitizeHtml(renderMarkdown(seg.payload, existingTitles, emptySet));
          return (
            <Fragment key={`md-${i}`}>
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </Fragment>
          );
        })}
      </div>
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
