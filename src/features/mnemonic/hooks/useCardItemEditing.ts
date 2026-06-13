import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { EditorDoc } from "@/lib/editor-v4/types";
import {
  normalizeSectionForWrite,
  normalizeSectionOnRead,
  type MnemonicCard,
} from "../mnemonic-storage";

interface SectionDraft {
  title: string;
  contentDoc: EditorDoc;
}

/**
 * Encapsulates per-card editing state used by `WorkshopCardItem`:
 *   - start/save/cancel editing for question + sections
 *   - per-section contentDoc patch
 *   - confirm-then-delete flow with built-in toast
 *
 * Pure state container — no side-effects beyond the toast on delete.
 * Caller wires `onUpdateCard`/`onDeleteCard` from its own props.
 */
export function useCardItemEditing(
  card: MnemonicCard,
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void,
  onDeleteCard: (id: string) => void,
) {
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editQuestion, setEditQuestion] = useState("");
  const [editSections, setEditSections] = useState<SectionDraft[]>([]);

  const startEdit = useCallback(() => {
    setEditQuestion(card.question);
    setEditSections(
      card.sections.map((s) => {
        const normalized = normalizeSectionOnRead(s);
        return { title: normalized.title, contentDoc: normalized.contentDoc };
      }),
    );
    setEditMode(true);
  }, [card.question, card.sections]);

  const saveEdit = useCallback(() => {
    onUpdateCard(card.id, {
      question: editQuestion,
      sections: editSections.map(normalizeSectionForWrite),
    });
    setEditMode(false);
  }, [card.id, editQuestion, editSections, onUpdateCard]);

  const cancelEdit = useCallback(() => setEditMode(false), []);

  const updateSectionDoc = useCallback((idx: number, contentDoc: EditorDoc) => {
    setEditSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, contentDoc } : s)),
    );
  }, []);

  const removeSection = useCallback((idx: number) => {
    setEditSections((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDelete = useCallback(() => {
    onDeleteCard(card.id);
    toast.success("Mnemo kartica obrisana.");
  }, [card.id, onDeleteCard]);

  return {
    editMode,
    editQuestion, setEditQuestion,
    editSections,
    startEdit, saveEdit, cancelEdit,
    updateSectionDoc, removeSection,
    confirmDelete, setConfirmDelete,
    handleDelete,
  };
}
