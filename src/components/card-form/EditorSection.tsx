import { Plus, X, GripVertical, Scissors, Zap, FileText } from "lucide-react";
import React, { memo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RichTextEditor from "@/components/RichTextEditor";
import { parseHtmlToParagraphs } from "@/hooks/useCardActions";
import type { SectionInput, CardType, ValidationErrors } from "@/hooks/useCardActions";

// ── Cutting View (paragraph splitter) ───────────────────
function CuttingView({ content, onCut, onCancel }: {
  content: string;
  onCut: (paragraphIndex: number) => void;
  onCancel: () => void;
}) {
  const paragraphs = parseHtmlToParagraphs(content);
  if (paragraphs.length <= 1) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Nema dovoljno paragrafa za rezanje. Dodajte više teksta.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-warning">Kliknite na makazice da izrežete</span>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Otkaži</button>
      </div>
      {paragraphs.map((p, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <button
              type="button"
              onClick={() => onCut(idx)}
              className="w-full flex items-center gap-2 py-1.5 group hover:bg-warning/10 rounded transition-colors my-0.5"
            >
              <div className="flex-1 h-px bg-warning/30 group-hover:bg-warning" />
              <Scissors className="h-3.5 w-3.5 text-warning/50 group-hover:text-warning transition-colors rotate-90" />
              <div className="flex-1 h-px bg-warning/30 group-hover:bg-warning" />
            </button>
          )}
          <div className="text-sm px-2 py-1 rounded" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p) }} />
        </div>
      ))}
    </div>
  );
}

// ── Props ───────────────────────────────────────────────
interface EditorSectionProps {
  cardType: CardType;
  isEditing: boolean;
  question: string;
  setQuestion: (v: string) => void;
  flashAnswer: string;
  setFlashAnswer: (v: string) => void;
  sections: SectionInput[];
  cuttingIndex: number | null;
  setCuttingIndex: (v: number | null) => void;
  setCardType: (v: CardType) => void;
  addSection: () => void;
  removeSection: (i: number) => void;
  updateSection: (i: number, field: keyof SectionInput, value: string) => void;
  handleCut: (sectionIdx: number, paraIdx: number) => void;
  validationErrors: ValidationErrors;
}

// ── Component ───────────────────────────────────────────
const EditorSection = memo(function EditorSection({
  cardType, isEditing, question, setQuestion, flashAnswer, setFlashAnswer,
  sections, cuttingIndex, setCuttingIndex, setCardType,
  addSection, removeSection, updateSection, handleCut, validationErrors,
}: EditorSectionProps) {
  return (
    <div className="space-y-4">
      {/* Card type toggle */}
      {!isEditing && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCardType("essay")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-1 justify-center ${
              cardType === "essay" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <FileText className="h-4 w-4" />
            Esejsko pitanje
          </button>
          <button
            type="button"
            onClick={() => setCardType("flash")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-1 justify-center ${
              cardType === "flash" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <Zap className="h-4 w-4" />
            Blic pitanje
          </button>
        </div>
      )}

      {/* Question */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Pitanje</label>
        <RichTextEditor
          value={question}
          onChange={setQuestion}
          placeholder={cardType === "flash" ? "Unesite pitanje..." : "Unesite esejsko pitanje..."}
          minimal
        />
        {validationErrors.question && (
          <p className="text-xs text-destructive">{validationErrors.question}</p>
        )}
      </div>

      {/* Flash answer or Essay sections */}
      {cardType === "flash" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Odgovor</label>
          <RichTextEditor value={flashAnswer} onChange={setFlashAnswer} placeholder="Unesite odgovor..." />
          {validationErrors.flashAnswer && (
            <p className="text-xs text-destructive">{validationErrors.flashAnswer}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Cjeline odgovora</label>
            <Button type="button" variant="outline" size="sm" onClick={addSection}>
              <Plus className="h-3 w-3 mr-1" /> Dodaj cjelinu
            </Button>
          </div>
          {validationErrors.sections && (
            <p className="text-xs text-destructive">{validationErrors.sections}</p>
          )}
          {sections.map((section, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(i, "title", e.target.value)}
                  placeholder="Naziv cjeline..."
                  className="bg-background font-medium text-sm"
                />
                <button
                  type="button"
                  onClick={() => setCuttingIndex(cuttingIndex === i ? null : i)}
                  className={`p-1 rounded-lg transition-colors ${
                    cuttingIndex === i
                      ? "bg-warning/20 text-warning"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  title="Režim rezanja"
                >
                  <Scissors className="h-4 w-4" />
                </button>
                {sections.length > 1 && (
                  <button type="button" onClick={() => removeSection(i)} className="text-muted-foreground hover:text-destructive p-1">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {cuttingIndex === i ? (
                <CuttingView
                  content={section.content}
                  onCut={(pIdx) => handleCut(i, pIdx)}
                  onCancel={() => setCuttingIndex(null)}
                />
              ) : (
                <RichTextEditor
                  value={section.content}
                  onChange={(val) => updateSection(i, "content", val)}
                  placeholder="Sadržaj ove cjeline odgovora..."
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default EditorSection;
