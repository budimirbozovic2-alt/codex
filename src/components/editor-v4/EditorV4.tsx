import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading2, List, ListOrdered,
  Highlighter, Star, Undo2, Redo2, Map as MapIcon, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { editorV4Extensions, SmartPaste, type EditorDoc } from "@/lib/editor-v4";

export interface EditorV4Handle {
  /** Insert raw text at the caret (preserves marks via TipTap's `insertContent`). */
  insertText: (text: string) => void;
  /** Insert as a standalone block (paragraph). For mindmaps use `insertMindmap`. */
  insertBlock: (text: string) => void;
  /** Insert a `mindmapEmbed` node at the caret. */
  insertMindmap: (mindmapId: string) => void;
  /** Insert a `wikiLink` node (or wrap selection). */
  insertWikiLink: (target: string, display?: string) => void;
  focus: () => void;
  /** Raw TipTap editor instance — parent can mount `<BubbleMenu editor={...}>`. */
  getEditor: () => Editor | null;
}

interface EditorV4Props {
  /** Canonical document; external updates sync via `setContent` (no remount). */
  initialDoc: EditorDoc;
  /** Fires on every edit with the canonical V4 AST. */
  onChange: (doc: EditorDoc) => void;
  placeholder?: string;
  /** Minimal toolbar: bold/italic/lists only. */
  minimal?: boolean;
  /** Adds an "Označi kao ključni dio" toggle (KeyPart mark). */
  showKeyPartToggle?: boolean;
  /** Required for `mindmapEmbed` nodeView to resolve the embedded snapshot. */
  categoryId?: string;
  /**
   * Surface hint for editor-aware affordances:
   *  - `'article'` shows the mindmap insert button + wiki-link helper.
   *  - `'source'` / `'card'` keep the toolbar focused on prose formatting.
   */
  embedKind?: "card" | "source" | "article";
  /** Invoked when user clicks the mindmap toolbar button. */
  onPickMindmap?: () => void;
  className?: string;
  /** When false, mounts editor in read-only mode (BubbleMenu still tracks selection). */
  editable?: boolean;
  /** Hide the static toolbar (e.g. when a BubbleMenu fully owns formatting). */
  hideToolbar?: boolean;
  /** Fires once when the TipTap editor is ready (and again if it changes). */
  onEditorReady?: (editor: Editor) => void;
}

const SAFE_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * `<EditorV4>` — canonical write-path editor for V4 content.
 *
 * TipTap v3 with the shared `editorV4Extensions` schema (read = write). All
 * commands flow through TipTap chains; no `document.execCommand`, no
 * `dangerouslySetInnerHTML`, no DOMPurify on input (schema is whitelist-based).
 *
 * Paste pipeline (`SmartPaste`) re-uses `preprocessHtml` so `[[wiki]]` and
 * `::mindmap[id]` syntax pasted from any clipboard payload becomes proper
 * `wikiLink` / `mindmapEmbed` nodes — same codec as backup import.
 *
 * `onChange` emits `{ version: 4, content: editor.getJSON() }` — callers
 * persist this as the canonical `contentDoc` and derive legacy `content`
 * (HTML/Markdown) via `docToHtml` / `docToMarkdown` for backward compat.
 */
export const EditorV4 = forwardRef<EditorV4Handle, EditorV4Props>(function EditorV4({
  initialDoc,
  onChange,
  placeholder,
  minimal = false,
  showKeyPartToggle = false,
  categoryId,
  embedKind = "card",
  onPickMindmap,
  className,
  editable = true,
  hideToolbar = false,
  onEditorReady,
}, ref) {
  // PR-7d M2.3: placeholder lives behind a ref so changing the prop does NOT
  // re-instantiate the editor (which would reset selection, history, scroll).
  // Placeholder.configure accepts a function for `placeholder`; we resolve
  // through the ref so the latest value is read on every render of the empty
  // editor decoration.
  const placeholderRef = useRef(placeholder ?? "");
  placeholderRef.current = placeholder ?? "";

  const initialDocRef = useRef(initialDoc);
  initialDocRef.current = initialDoc;

  // D.5-style guard (see EditorView): compare serialized AST so parent re-renders
  // with a fresh object reference don't reset ProseMirror, but external updates
  // (e.g. DOCX ingest) still flow in without a React `key` remount.
  const serialized = useMemo(() => JSON.stringify(initialDoc.content), [initialDoc.content]);
  const lastAppliedSerialized = useRef<string | null>(null);

  const extensions = useMemo(() => [
    ...editorV4Extensions,
    SmartPaste,
    Placeholder.configure({
      placeholder: () => placeholderRef.current,
      emptyEditorClass: "is-editor-empty",
    }),
  ], []);

  const editor = useEditor({
    extensions,
    content: initialDoc.content,
    editable,
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

  // Sync external `initialDoc` changes (DOCX upload, parent reset) without remount.
  useEffect(() => {
    if (!editor) return;
    if (lastAppliedSerialized.current === serialized) return;

    const currentSerialized = JSON.stringify(editor.getJSON());
    if (currentSerialized === serialized) {
      lastAppliedSerialized.current = serialized;
      return;
    }

    lastAppliedSerialized.current = serialized;
    editor.commands.setContent(initialDocRef.current.content, { emitUpdate: false });
  }, [serialized, editor]);

  // Wire categoryId into mindmap storage so nodeView can resolve embeds.
  useEffect(() => {
    if (!editor || !categoryId) return;
    const storage = (editor.storage as unknown as Record<string, unknown>).mindmapEmbed as
      | { categoryId?: string }
      | undefined;
    if (storage) storage.categoryId = categoryId;
  }, [editor, categoryId]);

  // Keep editable in sync with prop changes (read↔edit toggle in SourceContent).
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  // Notify parent once the editor instance exists so it can mount BubbleMenu.
  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  useImperativeHandle(ref, (): EditorV4Handle => ({
    insertText: (text: string) => {
      editor?.chain().focus().insertContent(text).run();
    },
    insertBlock: (text: string) => {
      editor?.chain().focus().insertContent({
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      }).run();
    },
    insertMindmap: (mindmapId: string) => {
      if (!mindmapId) return;
      editor?.chain().focus().insertContent({
        type: "mindmapEmbed",
        attrs: { mindmapId },
      }).run();
    },
    insertWikiLink: (target: string, display?: string) => {
      const t = target.trim();
      if (!t) return;
      const d = (display ?? t).trim() || t;
      editor?.chain().focus().insertContent({
        type: "wikiLink",
        attrs: { target: t, display: d, hasPipe: d !== t },
      }).run();
    },
    focus: () => { editor?.commands.focus(); },
    getEditor: () => editor ?? null,
  }), [editor]);

  // PR-7c (M1): depend on `editor` so each prior TipTap instance is destroyed
  // when the `extensions` memo (placeholder-driven) re-instantiates the editor.
  // Previously the `[]` deps captured only the first editor → silent leak of
  // ProseMirror views + DOM listeners across the component's lifetime.
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) return null;

  const buttons = buildToolbarButtons(editor, {
    minimal,
    showKeyPartToggle,
    showMindmap: embedKind === "article" && Boolean(onPickMindmap),
    showWikiLinkHelper: embedKind === "article",
    onPickMindmap,
  });

  return (
    <div className="space-y-1.5">
      {!hideToolbar && (
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
      )}
      <EditorContent editor={editor} />

    </div>
  );
});

interface ToolbarOpts {
  minimal: boolean;
  showKeyPartToggle: boolean;
  showMindmap: boolean;
  showWikiLinkHelper: boolean;
  onPickMindmap?: () => void;
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

  if (opts.showWikiLinkHelper) {
    out.push({
      title: "Umetni wiki-link ([[...]])",
      icon: Link2,
      onClick: () => editor.chain().focus().insertContent("[[]]").run(),
      active: false,
    });
  }
  if (opts.showKeyPartToggle) {
    out.push({
      title: "Označi kao ključni dio",
      icon: Star,
      onClick: () => editor.chain().focus().toggleMark("keyPart").run(),
      active: editor.isActive("keyPart"),
    });
  }
  if (opts.showMindmap && opts.onPickMindmap) {
    out.push({
      title: "Umetni mapu uma",
      icon: MapIcon,
      onClick: () => opts.onPickMindmap!(),
      active: false,
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


