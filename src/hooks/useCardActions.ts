import { useState, useCallback, useEffect, useMemo } from "react";
import type { CategoryRecord, SubcategoryNode } from "@/lib/db";
import { Card } from "@/lib/spaced-repetition";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────
export interface SectionInput {
  title: string;
  content: string;
}

export type CardType = "essay" | "flash";
export type FormWidth = "compact" | "normal" | "wide" | "full";

interface UseCardActionsProps {
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryRecords?: CategoryRecord[];
  editCard?: Card | null;
  onSave: (question: string, sections: SectionInput[], category: string, subcategory?: string, chapter?: string) => void;
  onSaveFlash: (question: string, answer: string, category: string, subcategory?: string) => void;
  onUpdate?: (id: string, updates: {
    question?: string;
    sections?: SectionInput[];
    category?: string;
    subcategory?: string;
    chapter?: string;
  }) => void;
}

// ─── Helpers ────────────────────────────────────────────
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

export function parseHtmlToParagraphs(html: string): string[] {
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

// ─── Validation ─────────────────────────────────────────
export interface ValidationErrors {
  question?: string;
  flashAnswer?: string;
  sections?: string;
}

function validate(
  cardType: CardType,
  question: string,
  flashAnswer: string,
  sections: SectionInput[],
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!stripHtml(question)) {
    errors.question = "Pitanje ne smije biti prazno.";
  }
  if (cardType === "flash") {
    if (!stripHtml(flashAnswer)) {
      errors.flashAnswer = "Odgovor ne smije biti prazan.";
    }
  } else {
    if (sections.some(s => !stripHtml(s.content))) {
      errors.sections = "Sve cjeline moraju imati sadržaj.";
    }
  }
  return errors;
}

// ═════════════════════════════════════════════════════════
// Hook
// ═════════════════════════════════════════════════════════
export function useCardActions({ categories, subcategories, editCard, onSave, onSaveFlash, onUpdate }: UseCardActionsProps) {
  // ── Core state ────────────────────────────────────────
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

  // ── Metadata state ────────────────────────────────────
  const [category, setCategory] = useState(editCard?.categoryId ?? categories[0] ?? "");
  const [subcategory, setSubcategory] = useState(editCard?.subcategory ?? "");
  const [chapter, setChapter] = useState(editCard?.chapter ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const [newChapter, setNewChapter] = useState("");
  const [showNewChapter, setShowNewChapter] = useState(false);

  // ── UI state ──────────────────────────────────────────
  const [formWidth, setFormWidth] = useState<FormWidth>("wide");
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  // ── Derived ───────────────────────────────────────────
  const availableSubs = subcategories[category] || [];

  // ── Linked source gazette info (read-only) ────────────
  const [linkedGazetteInfo, setLinkedGazetteInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!editCard?.sourceId) { setLinkedGazetteInfo(null); return; }
    import("@/lib/db").then(({ db }) => {
      db.sources.get(editCard.sourceId!).then(source => {
        setLinkedGazetteInfo(source?.officialGazetteInfo ?? null);
      });
    });
  }, [editCard?.sourceId]);

  // ── Load available chapters ───────────────────────────
  const [availableChapters, setAvailableChapters] = useState<string[]>([]);
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

  // ── Section actions ───────────────────────────────────
  const addSection = useCallback(() => {
    setSections(prev => [...prev, { title: `Cjelina ${prev.length + 1}`, content: "" }]);
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateSection = useCallback((index: number, field: keyof SectionInput, value: string) => {
    setSections(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
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

  // ── Resolve final metadata values ─────────────────────
  const resolvedMeta = useMemo(() => ({
    category: showNewCat && newCategory.trim() ? newCategory.trim() : category,
    subcategory: showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategory,
    chapter: showNewChapter && newChapter.trim() ? newChapter.trim() : chapter,
  }), [showNewCat, newCategory, category, showNewSub, newSubcategory, subcategory, showNewChapter, newChapter, chapter]);

  // ── Submit ────────────────────────────────────────────
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const errors = validate(cardType, question, flashAnswer, sections);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return;
    }

    setIsSaving(true);
    const { category: cat, subcategory: sub, chapter: ch } = resolvedMeta;

    try {
      if (cardType === "flash") {
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
        if (editCard && onUpdate) {
          onUpdate(editCard.id, { question, sections, category: cat, subcategory: sub, chapter: ch });
        } else {
          onSave(question, sections, cat, sub, ch);
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [cardType, question, flashAnswer, sections, resolvedMeta, editCard, onSave, onSaveFlash, onUpdate]);

  return {
    // State
    cardType, question, flashAnswer, sections,
    category, subcategory, chapter,
    newCategory, showNewCat, newSubcategory, showNewSub,
    newChapter, showNewChapter,
    formWidth, cuttingIndex,
    availableChapters, availableSubs,
    linkedGazetteInfo,
    validationErrors, isSaving,
    // Setters
    setCardType, setQuestion, setFlashAnswer,
    setCategory, setSubcategory, setChapter,
    setNewCategory, setShowNewCat,
    setNewSubcategory, setShowNewSub,
    setNewChapter, setShowNewChapter,
    setFormWidth, setCuttingIndex,
    // Actions
    addSection, removeSection, updateSection, handleCut, handleSubmit,
  };
}
