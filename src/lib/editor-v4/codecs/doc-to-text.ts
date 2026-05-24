import type { JSONContent } from "@tiptap/core";
import type { EditorDoc } from "../types";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "mindmapEmbed",
]);

/**
 * Flatten an `EditorDoc` to plain text for search indexing and previews.
 *
 * Rules:
 *   - text nodes contribute their `text`
 *   - `wikiLink` contributes its `display`
 *   - `mindmapEmbed` contributes nothing (no human-readable text)
 *   - block boundaries become `\n\n`; whitespace is collapsed at the end
 */
export function docToPlainText(doc: EditorDoc): string {
  const raw = walk(doc.content);
  return raw.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

function walk(node: JSONContent | undefined): string {
  if (!node) return "";
  const type = node.type ?? "";
  if (type === "text") return node.text ?? "";
  if (type === "wikiLink") {
    const display = node.attrs?.display ?? node.attrs?.target ?? "";
    return String(display);
  }
  if (type === "mindmapEmbed") return "";
  if (type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(walk).join("");
  return BLOCK_TYPES.has(type) ? inner + "\n\n" : inner;
}
