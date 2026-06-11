import { useCallback, useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  splitIntoCards,
  type HeadingLevel,
  type ParsedCard,
  type SplitMode,
} from "@/lib/docx/splitIntoSections";

export type CardType = "essay" | "flash";
export type WizardStep = "upload" | "configure" | "preview";

export interface DocxSplitConfig {
  questionSplitMode: SplitMode;
  sectionSplitMode: SplitMode;
  splitHeading: HeadingLevel;
  sectionHeading: HeadingLevel;
  delimiter: string;
  sectionDelimiter: string;
}

const DEFAULT_CONFIG: DocxSplitConfig = {
  questionSplitMode: "heading",
  sectionSplitMode: "heading",
  splitHeading: "h1",
  sectionHeading: "h2",
  delimiter: "",
  sectionDelimiter: "",
};

/**
 * Orchestrator hook for the DOCX import wizard.
 *
 * Owns: file/htmlContent/parsedCards state, the 3-step wizard machine,
 * the dynamic `mammoth` import + HTML sanitization, and the parse step
 * that calls the pure splitters from `lib/docx/splitIntoSections`.
 *
 * The presenter component (`DocxImporter.tsx`) consumes this hook and
 * stays free of DOM-parsing and worker-loading concerns.
 */
export function useDocxImportFlow(defaultCategory: string) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [cardType, setCardType] = useState<CardType>("essay");
  const [category, setCategory] = useState(defaultCategory);
  const [newCategory, setNewCategory] = useState("");
  const [splitConfig, setSplitConfig] = useState<DocxSplitConfig>(DEFAULT_CONFIG);

  const updateSplitConfig = useCallback(
    (patch: Partial<DocxSplitConfig>) =>
      setSplitConfig((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const { parseDocxInWorker } = await import("./docx-parser");
      const html = await parseDocxInWorker(arrayBuffer);
      setHtmlContent(sanitizeHtml(html));
      setStep("configure");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Neuspješno čitanje DOCX fajla.";
      alert(`Greška pri čitanju DOCX fajla: ${msg}`);
    }
  }, []);

  const parseContent = useCallback(() => {
    if (!htmlContent) return;
    const cards = splitIntoCards(
      htmlContent,
      {
        mode: splitConfig.questionSplitMode,
        heading: splitConfig.splitHeading,
        delimiter: splitConfig.delimiter,
      },
      {
        mode: splitConfig.sectionSplitMode,
        heading: splitConfig.sectionHeading,
        delimiter: splitConfig.sectionDelimiter,
      },
    );
    setParsedCards(cards);
    setStep("preview");
  }, [htmlContent, splitConfig]);

  const reset = useCallback(() => {
    setFile(null);
    setHtmlContent("");
    setParsedCards([]);
    setStep("upload");
    setNewCategory("");
    setCardType("essay");
    setSplitConfig(DEFAULT_CONFIG);
  }, []);

  return {
    // wizard
    step,
    setStep,
    // file + parsing
    file,
    parsedCards,
    handleFileSelect,
    parseContent,
    // card meta
    cardType,
    setCardType,
    category,
    setCategory,
    newCategory,
    setNewCategory,
    // split config
    splitConfig,
    updateSplitConfig,
    // lifecycle
    reset,
  };
}
