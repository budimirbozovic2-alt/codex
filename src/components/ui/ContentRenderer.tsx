import { useMemo } from "react";
import { EditorView } from "@/lib/editor-v4/EditorView";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";

interface Props {
  /**
   * Canonical V4 AST. When present and `version === 4`, rendered through
   * `<EditorView>` (TipTap read-only).
   */
  doc?: EditorDoc | null;
  /**
   * Legacy HTML fallback for callers that haven't fully migrated. Internally
   * converted via `htmlToDoc` and rendered through the same `<EditorView>`
   * path so there is exactly ONE render surface.
   *
   * After PR-7c the AST is SSOT — this prop is a safety net for the few
   * remaining call-sites that still flow legacy HTML; key-part highlights
   * are stored as `keyPart` marks inside the AST, so the legacy `highlight`
   * directive is gone.
   */
  html?: string;
  className?: string;
}

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

function isV4Doc(d: EditorDoc | null | undefined): d is EditorDoc {
  return !!d && d.version === 4 && !!d.content;
}

/**
 * Read-path adapter — PR-7c collapsed to a single AST surface.
 *
 * Either a `doc` (preferred) or an `html` fallback is provided; both flow
 * through `<EditorView>` so the rendered DOM is the canonical ProseMirror
 * output. No `<SafeHtml>`, no DOMPurify on read — TipTap's schema is a
 * whitelist and `htmlToDoc` discards unknown nodes.
 */
export function ContentRenderer({ doc, html, className }: Props) {
  const effectiveDoc = useMemo<EditorDoc>(() => {
    if (isV4Doc(doc)) return doc;
    const raw = html ?? "";
    if (!raw.trim()) return EMPTY_DOC;
    return htmlToDoc(raw);
  }, [doc, html]);

  return <EditorView doc={effectiveDoc} className={className} />;
}
