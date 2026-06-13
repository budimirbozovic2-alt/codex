import { Editor } from "@tiptap/core";
import { editorV4Extensions, htmlToDoc } from "@/lib/editor-v4";

/** Minimal TipTap editor for source-reader unit tests (selection + payload). */
export function createSourceTestEditor(
  paragraph = "Selektovani tekst u izvoru je dovoljno dug.",
  opts?: { selectAll?: boolean },
): Editor {
  const doc = htmlToDoc(`<p>${paragraph}</p>`);
  const editor = new Editor({
    extensions: editorV4Extensions,
    content: doc.content,
  });
  if (opts?.selectAll !== false) {
    const len = paragraph.length;
    editor.commands.setTextSelection({ from: 1, to: 1 + len });
  }
  return editor;
}
