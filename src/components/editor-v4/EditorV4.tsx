import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";

import { useEffect } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading2, List, ListOrdered,
  Highlighter, Star, Undo2, Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { editorV4Extensions, type EditorDoc } from "@/lib/editor-v4";

interface EditorV4Props {
  /** Initial document — read only on mount. Force reset with React `key`. */
  initialDoc: EditorDoc;
  /** Fires on every edit with the canonical V4 AST. */
  onChange: (doc: EditorDoc) => void;
  placeholder?: string;
  /** Minimal toolbar: bold/italic/lists only. */
  minimal?: boolean;
  /** Adds an "Označi kao ključni dio" toggle (KeyPart mark). */
  showKeyPartToggle?: boolean;
  className?: string;
}

const SAFE_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * `<EditorV4>` — canonical write-path editor for V4 content.
 *
 * TipTap v3 with the shared `editorV4Extensions` schema (read = write). All
 * commands flow through TipTap chains; no `document.execCommand`, no
 * `dangerouslySetInnerHTML`, no DOMPurify on input (schema is whitelist-based).
 *
 * `onChange` emits `{ version: 4, content: editor.getJSON() }` — callers
 * persist this as `Section.contentDoc` and derive legacy `content` (HTML) via
 * `docToHtml` until PR-6 flips reads entirely to AST.
 */
export function EditorV4({
  initialDoc,
  onChange,
  placeholder,
  minimal = false,
  showKeyPartToggle = false,
  className,
}: EditorV4Props) {
  const editor = useEditor({
    extensions: [
      ...editorV4Extensions,
      // Underline is included in StarterKit v3.
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: initialDoc.content,
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "ProseMirror focus:outline-none rounded-md border border-input bg-background px-3 py-2 text-sm",
          minimal ? "min-h-[60px]" : "min-h-[100px]",
          className,
        ),
      },
      handlePaste(_view, event) {
        // Image paste deferred until Image node is added to the V4 schema.
        // For now: if the clipboard carries an image, swallow the event so
        // we don't accidentally inject HTML the schema would strip silently.
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          if (SAFE_IMAGE_MIME.has(items[i].type)) {
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChange({ version: 4, content: editor.getJSON() });
    },
  });

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;

  const buttons = buildToolbarButtons(editor, { minimal, showKeyPartToggle });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5 px-1 flex-wrap">
        {buttons.map((b) => (
          <button
            key={b.title}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={b.onClick}
            aria-pressed={b.active}
            aria-label={b.title}
            title={b.title}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              b.active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            <b.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

interface ToolbarOpts {
  minimal: boolean;
  showKeyPartToggle: boolean;
}

interface ToolbarBtn {
  title: string;
  icon: typeof Bold;
  onClick: () => void;
  active: boolean;
}

function buildToolbarButtons(editor: Editor, opts: ToolbarOpts): ToolbarBtn[] {
  const all: Array<ToolbarBtn & { minimalShow: boolean }> = [
    { title: "Bolduj (Ctrl+B)", icon: Bold, onClick: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), minimalShow: true },
    { title: "Kurziv (Ctrl+I)", icon: Italic, onClick: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), minimalShow: true },
    { title: "Podvučeno (Ctrl+U)", icon: UnderlineIcon, onClick: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline"), minimalShow: false },
    { title: "Naslov", icon: Heading2, onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive("heading", { level: 3 }), minimalShow: false },
    { title: "Lista", icon: List, onClick: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList"), minimalShow: true },
    { title: "Numerisana lista", icon: ListOrdered, onClick: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList"), minimalShow: true },
    { title: "Žuti highlight", icon: Highlighter, onClick: () => editor.chain().focus().toggleHighlight().run(), active: editor.isActive("highlight"), minimalShow: false },
  ];
  const filtered = opts.minimal ? all.filter((b) => b.minimalShow) : all;
  const out: ToolbarBtn[] = filtered.map(({ minimalShow: _ms, ...rest }) => { void _ms; return rest; });

  if (opts.showKeyPartToggle) {
    out.push({
      title: "Označi kao ključni dio",
      icon: Star,
      onClick: () => editor.chain().focus().toggleMark("keyPart").run(),
      active: editor.isActive("keyPart"),
    });
  }
  out.push({
    title: "Poništi (Ctrl+Z)",
    icon: Undo2,
    onClick: () => editor.chain().focus().undo().run(),
    active: false,
  });
  out.push({
    title: "Ponovi (Ctrl+Shift+Z)",
    icon: Redo2,
    onClick: () => editor.chain().focus().redo().run(),
    active: false,
  });
  return out;
}

export default EditorV4;
