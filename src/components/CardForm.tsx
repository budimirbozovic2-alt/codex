import { Card } from "@/lib/spaced-repetition";
import { Button } from "@/components/ui/button";
import { X, FileText } from "lucide-react";
import { useCardActions } from "@/hooks/useCardActions";
import type { SectionInput, FormWidth } from "@/hooks/useCardActions";
import EditorSection from "@/components/card-form/EditorSection";
import MetadataSection from "@/components/card-form/MetadataSection";

interface Props {
  categories: string[];
  subcategories: Record<string, string[]>;
  onSave: (question: string, sections: SectionInput[], category: string, subcategory?: string, chapter?: string) => void;
  onSaveFlash: (question: string, answer: string, category: string, subcategory?: string) => void;
  onCancel: () => void;
  editCard?: Card | null;
  onUpdate?: (id: string, updates: { question?: string; sections?: SectionInput[]; category?: string; subcategory?: string; chapter?: string }) => void;
}

const widthClasses: Record<FormWidth, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

const widthLabels: Record<FormWidth, string> = {
  compact: "S",
  normal: "M",
  wide: "L",
  full: "XL",
};

export default function CardForm({ categories, subcategories, onSave, onSaveFlash, onCancel, editCard, onUpdate }: Props) {
  const actions = useCardActions({ categories, subcategories, editCard, onSave, onSaveFlash, onUpdate });

  return (
    <form onSubmit={actions.handleSubmit} className={`space-y-6 ${widthClasses[actions.formWidth]} transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">{editCard ? "Uredi modul" : "Novi modul"}</h2>
        <div className="flex items-center gap-2">
          {editCard?.sourceId && (
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("sr-open-source-id", editCard.sourceId!);
                sessionStorage.setItem("sr-database-tab", "sources");
                window.location.hash = "/database";
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Vidi u izvoru
            </button>
          )}
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(widthClasses) as FormWidth[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => actions.setFormWidth(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  actions.formWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
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

      <EditorSection
        cardType={actions.cardType}
        editCard={editCard}
        question={actions.question}
        setQuestion={actions.setQuestion}
        flashAnswer={actions.flashAnswer}
        setFlashAnswer={actions.setFlashAnswer}
        sections={actions.sections}
        cuttingIndex={actions.cuttingIndex}
        setCuttingIndex={actions.setCuttingIndex}
        setCardType={actions.setCardType}
        addSection={actions.addSection}
        removeSection={actions.removeSection}
        updateSection={actions.updateSection}
        handleCut={actions.handleCut}
      />

      <MetadataSection
        cardType={actions.cardType}
        category={actions.category}
        setCategory={actions.setCategory}
        subcategory={actions.subcategory}
        setSubcategory={actions.setSubcategory}
        chapter={actions.chapter}
        setChapter={actions.setChapter}
        categories={categories}
        availableSubs={actions.availableSubs}
        availableChapters={actions.availableChapters}
        newCategory={actions.newCategory}
        setNewCategory={actions.setNewCategory}
        showNewCat={actions.showNewCat}
        setShowNewCat={actions.setShowNewCat}
        newSubcategory={actions.newSubcategory}
        setNewSubcategory={actions.setNewSubcategory}
        showNewSub={actions.showNewSub}
        setShowNewSub={actions.setShowNewSub}
        newChapter={actions.newChapter}
        setNewChapter={actions.setNewChapter}
        showNewChapter={actions.showNewChapter}
        setShowNewChapter={actions.setShowNewChapter}
      />

      <Button type="submit" className="w-full">
        {editCard ? "Sačuvaj izmjene" : actions.cardType === "flash" ? "Dodaj blic pitanje" : "Dodaj karticu"}
      </Button>
    </form>
  );
}
