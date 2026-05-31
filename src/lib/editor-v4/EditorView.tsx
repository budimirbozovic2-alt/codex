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
 */
export function EditorView({ doc, className }: Props) {
  const serialized = useMemo(() => JSON.stringify(doc.content), [doc]);
  const lastSerialized = useRef<string | null>(null);

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

  useEffect(() => {
    if (!editor) return;
    // Initial mount: editor.create already used `doc.content`, so record the
    // snapshot and skip the redundant setContent.
    if (lastSerialized.current === null) {
      lastSerialized.current = serialized;
      return;
    }
    if (lastSerialized.current === serialized) return;
    lastSerialized.current = serialized;
    editor.commands.setContent(doc.content, { emitUpdate: false });
  }, [serialized, doc, editor]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
