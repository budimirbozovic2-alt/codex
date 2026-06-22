import type { Editor } from "@/lib/editor-v4";
import { docToHtml, type EditorDoc } from "@/lib/editor-v4";

export interface SelectionPayload {
  text: string;
  html: string;
  contentDoc: EditorDoc;
}

const MIN_SELECTION_CHARS = 5;

/**
 * Resolve the current TipTap selection into plain text, sanitized HTML, and
 * a V4 AST fragment (lossless for lists, paragraphs, legal-provision, etc.).
 */
export function getEditorSelectionPayload(editor: Editor): SelectionPayload | null {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty || to - from < 1) return null;

  const text = state.doc.textBetween(from, to, "\n", " ").trim();
  if (text.length < MIN_SELECTION_CHARS) return null;

  const slice = state.doc.slice(from, to);
  const contentDoc: EditorDoc = {
    version: 4,
    content: {
      type: "doc",
      content: slice.content.toJSON() as EditorDoc["content"]["content"],
    },
  };
  const html = docToHtml(contentDoc);
  return { text, html, contentDoc };
}
