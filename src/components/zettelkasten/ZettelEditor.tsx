/**
 * Thin wrapper around `<EditorV4 />` that preserves the legacy `ZettelEditor`
 * surface used by `ZettelkastenView` and `useArticleDraft`.
 *
 * PR-6 swaps the long-lived textarea + custom toolbar implementation for the
 * shared TipTap editor so wiki-link / mindmap paste rules, key-part marks and
 * undo/redo flow through the same engine the rest of the app uses. The
 * `ZettelEditorHandle` contract is preserved (insertText / insertBlock /
 * focus) so call-sites — including the markdown-string-aware mindmap picker
 * — keep working without changes.
 *
 * Inputs (mutually exclusive, prefer doc):
 *  - `valueDoc` + `onChangeDoc`: canonical V4 AST path (PR-6 forward).
 *  - `value` + `onChange`: legacy markdown path; converted on mount via
 *    `htmlToDoc(mdToHtml(value))` and emitted back via `docToMarkdown`.
 *
 * The wrapper itself does NOT persist — `useArticleDraft` owns flush/dirty.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { EditorV4, type EditorV4Handle } from "@/components/editor-v4/EditorV4";
import { htmlToDoc, docToMarkdown, type EditorDoc } from "@/lib/editor-v4";
import { mdToHtml } from "@/lib/editor-v4/migrate";

export interface ZettelEditorHandle {
  insertText: (text: string) => void;
  insertBlock: (text: string) => void;
  /** PR-6: prefer over `insertBlock("::mindmap[id]")`. */
  insertMindmap: (mindmapId: string) => void;
  focus: () => void;
}

interface Props {
  /** Legacy markdown — kept for backward compatibility while migration is in flight. */
  value?: string;
  /** Canonical V4 AST — PR-6+ callers should always pass this. */
  valueDoc?: EditorDoc;
  /** Fires with derived markdown (lossy). Kept for legacy parents. */
  onChange?: (nextMarkdown: string) => void;
  /** Fires with the canonical V4 AST. Preferred. */
  onChangeDoc?: (doc: EditorDoc) => void;
  placeholder?: string;
  onInsertMindMap?: () => void;
  categoryId?: string;
}

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

const ZettelEditor = forwardRef<ZettelEditorHandle, Props>(function ZettelEditor(
  { value, valueDoc, onChange, onChangeDoc, placeholder, onInsertMindMap, categoryId },
  ref,
) {
  // Editor seed is captured on mount only — parent must force-remount with
  // `key={articleId}` when switching articles (ZettelkastenView already does
  // so via the `activeArticle` branch + `enterEdit` lifecycle).
  const initialDoc = useMemo<EditorDoc>(() => {
    if (valueDoc && valueDoc.version === 4) return valueDoc;
    const md = value ?? "";
    if (!md.trim()) return EMPTY_DOC;
    return htmlToDoc(mdToHtml(md));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const innerRef = useRef<EditorV4Handle | null>(null);

  useImperativeHandle(ref, (): ZettelEditorHandle => ({
    insertText: (text) => innerRef.current?.insertText(text),
    insertBlock: (text) => {
      // Back-compat: callers historically passed `::mindmap[id]` blocks here.
      const m = text.match(/^::mindmap\[([A-Za-z0-9_-]+)\]\s*$/);
      if (m) {
        innerRef.current?.insertMindmap(m[1]);
        return;
      }
      innerRef.current?.insertBlock(text);
    },
    insertMindmap: (id) => innerRef.current?.insertMindmap(id),
    focus: () => innerRef.current?.focus(),
  }), []);

  return (
    <div className="flex flex-col h-full">
      <EditorV4
        ref={innerRef}
        initialDoc={initialDoc}
        placeholder={placeholder ?? "Napišite svoju bilješku...\n\nKoristite [[Naslov članka]] za povezivanje, ::mindmap[id] za mapu uma."}
        categoryId={categoryId}
        embedKind="article"
        onPickMindmap={onInsertMindMap}
        onChange={(doc) => {
          onChangeDoc?.(doc);
          // Keep legacy markdown consumers (wiki-link auto-create, backlink
          // index scans, full-text search) populated until they migrate.
          if (onChange) onChange(docToMarkdown(doc));
        }}
        className="flex-1 min-h-[300px]"
      />
    </div>
  );
});

export default ZettelEditor;
