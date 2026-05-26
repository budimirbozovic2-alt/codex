import { useState, useCallback } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { SectionInput, CardType, ValidationErrors } from "./validation";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";
import { derivePlainText } from "@/lib/editor-v4/derived";
import { sliceDocAtBlock, splitDocByTopLevelBlocks, blockPlainText } from "@/lib/editor-v4/split-blocks";

export function useSectionEditor(editCard?: Card | null) {
  const [cardType, setCardType] = useState<CardType>(editCard?.type || "essay");
  const [question, setQuestion] = useState(editCard?.question ?? "");
  const [flashAnswer, setFlashAnswer] = useState(
    // PR-7e M4: flash answer derived from AST — no legacy `content` read.
    editCard?.type === "flash" ? derivePlainText(editCard.sections[0]?.contentDoc) : "",
  );
  const [sections, setSections] = useState<SectionInput[]>(() => {
    if (editCard && editCard.type !== "flash") {
      return editCard.sections.map(s => ({
        title: s.title,
        contentDoc: s.contentDoc,
      }));
    }
    return [{ title: "Cjelina 1", contentDoc: htmlToDoc("") }];
  });
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const addSection = useCallback(() => {
    setSections(prev => [
      ...prev,
      { title: `Cjelina ${prev.length + 1}`, contentDoc: htmlToDoc("") },
    ]);
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateSection = useCallback((index: number, field: keyof SectionInput, value: string) => {
    setSections(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }, []);

  /**
   * PR-7e M3: contentDoc is the canonical write payload — no derived HTML.
   */
  const updateSectionDoc = useCallback((index: number, doc: EditorDoc) => {
    setSections(prev => prev.map((s, i) => (
      i === index ? { ...s, contentDoc: doc } : s
    )));
  }, []);

  const moveSection = useCallback((from: number, to: number) => {
    setSections(prev => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  /**
   * PR-7e M3: block-level cut operates on AST directly. The block at
   * `blockIndex` becomes the title of the new section; everything before
   * stays in the current section, everything after seeds the new section.
   */
  const handleCut = useCallback((sectionIndex: number, blockIndex: number) => {
    setSections(prev => {
      const section = prev[sectionIndex];
      const blocks = splitDocByTopLevelBlocks(section.contentDoc);
      if (blockIndex <= 0 || blockIndex >= blocks.length) return prev;

      const newTitle = blockPlainText(blocks[blockIndex]) || `Cjelina ${prev.length + 1}`;
      const { before } = sliceDocAtBlock(section.contentDoc, blockIndex);
      const { after } = sliceDocAtBlock(section.contentDoc, blockIndex + 1);

      const updated = [...prev];
      updated[sectionIndex] = { ...updated[sectionIndex], contentDoc: before };
      updated.splice(sectionIndex + 1, 0, { title: newTitle, contentDoc: after });
      return updated;
    });
    setCuttingIndex(null);
  }, []);

  return {
    cardType, question, flashAnswer, sections, cuttingIndex, validationErrors, isSaving,
    setCardType, setQuestion, setFlashAnswer, setSections, setCuttingIndex,
    setValidationErrors, setIsSaving,
    addSection, removeSection, updateSection, updateSectionDoc, moveSection, handleCut,
  };
}
