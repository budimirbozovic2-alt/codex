import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { useState } from "react";

/**
 * PR-1 isolated TipTap playground (V4 Editor Epic).
 *
 * Dev-only route /__lab/editor. No persistence, no integration with cards
 * or sources — purely for evaluating UX, paste behavior, and prose styling
 * before any production surface is migrated off contentEditable + DOMPurify.
 *
 * Do not import this from production code paths.
 */
export default function LabEditor() {
  const [showJson, setShowJson] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "underline text-primary" },
      }),
      Placeholder.configure({
        placeholder: "Piši ovdje... (Markdown shortcuts rade: **bold**, *italic*, # heading, - lista)",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none min-h-[400px] px-6 py-4",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="container max-w-4xl mx-auto py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Editor V4 — Lab</h1>
        <p className="text-sm text-muted-foreground">
          Izolovan TipTap playground. Bez perzistencije, bez integracije.
          Cilj: testiranje UX-a prije produkcijske migracije.
        </p>
      </div>

      <Toolbar editor={editor} />

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <EditorContent editor={editor} />
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="rounded-md border px-3 py-1 hover:bg-accent"
        >
          {showJson ? "Sakrij" : "Prikaži"} AST (JSON)
        </button>
        <span className="text-muted-foreground">
          characters: {editor.storage.characterCount?.characters?.() ?? editor.getText().length}
        </span>
      </div>

      {showJson && (
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(editor.getJSON(), null, 2)}
        </pre>
      )}
    </div>
  );
}

interface ToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `rounded-md border px-2 py-1 text-sm ${
      active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
    }`;
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      <button type="button" className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
      <button type="button" className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
      <button type="button" className={btn(editor.isActive("underline"))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
      <button type="button" className={btn(editor.isActive("strike"))}
        onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>
      <button type="button" className={btn(editor.isActive("highlight"))}
        onClick={() => editor.chain().focus().toggleHighlight().run()}>Highlight</button>
      <span className="mx-1 w-px bg-border" />
      <button type="button" className={btn(editor.isActive("heading", { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
      <button type="button" className={btn(editor.isActive("heading", { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      <button type="button" className={btn(editor.isActive("heading", { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
      <span className="mx-1 w-px bg-border" />
      <button type="button" className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
      <button type="button" className={btn(editor.isActive("orderedList"))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
      <button type="button" className={btn(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>“ Quote</button>
      <button type="button" className={btn(editor.isActive("codeBlock"))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{"<>"}</button>
      <span className="mx-1 w-px bg-border" />
      <button type="button" className={btn(false)}
        onClick={() => editor.chain().focus().undo().run()}>Undo</button>
      <button type="button" className={btn(false)}
        onClick={() => editor.chain().focus().redo().run()}>Redo</button>
    </div>
  );
}
