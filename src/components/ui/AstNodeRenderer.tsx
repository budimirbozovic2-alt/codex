import { memo, useMemo, Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EditorDoc, JSONContent } from "@/lib/editor-v4";
import { logger } from "@/lib/logger";

/**
 * Pure React walker over the V4 AST (PR-7d M2.1).
 *
 * Replaces per-row TipTap `EditorView` instances in virtualised / read-only
 * surfaces (CardViewTable, StudyModeRecall, SourceSnippetDialog, Smart-Split
 * CuttingView, EditorSection preview, …). No ProseMirror, no DOM mutations,
 * no DOMPurify — the AST is whitelisted by the editor schema upstream.
 *
 * For rich, interactive contexts (Zettelkasten article body where wiki-link
 * clicks must work) keep the full `<EditorView>` instead.
 */

interface Props {
  doc: EditorDoc | null | undefined;
  className?: string;
  /** Optional handlers for atomic nodes. */
  onWikiLinkClick?: (target: string) => void;
  onMindmapClick?: (mindmapId: string) => void;
}

type Mark = NonNullable<JSONContent["marks"]>[number];

function applyMarks(text: ReactNode, marks: Mark[] | undefined, keyBase: string): ReactNode {
  if (!marks?.length) return text;
  let node = text;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    const key = `${keyBase}:m${i}`;
    switch (m.type) {
      case "bold":
        node = <strong key={key}>{node}</strong>;
        break;
      case "italic":
        node = <em key={key}>{node}</em>;
        break;
      case "underline":
        node = <u key={key}>{node}</u>;
        break;
      case "strike":
        node = <s key={key}>{node}</s>;
        break;
      case "code":
        node = <code key={key}>{node}</code>;
        break;
      case "highlight":
        node = <mark key={key}>{node}</mark>;
        break;
      case "keyPart":
        node = <mark key={key} className="key-part-highlight">{node}</mark>;
        break;
      case "link": {
        const href = (m.attrs?.href as string | undefined) ?? "#";
        node = (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            {node}
          </a>
        );
        break;
      }
      default:
        // Unknown mark — pass through.
        break;
    }
  }
  return node;
}

interface RenderCtx {
  onWikiLinkClick?: (target: string) => void;
  onMindmapClick?: (mindmapId: string) => void;
}

function renderChildren(
  nodes: JSONContent[] | undefined,
  keyBase: string,
  ctx: RenderCtx,
): ReactNode[] {
  if (!nodes?.length) return [];
  return nodes.map((n, i) => renderNode(n, `${keyBase}:${i}`, ctx));
}

function renderNode(node: JSONContent, key: string, ctx: RenderCtx): ReactNode {
  const t = node.type;
  switch (t) {
    case "text": {
      const text = node.text ?? "";
      return <Fragment key={key}>{applyMarks(text, node.marks, key)}</Fragment>;
    }
    case "paragraph":
      return <p key={key}>{renderChildren(node.content, key, ctx)}</p>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{renderChildren(node.content, key, ctx)}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node.content, key, ctx)}</ul>;
    case "orderedList": {
      const start = node.attrs?.start as number | undefined;
      return <ol key={key} start={start}>{renderChildren(node.content, key, ctx)}</ol>;
    }
    case "listItem":
      return <li key={key}>{renderChildren(node.content, key, ctx)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node.content, key, ctx)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{renderChildren(node.content, key, ctx)}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "wikiLink": {
      const target = String(node.attrs?.target ?? "");
      const display = String(node.attrs?.display ?? target);
      const handler = ctx.onWikiLinkClick;
      return (
        <a
          key={key}
          data-wikilink={target}
          data-display={display}
          className="wiki-link"
          onClick={handler ? (e) => { e.preventDefault(); handler(target); } : undefined}
          href={handler ? "#" : undefined}
          role={handler ? "button" : undefined}
        >
          {display}
        </a>
      );
    }
    case "mindmapEmbed": {
      const mindmapId = String(node.attrs?.mindmapId ?? "");
      const handler = ctx.onMindmapClick;
      return (
        <div
          key={key}
          data-mindmap={mindmapId}
          className="mindmap-embed not-prose my-4 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          onClick={handler ? () => handler(mindmapId) : undefined}
          role={handler ? "button" : undefined}
        >
          Mapa uma (id: <code className="font-mono">{mindmapId || "?"}</code>)
        </div>
      );
    }
    default: {
      if (import.meta.env.DEV) {
        logger.warn("[AstNodeRenderer] unknown node type", t);
      }
      // Graceful fallback: render children if any, else null.
      return node.content ? <Fragment key={key}>{renderChildren(node.content, key, ctx)}</Fragment> : null;
    }
  }
}

function AstNodeRendererImpl({ doc, className, onWikiLinkClick, onMindmapClick }: Props) {
  const children = useMemo(() => {
    if (!doc || doc.version !== 4 || !doc.content) return null;
    const root = doc.content;
    const ctx: RenderCtx = { onWikiLinkClick, onMindmapClick };
    if (root.type === "doc") return renderChildren(root.content, "n", ctx);
    return renderNode(root, "n", ctx);
  }, [doc, onWikiLinkClick, onMindmapClick]);

  return <div className={cn(className)}>{children}</div>;
}

export const AstNodeRenderer = memo(AstNodeRendererImpl);
