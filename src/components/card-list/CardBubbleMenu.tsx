import { BubbleMenu } from "@tiptap/react/menus";
import { Brain, Star } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Editor } from "@/lib/editor-v4";

interface Props {
  editor: Editor;
  /** Selected plain text → mnemonic workshop. */
  onAddMnemo: (text: string) => void;
  /** When provided, shows a "Ključni dio" toggle. */
  onToggleKeyPart?: (text: string, isMarked: boolean) => void;
  /** Current keyParts on the card — used to compute the toggle state. */
  keyParts?: string[];
}

/**
 * TipTap-native BubbleMenu for card views (CardRow expanded body + Recall).
 *
 * Actions:
 *  - Always: "Mnemo kuka" → clone selection into mnemonic workshop.
 *  - Optional: "Ključni dio" toggle (delegates to `onToggleKeyPart`).
 *
 * Selection state is owned by ProseMirror.
 */
export function CardBubbleMenu({ editor, onAddMnemo, onToggleKeyPart, keyParts }: Props) {
  const getSelectionText = useCallback((): string | null => {
    const { state } = editor;
    const { from, to, empty } = state.selection;
    if (empty) return null;
    const text = state.doc.textBetween(from, to, "\n", " ").trim();
    if (text.length < 5) return null;
    return text;
  }, [editor]);

  const handleMnemo = useCallback(() => {
    const text = getSelectionText();
    if (text) onAddMnemo(text);
  }, [getSelectionText, onAddMnemo]);

  const handleKeyPart = useCallback(() => {
    if (!onToggleKeyPart) return;
    const text = getSelectionText();
    if (!text) return;
    const isMarked = (keyParts ?? []).some(p => p === text);
    onToggleKeyPart(text, isMarked);
  }, [getSelectionText, onToggleKeyPart, keyParts]);

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor, from, to }) => {
        if (from === to) return false;
        const text = editor.state.doc.textBetween(from, to, " ", " ").trim();
        return text.length >= 5;
      }}
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleMnemo}
        title="Mnemo kuka"
        aria-label="Mnemo kuka"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        <Brain className="h-3.5 w-3.5" />
        Mnemo kuka
      </button>
      {onToggleKeyPart && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleKeyPart}
          title="Označi kao ključni dio"
          aria-label="Označi kao ključni dio"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            "bg-warning text-warning-foreground hover:bg-warning/90",
          )}
        >
          <Star className="h-3.5 w-3.5" />
          Ključni dio
        </button>
      )}
    </BubbleMenu>
  );
}

export default CardBubbleMenu;
