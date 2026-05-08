import { useState, useCallback } from "react";
import type { Card } from "@/lib/spaced-repetition";
import { parseHtmlToParagraphs, type SectionInput, type CardType, type ValidationErrors } from "./validation";

export function useSectionEditor(editCard?: Card | null) {
  const [cardType, setCardType] = useState<CardType>(editCard?.type || "essay");
  const [question, setQuestion] = useState(editCard?.question ?? "");
  const [flashAnswer, setFlashAnswer] = useState(
    editCard?.type === "flash" ? editCard.sections[0]?.content ?? "" : "",
  );
  const [sections, setSections] = useState<SectionInput[]>(
    editCard && editCard.type !== "flash"
      ? editCard.sections.map(s => ({ title: s.title, content: s.content }))
      : [{ title: "Cjelina 1", content: "" }],
  );
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const addSection = useCallback(() => {
    setSections(prev => [...prev, { title: `Cjelina ${prev.length + 1}`, content: "" }]);
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateSection = useCallback((index: number, field: keyof SectionInput, value: string) => {
    setSections(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
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

  const handleCut = useCallback((sectionIndex: number, paragraphIndex: number) => {
    setSections(prev => {
      const section = prev[sectionIndex];
      const paragraphs = parseHtmlToParagraphs(section.content);
      if (paragraphIndex <= 0 || paragraphIndex >= paragraphs.length) return prev;

      const beforeContent = paragraphs.slice(0, paragraphIndex).map(p => `<p>${p}</p>`).join("");
      const rawTitle = paragraphs[paragraphIndex].replace(/<[^>]*>/g, "");
      const tempEl = document.createElement("span");
      tempEl.innerHTML = rawTitle;
      const newTitle = (tempEl.textContent || rawTitle).trim();
      const afterContent = paragraphs.slice(paragraphIndex + 1).map(p => `<p>${p}</p>`).join("");

      const updated = [...prev];
      updated[sectionIndex] = { ...updated[sectionIndex], content: beforeContent };
      updated.splice(sectionIndex + 1, 0, { title: newTitle, content: afterContent });
      return updated;
    });
    setCuttingIndex(null);
  }, []);

  return {
    cardType, question, flashAnswer, sections, cuttingIndex, validationErrors, isSaving,
    setCardType, setQuestion, setFlashAnswer, setSections, setCuttingIndex,
    setValidationErrors, setIsSaving,
    addSection, removeSection, updateSection, moveSection, handleCut,
  };
}
