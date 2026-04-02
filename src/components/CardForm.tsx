import { X, FileText, Loader2, Scissors } from "lucide-react";
import { Card } from "@/lib/spaced-repetition";
import { Button } from "@/components/ui/button";
import { useCardActions } from "@/hooks/useCardActions";
import type { SectionInput, FormWidth } from "@/hooks/useCardActions";
import type { CategoryRecord } from "@/lib/db";
import EditorSection from "@/components/card-form/EditorSection";
import MetadataSection from "@/components/card-form/MetadataSection";

interface Props {
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryRecords?: CategoryRecord[];
  onSave: (question: string, sections: SectionInput[], categoryId: string, subcategoryId?: string, chapterId?: string) => void;
  onSaveFlash: (question: string, answer: string, categoryId: string, subcategoryId?: string) => void;
  onCancel: () => void;
  editCard?: Card | null;
  onUpdate?: (id: string, updates: { question?: string; sections?: SectionInput[]; categoryId?: string; subcategoryId?: string; chapterId?: string }) => void;
  onSplit?: (id: string) => void;
}

const widthClasses: Record<FormWidth, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

const widthLabels: Record<FormWidth, string> = {
  compact: "S", normal: "M", wide: "L", full: "XL",
};

export default function CardForm({ categories, subcategories, categoryRecords, onSave, onSaveFlash, onCancel, editCard, onUpdate, onSplit }: Props) {
  const a = useCardActions({ categories, subcategories, categoryRecords, editCard, onSave, onSaveFlash, onUpdate });

  return (
    <form onSubmit={a.handleSubmit} className={`space-y-6 ${widthClasses[a.formWidth]} transition-all duration-300`}>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="imperial-title">{editCard ? "Uredi modul" : "Novi modul"}</h2>
        <div className="flex items-center gap-2">
          {editCard?.sourceId && (
            <button
              type="button"
              onClick={() => {
                window.location.hash = `#/category/${editCard.categoryId}`;
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Vidi u izvoru
            </button>
          )}
          {onSplit && editCard && editCard.sections && editCard.sections.length > 1 && (
            <button
              type="button"
              onClick={() => onSplit(editCard.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
            >
              <Scissors className="h-3.5 w-3.5" />
              Podijeli karticu
            </button>
          )}
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(widthClasses) as FormWidth[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => a.setFormWidth(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  a.formWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {widthLabels[w]}
              </button>
            ))}
          </div>
          <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
            {editCard && <span className="text-xs">Vrati me nazad</span>}
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Editor (question + answer/sections) ──────── */}
      <EditorSection
        cardType={a.cardType}
        isEditing={!!editCard}
        question={a.question}
        setQuestion={a.setQuestion}
        flashAnswer={a.flashAnswer}
        setFlashAnswer={a.setFlashAnswer}
        sections={a.sections}
        cuttingIndex={a.cuttingIndex}
        setCuttingIndex={a.setCuttingIndex}
        setCardType={a.setCardType}
        addSection={a.addSection}
        removeSection={a.removeSection}
        updateSection={a.updateSection}
        handleCut={a.handleCut}
        validationErrors={a.validationErrors}
      />

      {/* ── Metadata (category, subcategory, chapter, gazette) */}
      <MetadataSection
        cardType={a.cardType}
        categoryId={a.categoryId}
        setCategoryId={a.setCategoryId}
        subcategoryId={a.subcategoryId}
        setSubcategoryId={a.setSubcategoryId}
        chapterId={a.chapterId}
        setChapterId={a.setChapterId}
        categories={categories}
        availableSubs={a.availableSubs}
        availableChapters={a.availableChapters}
        newCategory={a.newCategory}
        setNewCategory={a.setNewCategory}
        showNewCat={a.showNewCat}
        setShowNewCat={a.setShowNewCat}
        newSubcategory={a.newSubcategory}
        setNewSubcategory={a.setNewSubcategory}
        showNewSub={a.showNewSub}
        setShowNewSub={a.setShowNewSub}
        newChapter={a.newChapter}
        setNewChapter={a.setNewChapter}
        showNewChapter={a.showNewChapter}
        setShowNewChapter={a.setShowNewChapter}
        linkedGazetteInfo={a.linkedGazetteInfo}
        sourceId={editCard?.sourceId}
        categoryRecords={categoryRecords}
      />

      {/* ── Submit ───────────────────────────────────── */}
      <Button type="submit" className="w-full" disabled={a.isSaving}>
        {a.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {editCard ? "Sačuvaj izmjene" : a.cardType === "flash" ? "Dodaj blic pitanje" : "Dodaj karticu"}
      </Button>
    </form>
  );
}
