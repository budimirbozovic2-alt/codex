import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { editorV4Extensions } from "./schema";
import type { EditorDoc } from "./types";

interface Props {
  doc: EditorDoc;
  className?: string;
}

/**
 * Read-only TipTap editor used as the V4 AST render path.
 *
 * Reads the canonical EditorDoc and renders through the same schema as the
 * (future) writer, so wiki-link / mindmap / key-part nodes round-trip
 * losslessly. No `dangerouslySetInnerHTML`, no DOMPurify needed.
 *
 * Prose tokens (`.prose`) and card spacing (`.card-prose`) are mirrored on
 * `.ProseMirror` via index.css, so visual output matches the legacy SafeHtml
 * branch (Styling Prose Fixes v3 invariant).
 *
 * D.5 guard: parent re-renders that hand us a fresh `doc` object reference
 * but identical content used to trigger a full `setContent` (ProseMirror
 * resets selection + transaction state). We now compare a JSON-serialized
 * snapshot of `doc.content` and only call `setContent` when it actually
 * changes. The serialized string is also useful as a stable dep key.
 *
 * PR-C fixes:
 *   • C2 — capture `editor` in a ref so the empty-deps cleanup actually
 *     destroys the TipTap instance on unmount (previously the cleanup
 *     closed over `editor=null` from the first render → ProseMirror leak).
 *   • C3 — dep on `doc.content` instead of `doc` so a parent passing a new
 *     wrapper object with identical content doesn't re-serialize the AST.
 *   • C4 — read `doc` via ref inside the sync effect; deps stay limited to
 *     `serialized` + `editor`, eliminating the teardown-on-every-render churn.
 */
export function EditorView({ doc, className }: Props) {
  const serialized = useMemo(() => JSON.stringify(doc.content), [doc.content]);
  const lastSerialized = useRef<string | null>(null);
  const docRef = useRef<EditorDoc>(doc);
  docRef.current = doc;

  const editor = useEditor({
    extensions: editorV4Extensions,
    content: doc.content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(className),
      },
    },
  });

  // Keep the latest `editor` reachable from the unmount cleanup below.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    if (lastSerialized.current === serialized) return;
    lastSerialized.current = serialized;
    editor.commands.setContent(docRef.current.content, { emitUpdate: false });
  }, [serialized, editor]);

  useEffect(() => {
    return () => {
      editorRef.current?.destroy();
    };
  }, []);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
