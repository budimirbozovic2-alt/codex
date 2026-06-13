import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import {
  htmlToDoc,
  type Editor,
  type EditorDoc,
} from "@/lib/editor-v4";
import {
  createMnemonicCardFromSelection,
  loadMnemonicCards,
} from "@/domains/mnemonic";
import { useMnemonicMutations } from "@/hooks/mnemonic/useMnemonicMutations";
import { CardBubbleMenu } from "./CardBubbleMenu";

interface CardMetadata {
  cardId: string;
  question: string;
  category: string;
  subcategoryId?: string;
  tags?: string[];
  keyParts?: string[];
  categoryId?: string;
}

interface Props extends CardMetadata {
  /** Canonical AST. Required since PR-7d. */
  contentDoc: EditorDoc;
  className?: string;
  /**
   * Optional callback for "Ključni dio" toggle. When provided, the BubbleMenu
   * exposes the toggle button. Receives raw selection text — caller mutates
   * `card.keyParts` (add/remove) via existing card-action hooks.
   */
  onMarkKeyPart?: (text: string) => void;
}

/**
 * Read-only `<EditorV4>` wrapper that mounts a TipTap `CardBubbleMenu` for
 * card content. Selection is owned by ProseMirror and the menu floats via
 * Floating UI (TipTap v3 native).
 *
 * Highlights for `card.keyParts` rely on the `keyPart` mark inside
 * `contentDoc`; runtime overlays are not re-applied.
 */
export function CardSelectionEditor({
  cardId, question, category, subcategoryId, tags, keyParts, categoryId,
  contentDoc, className, onMarkKeyPart,
}: Props) {
  const initialDoc = useMemo<EditorDoc>(() => {
    if (contentDoc && contentDoc.version === 4 && contentDoc.content) return contentDoc;
    return htmlToDoc("");
  }, [contentDoc]);

  const [editor, setEditor] = useState<Editor | null>(null);
  const { saveCards: saveMnemoCards } = useMnemonicMutations();

  const handleAddMnemo = useCallback(async (text: string) => {
    const cards = await loadMnemonicCards();
    const clone = createMnemonicCardFromSelection(
      cardId, question, text, category, subcategoryId, tags,
    );
    await saveMnemoCards.mutateAsync([...cards, clone]);
    toast("Dodano u Mnemo radionicu", {
      description: `"${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`,
    });
    editor?.commands.blur();
  }, [cardId, question, category, subcategoryId, tags, editor, saveMnemoCards]);

  const handleToggleKeyPart = useCallback((text: string, isMarked: boolean) => {
    if (!onMarkKeyPart) return;
    onMarkKeyPart(text);
    toast(isMarked ? "Uklonjena oznaka" : "Označeno kao ključni dio", {
      description: `"${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`,
    });
    editor?.commands.blur();
  }, [onMarkKeyPart, editor]);

  return (
    <div className="relative">
      <EditorV4
        initialDoc={initialDoc}
        onChange={() => { /* read-only */ }}
        editable={false}
        hideToolbar
        embedKind="card"
        categoryId={categoryId}
        className={className}
        onEditorReady={setEditor}
      />
      {editor && (
        <CardBubbleMenu
          editor={editor}
          onAddMnemo={handleAddMnemo}
          onToggleKeyPart={onMarkKeyPart ? handleToggleKeyPart : undefined}
          keyParts={keyParts}
        />
      )}
    </div>
  );
}


