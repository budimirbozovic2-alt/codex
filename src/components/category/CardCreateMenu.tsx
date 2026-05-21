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
import { afterDialogClose } from "@/lib/dialog-utils";

const DocxImporter = lazy(() => import("@/features/docx-importer").then(m => ({ default: m.DocxImporter })));

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
  /** Visual variant — `compact` inline, `prominent` empty-state CTA, `icon` ghost icon-only buttons. */
  size?: "compact" | "prominent" | "icon";
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
  const isIcon = size === "icon";
  const btnClass = isProminent
    ? "h-10 gap-2 text-sm px-4"
    : isIcon
      ? "h-8 w-8 text-muted-foreground hover:text-foreground"
      : "h-8 gap-1.5 text-xs";
  const iconClass = isProminent ? "h-4 w-4" : "h-4 w-4";
  const chevronClass = isProminent ? "h-3.5 w-3.5 opacity-70" : "h-3 w-3 opacity-70";
  const btnSize = isProminent ? "default" : isIcon ? "icon" : "sm";
  const btnVariant = isIcon ? "ghost" : undefined;
  const outlineVariant = isIcon ? "ghost" : "outline";
  const wrapperClass = isIcon
    ? "flex items-center gap-1"
    : "flex items-center justify-center gap-2 flex-wrap";

  return (
    <>
      <div className={wrapperClass}>
        {/* Nova kartica — single-card creation */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size={btnSize}
              variant={btnVariant}
              className={btnClass}
              aria-label="Nova kartica"
              title={isIcon ? "Nova kartica" : undefined}
            >
              <Plus className={iconClass} />
              {!isIcon && (
                <>
                  Nova kartica
                  <ChevronDown className={chevronClass} />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isIcon ? "end" : "center"} className="w-56">
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
              variant={outlineVariant}
              size={btnSize}
              className={btnClass}
              aria-label="Masovni uvoz"
              title={isIcon ? "Masovni uvoz" : undefined}
            >
              <Upload className={iconClass} />
              {!isIcon && (
                <>
                  Masovni uvoz
                  <ChevronDown className={chevronClass} />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isIcon ? "end" : "center"} className="w-64">
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
              setDocxOpen(false);
              afterDialogClose(() => {
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
              });
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
