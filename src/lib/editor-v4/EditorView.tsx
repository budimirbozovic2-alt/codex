import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
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
 */
export function EditorView({ doc, className }: Props) {
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
    editor.commands.setContent(doc.content, { emitUpdate: false });
  }, [doc, editor]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
