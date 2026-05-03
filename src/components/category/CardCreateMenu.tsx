import { useState, lazy, Suspense } from "react";
import { Plus, Pencil, Sparkles, FileText, Upload, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { AddCardDialog } from "./CardViewDialogs";
import MassFlashImportTrigger from "./MassFlashImportTrigger";
import type { Card } from "@/lib/spaced-repetition";

const DocxImporter = lazy(() => import("@/components/DocxImporter"));

interface ParsedEssay {
  question: string;
  sections: { title: string; content: string }[];
}

interface Props {
  categoryId: string;
  /** Names of all categories — fed to the DocxImporter category picker. */
  allCategoryNames: string[];
  addCard: (
    question: string,
    sections: { title: string; content: string }[],
    category: string,
    subcategory?: string,
    chapter?: string,
  ) => Card;
  addFlashCard: (
    question: string,
    answer: string,
    category: string,
    subcategory?: string,
  ) => Card;
  /** Bulk flash import — single batched commit; replaces N×addFlashCard loop. */
  bulkAddFlashCards: (
    pairs: { question: string; answer: string }[],
    categoryId: string,
    subcategoryId?: string,
  ) => void;
  /** Bulk essay import (from useBackupActions().importCards). */
  importEssays: (cards: ParsedEssay[], category: string) => void;
  /** Visual variant — `compact` for inline toolbar, `prominent` for empty-state CTA. */
  size?: "compact" | "prominent";
}

/**
 * Two side-by-side primary actions for ALL card-creation flows:
 *   1. "Nova kartica" → Dodaj esej / Dodaj blic pitanje
 *   2. "Masovni uvoz" → Masovni uvoz esejskih pitanja / Masovni uvoz blic pitanja
 *
 * The filter/list area is intentionally stripped of any creation logic; this
 * pair of dropdowns is the only entry point.
 */
export default function CardCreateMenu({
  categoryId,
  allCategoryNames,
  addCard,
  addFlashCard,
  bulkAddFlashCards,
  importEssays,
  size = "compact",
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"essay" | "flash">("flash");
  const [docxOpen, setDocxOpen] = useState(false);
  const [bulkFlashOpen, setBulkFlashOpen] = useState(false);

  const openAdd = (mode: "essay" | "flash") => {
    setAddMode(mode);
    setAddOpen(true);
  };

  const isProminent = size === "prominent";
  const btnClass = isProminent
    ? "h-10 gap-2 text-sm px-4"
    : "h-8 gap-1.5 text-xs";
  const iconClass = isProminent ? "h-4 w-4" : "h-3.5 w-3.5";
  const chevronClass = isProminent ? "h-3.5 w-3.5 opacity-70" : "h-3 w-3 opacity-70";
  const btnSize = isProminent ? "default" : "sm";

  return (
    <>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {/* Nova kartica — single-card creation */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={btnSize} className={btnClass} aria-label="Nova kartica">
              <Plus className={iconClass} /> Nova kartica
              <ChevronDown className={chevronClass} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56">
            <DropdownMenuItem onClick={() => openAdd("essay")} className="gap-2 text-xs">
              <Pencil className="h-3.5 w-3.5" />
              Dodaj esej
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAdd("flash")} className="gap-2 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Dodaj blic pitanje
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Masovni uvoz — bulk import flows */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size={btnSize}
              className={btnClass}
              aria-label="Masovni uvoz"
            >
              <Upload className={iconClass} /> Masovni uvoz
              <ChevronDown className={chevronClass} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-64">
            <DropdownMenuItem onClick={() => setDocxOpen(true)} className="gap-2 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Masovni uvoz esejskih pitanja
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBulkFlashOpen(true)} className="gap-2 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Masovni uvoz blic pitanja
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AddCardDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categoryId={categoryId}
        addCard={addCard}
        addFlashCard={addFlashCard}
        defaultMode={addMode}
      />

      {docxOpen && (
        <Suspense fallback={null}>
          <DocxImporter
            open={docxOpen}
            onClose={() => setDocxOpen(false)}
            categories={allCategoryNames}
            onImport={(cards, cat, type) => {
              if (type === "flash") {
                // Single batched commit instead of N×addFlashCard.
                bulkAddFlashCards(
                  cards.map((c) => ({
                    question: c.question,
                    answer: c.sections.map((s) => s.content).join("\n"),
                  })),
                  cat,
                );
              } else {
                importEssays(cards, cat);
              }
              setDocxOpen(false);
            }}
          />
        </Suspense>
      )}

      <MassFlashImportTrigger
        open={bulkFlashOpen}
        onOpenChange={setBulkFlashOpen}
        categoryId={categoryId}
        bulkAddFlashCards={bulkAddFlashCards}
      />
    </>
  );
}
