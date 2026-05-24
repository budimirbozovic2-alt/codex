import { generateHTML, type JSONContent } from "@tiptap/core";
import { editorV4Extensions } from "../schema";
import type { EditorDoc } from "../types";

/**
 * Serialize an `EditorDoc` back to HTML.
 *
 * Intended for the read-only fallback (`<SafeHtml>` in PR-4) and for export
 * paths (PDF / clipboard). Callers that render the result into the live DOM
 * must still pass it through `sanitizeHtml` — the data-attributes emitted
 * by our custom nodes need the extended allowlist (added in PR-4).
 */
export function docToHtml(doc: EditorDoc): string {
  return generateHTML(doc.content as JSONContent, editorV4Extensions);
}
