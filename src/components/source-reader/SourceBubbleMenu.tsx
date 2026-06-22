import { BubbleMenu } from "@tiptap/react/menus";
import {
  Brain, Heading1, Heading2, Heading3, Link as LinkIcon, List, ListOrdered,
  PenSquare, Scale, Star, Type,
} from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Editor } from "@/lib/editor-v4";
import type { SourceKind } from "@/lib/db-types";
import { getEditorSelectionPayload, type SelectionPayload } from "@/lib/source-reader/selection-payload";

interface Props {
  editor: Editor;
  /** True = formatting buttons (H1-H3, ¶, lists, key-part) are visible. */
  editMode: boolean;
  /** When "skripta", shows the legal-provision toggle in edit mode. */
  sourceKind?: SourceKind;
  /** Selected text + HTML + V4 AST → Smart-Split wizard. */
  onSplit: (payload: SelectionPayload) => void;
  /** Selected text + HTML + V4 AST → "Link to existing essay" modal. */
  onLinkToExisting: (payload: SelectionPayload) => void;
  /** Selected plain text → mnemonic workshop. */
  onAddMnemo: (text: string) => void;
}

/**
 * TipTap-native BubbleMenu for the source reader.
 *
 * Replaces the legacy `SourceTooltip` + `SourceContextMenu` + `useSourceSelection`
 * stack. Selection state is owned by ProseMirror; positioning is handled by
 * Floating UI. We never touch `window.getSelection()` here.
 *
 * Two button groups:
 *  - always-on: Napravi esej (Split), Poveži postojećem, Mnemo kuka
 *  - edit-mode only: H1 / H2 / H3 / ¶ / • / 1. / KeyPart
 */
export function SourceBubbleMenu({
  editor, editMode, sourceKind, onSplit, onLinkToExisting, onAddMnemo,
}: Props) {
  /** Resolve current selection → `{ text, html, contentDoc }` using the V4 codec. */
  const getSelectionPayload = useCallback((): SelectionPayload | null => {
    return getEditorSelectionPayload(editor);
  }, [editor]);

  const handleSplit = useCallback(() => {
    const p = getSelectionPayload();
    if (p) onSplit(p);
  }, [getSelectionPayload, onSplit]);

  const handleLink = useCallback(() => {
    const p = getSelectionPayload();
    if (p) onLinkToExisting(p);
  }, [getSelectionPayload, onLinkToExisting]);

  const handleMnemo = useCallback(() => {
    const p = getSelectionPayload();
    if (p) onAddMnemo(p.text);
  }, [getSelectionPayload, onAddMnemo]);

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor, from, to }) => {
        if (!editor.isFocused && !editor.view.hasFocus()) {/* allow */}
        if (from === to) return false;
        const text = editor.state.doc.textBetween(from, to, " ", " ").trim();
        return text.length >= 5;
      }}
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
    >
      {/* Always-on actions */}
      <MenuButton
        onClick={handleSplit}
        title="Napravi esej (S)"
        variant="primary"
      >
        <PenSquare className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Esej</span>
      </MenuButton>
      <MenuButton onClick={handleLink} title="Poveži sa postojećim esejem">
        <LinkIcon className="h-3.5 w-3.5" />
      </MenuButton>
      <MenuButton onClick={handleMnemo} title="Mnemo kuka">
        <Brain className="h-3.5 w-3.5" />
      </MenuButton>

      {editMode && (
        <>
          <Divider />
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Naslov 1"
            active={editor.isActive("heading", { level: 1 })}
          >
            <Heading1 className="h-3.5 w-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Naslov 2"
            active={editor.isActive("heading", { level: 2 })}
          >
            <Heading2 className="h-3.5 w-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Naslov 3"
            active={editor.isActive("heading", { level: 3 })}
          >
            <Heading3 className="h-3.5 w-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            title="Paragraf"
            active={editor.isActive("paragraph")}
          >
            <Type className="h-3.5 w-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista"
            active={editor.isActive("bulletList")}
          >
            <List className="h-3.5 w-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numerisana lista"
            active={editor.isActive("orderedList")}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </MenuButton>
          <Divider />
          <MenuButton
            onClick={() => editor.chain().focus().toggleKeyPart().run()}
            title="Označi kao ključni dio"
            active={editor.isActive("keyPart")}
            variant="warning"
          >
            <Star className="h-3.5 w-3.5" />
          </MenuButton>
          {sourceKind === "skripta" && (
            <>
              <Divider />
              <MenuButton
                onClick={() => editor.chain().focus().toggleLegalProvision().run()}
                title="Označi kao citat propisa"
                active={editor.isActive("legalProvision")}
                variant="default"
              >
                <Scale className="h-3.5 w-3.5" />
              </MenuButton>
            </>
          )}
        </>
      )}
    </BubbleMenu>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

interface MenuButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  variant?: "default" | "primary" | "warning";
}

function MenuButton({ children, onClick, title, active, variant = "default" }: MenuButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "warning" && (active
          ? "bg-warning text-warning-foreground"
          : "text-muted-foreground hover:text-warning hover:bg-warning/10"),
        variant === "default" && (active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"),
      )}
    >
      {children}
    </button>
  );
}
