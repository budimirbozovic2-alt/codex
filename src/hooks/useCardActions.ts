import { useState, useCallback, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";

interface SectionInput {
  title: string;
  content: string;
}

type CardType = "essay" | "flash";
type FormWidth = "compact" | "normal" | "wide" | "full";

export interface CardFormState {
  cardType: CardType;
  question: string;
  flashAnswer: string;
  sections: SectionInput[];
  category: string;
  subcategory: string;
  chapter: string;
  newCategory: string;
  showNewCat: boolean;
  newSubcategory: string;
  showNewSub: boolean;
  newChapter: string;
  showNewChapter: boolean;
  formWidth: FormWidth;
  cuttingIndex: number | null;
  availableChapters: string[];
}

interface UseCardActionsProps {
  categories: string[];
  subcategories: Record<string, string[]>;
  editCard?: Card | null;
  onSave: (question: string, sections: SectionInput[], category: string, subcategory?: string, chapter?: string) => void;
  onSaveFlash: (question: string, answer: string, category: string, subcategory?: string) => void;
  onUpdate?: (id: string, updates: { question?: string; sections?: SectionInput[]; category?: string; subcategory?: string; chapter?: string }) => void;
}

function parseHtmlToParagraphs(html: string): string[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const blocks: string[] = [];
  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (["p", "div", "br", "li"].includes(tag)) {
        const inner = el.innerHTML.trim();
        if (inner && inner !== "<br>") blocks.push(inner);
      } else {
        const outer = el.outerHTML.trim();
        if (outer) blocks.push(outer);
      }
    }
  };
  if (div.children.length === 0) {
    const parts = html.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [html];
  }
  div.childNodes.forEach(processNode);
  return blocks.length > 0 ? blocks : [html];
}

export { parseHtmlToParagraphs };
export type { SectionInput, CardType, FormWidth };

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

export function useCardActions({ categories, subcategories, editCard, onSave, onSaveFlash, onUpdate }: UseCardActionsProps) {
  const [cardType, setCardType] = useState<CardType>(editCard?.type || "essay");
  const [question, setQuestion] = useState(editCard?.question ?? "");
  const [flashAnswer, setFlashAnswer] = useState(
    editCard?.type === "flash" ? editCard.sections[0]?.content ?? "" : ""
  );
  const [sections, setSections] = useState<SectionInput[]>(
    editCard && editCard.type !== "flash"
      ? editCard.sections.map((s) => ({ title: s.title, content: s.content }))
      : [{ title: "Cjelina 1", content: "" }]
  );
  const [category, setCategory] = useState(editCard?.category ?? categories[0] ?? "Opšte");
  const [subcategory, setSubcategory] = useState(editCard?.subcategory ?? "");
  const [chapter, setChapter] = useState(editCard?.chapter ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const [newChapter, setNewChapter] = useState("");
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [formWidth, setFormWidth] = useState<FormWidth>("wide");
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  const [availableChapters, setAvailableChapters] = useState<string[]>([]);

  const availableSubs = subcategories[category] || [];

  useEffect(() => {
    const sub = showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategory;
    const cat = showNewCat && newCategory.trim() ? newCategory.trim() : category;
    if (!sub) { setAvailableChapters([]); return; }
    const key = `chapters-${cat}-${sub}`;
    import("@/lib/db").then(({ idbLoadSettings }) => {
      idbLoadSettings<string[]>(key, []).then(chapters => {
        setAvailableChapters(Array.from(new Set(chapters)));
      });
    });
  }, [category, subcategory, showNewCat, newCategory, showNewSub, newSubcategory]);

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, { title: `Cjelina ${prev.length + 1}`, content: "" }]);
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  }, []);

  const updateSection = useCallback((index: number, field: keyof SectionInput, value: string) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
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

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const cat = showNewCat && newCategory.trim() ? newCategory.trim() : category;
    const sub = showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategory;
    const ch = showNewChapter && newChapter.trim() ? newChapter.trim() : chapter;

    if (cardType === "flash") {
      if (!stripHtml(question) || !stripHtml(flashAnswer)) return;
      if (editCard && onUpdate) {
        onUpdate(editCard.id, {
          question,
          sections: [{ title: "Odgovor", content: flashAnswer }],
          category: cat, subcategory: sub, chapter: ch,
        });
      } else {
        onSaveFlash(question, flashAnswer, cat, sub);
      }
    } else {
      if (!stripHtml(question) || sections.some((s) => !stripHtml(s.content))) return;
      if (editCard && onUpdate) {
        onUpdate(editCard.id, { question, sections, category: cat, subcategory: sub, chapter: ch });
      } else {
        onSave(question, sections, cat, sub, ch);
      }
    }
  }, [cardType, question, flashAnswer, sections, category, subcategory, chapter, showNewCat, newCategory, showNewSub, newSubcategory, showNewChapter, newChapter, editCard, onSave, onSaveFlash, onUpdate]);

  return {
    // State
    cardType, question, flashAnswer, sections, category, subcategory, chapter,
    newCategory, showNewCat, newSubcategory, showNewSub, newChapter, showNewChapter,
    formWidth, cuttingIndex, availableChapters, availableSubs,
    // Setters
    setCardType, setQuestion, setFlashAnswer, setCategory, setSubcategory, setChapter,
    setNewCategory, setShowNewCat, setNewSubcategory, setShowNewSub,
    setNewChapter, setShowNewChapter, setFormWidth, setCuttingIndex,
    // Actions
    addSection, removeSection, updateSection, handleCut, handleSubmit,
  };
}
