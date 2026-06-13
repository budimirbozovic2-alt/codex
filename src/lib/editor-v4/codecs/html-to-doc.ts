import { generateJSON, type JSONContent } from "@tiptap/core";
import DOMPurify from "dompurify";
import { editorV4Extensions } from "../schema";
import { preprocessHtml } from "../patterns";
import type { EditorDoc } from "../types";

/**
 * Convert sanitized HTML (from the legacy `content` column, backups, or
 * clipboard) into an `EditorDoc`.
 *
 * Pipeline:
 *   1. DOMPurify — defense-in-depth; input may come from backup files.
 *      We extend the allowlist with our two data-attributes so the
 *      preprocessor's emitted markup survives.
 *   2. preprocessHtml — `[[wiki]]` / `::mindmap[id]` → typed data-attribute
 *      HTML, skipping `<code>`/`<pre>`.
 *   3. generateJSON — ProseMirror DOMParser over the schema, returning a
 *      JSONContent tree.
 */
export function htmlToDoc(html: string | null | undefined): EditorDoc {
  if (!html) return { version: 4, content: { type: "doc", content: [{ type: "paragraph" }] } };
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-wikilink", "data-display", "data-mindmap"],
  });
  const preprocessed = preprocessHtml(clean);
  const content = generateJSON(preprocessed, editorV4Extensions) as JSONContent;
  return { version: 4, content };
}
