import type { JSONContent } from "@tiptap/core";
import type { EditorDoc } from "../types";

/**
 * Serialize an `EditorDoc` back to a markdown-ish string.
 *
 * Lossy: only round-trips the constructs the legacy Zettelkasten markdown
 * renderer (`ZettelPreview`) understood — paragraphs, headings 1-3, lists,
 * blockquotes, code blocks, bold/italic/code marks, links, wiki-links and
 * `::mindmap[id]` embeds. Highlight and keyPart marks render as plain text.
 *
 * Purpose: keep `KnowledgeBaseArticle.content` (markdown SSOT for legacy
 * search / wiki-link auto-create / backlink-index scans) populated even
 * after PR-6 switches the editor write-path to AST. Once those consumers
 * also move to AST (post FTS/SQLite migration), this derivative can go.
 */
export function docToMarkdown(doc: EditorDoc): string {
  const root = doc.content;
  const blocks = (root?.content ?? []).map(renderBlock).filter((s) => s.length > 0);
  // Strip trailing whitespace per line so dirty-checks don't trip on cosmetic newlines.
  return blocks.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

function renderBlock(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return renderInline(node.content);
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${"#".repeat(level)} ${renderInline(node.content)}`;
    }
    case "blockquote":
      return (node.content ?? [])
        .map((c) => renderBlock(c))
        .filter(Boolean)
        .join("\n\n")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "codeBlock": {
      const inner = (node.content ?? []).map((c) => c.text ?? "").join("");
      return "```\n" + inner + "\n```";
    }
    case "bulletList":
      return (node.content ?? [])
        .map((li) => `- ${renderInline(extractListItemContent(li))}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ${renderInline(extractListItemContent(li))}`)
        .join("\n");
    case "horizontalRule":
      return "---";
    case "mindmapEmbed":
      return `::mindmap[${String(node.attrs?.mindmapId ?? "")}]`;
    default:
      return renderInline(node.content);
  }
}

/** A listItem's content is usually a single paragraph; flatten to inline text. */
function extractListItemContent(li: JSONContent): JSONContent[] | undefined {
  const first = li.content?.[0];
  if (first && (first.type === "paragraph" || first.type === "heading")) return first.content;
  return li.content;
}

function renderInline(content: JSONContent[] | undefined): string {
  if (!content) return "";
  return content.map(renderInlineNode).join("");
}

function renderInlineNode(node: JSONContent): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "mindmapEmbed") {
    return `::mindmap[${String(node.attrs?.mindmapId ?? "")}]`;
  }
  if (node.type === "wikiLink") {
    const target = String(node.attrs?.target ?? "");
    const display = String(node.attrs?.display ?? target);
    const hasPipe = Boolean(node.attrs?.hasPipe) && display !== target;
    return hasPipe ? `[[${target}|${display}]]` : `[[${target}]]`;
  }
  if (node.type === "text") {
    return applyMarks(node.text ?? "", node.marks);
  }
  // Unknown inline — fall back to its inner text.
  return renderInline(node.content);
}

function applyMarks(text: string, marks: JSONContent["marks"]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  // Order: link last so it wraps the formatted text.
  for (const m of marks) {
    if (m.type === "code") out = `\`${out}\``;
    else if (m.type === "bold") out = `**${out}**`;
    else if (m.type === "italic") out = `*${out}*`;
  }
  for (const m of marks) {
    if (m.type === "link" && typeof m.attrs?.href === "string") {
      out = `[${out}](${m.attrs.href})`;
    }
  }
  return out;
}
