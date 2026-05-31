import { Plus, X, ChevronUp, ChevronDown, Scissors, Zap, FileText } from "lucide-react";
import React, { memo, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentRenderer } from "@/components/ui/ContentRenderer";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import { htmlToDoc, docToHtml, type EditorDoc } from "@/lib/editor-v4";
import { splitDocByTopLevelBlocks } from "@/lib/editor-v4/split-blocks";
import type { SectionInput, CardType, ValidationErrors } from "@/hooks/useCardActions";

// ── Cutting View (block splitter — operates on AST, no HTML round-trip) ──
function CuttingView({ doc, onCut, onCancel }: {
  doc: EditorDoc;
  onCut: (blockIndex: number) => void;
  onCancel: () => void;
}) {
  const blocks = useMemo(() => splitDocByTopLevelBlocks(doc), [doc]);
  if (blocks.length <= 1) {
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
      {blocks.map((block, idx) => (
        <BlockRow key={idx} doc={block} idx={idx} onCut={onCut} />
      ))}
    </div>
  );
}

function BlockRow({ doc, idx, onCut }: { doc: EditorDoc; idx: number; onCut: (i: number) => void }) {
  return (
    <div>
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
      <ContentRenderer className="text-sm px-2 py-1 rounded" doc={doc} />
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
  updateSectionDoc: (i: number, doc: EditorDoc) => void;
  moveSection: (from: number, to: number) => void;
  handleCut: (sectionIdx: number, paraIdx: number) => void;
  validationErrors: ValidationErrors;
}

// ── Component ───────────────────────────────────────────
const EditorSection = memo(function EditorSection({
  cardType, isEditing, question, setQuestion, flashAnswer, setFlashAnswer,
  sections, cuttingIndex, setCuttingIndex, setCardType,
  addSection, removeSection, updateSection, updateSectionDoc, moveSection, handleCut, validationErrors,
}: EditorSectionProps) {
  // Seed AST for question + flash answer once per mount; thereafter the editor owns it.
  const questionDoc = useMemo(() => htmlToDoc(question || ""), []); // eslint-disable-line react-hooks/exhaustive-deps
  const flashAnswerDoc = useMemo(() => htmlToDoc(flashAnswer || ""), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev-only contract guard: this component assumes the parent forces a remount
  // via `key={card.id}` when switching cards. If `question`/`flashAnswer` mutate
  // across renders WITHOUT a remount, the editor will silently keep the stale seed.
  const seedQuestionRef = useRef(question);
  const seedFlashRef = useRef(flashAnswer);
  useEffect(() => {
    if (import.meta.env.DEV) {
      if (seedQuestionRef.current !== question || seedFlashRef.current !== flashAnswer) {
         
        console.warn(
          "[EditorSection] question/flashAnswer prop changed without remount. " +
          "Parent must set key={card.id} on EditorSection when swapping cards.",
        );
      }
    }
  }, [question, flashAnswer]);

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
        <EditorV4
          initialDoc={questionDoc}
          onChange={(doc) => setQuestion(docToHtml(doc))}
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
          <EditorV4
            initialDoc={flashAnswerDoc}
            onChange={(doc) => setFlashAnswer(docToHtml(doc))}
            placeholder="Unesite odgovor..."
          />
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
            <SectionEditor
              key={i}
              section={section}
              index={i}
              total={sections.length}
              cuttingActive={cuttingIndex === i}
              setCuttingIndex={setCuttingIndex}
              cuttingIndex={cuttingIndex}
              moveSection={moveSection}
              removeSection={removeSection}
              updateSection={updateSection}
              updateSectionDoc={updateSectionDoc}
              handleCut={handleCut}
            />
          ))}
        </div>
      )}
    </div>
  );
});

interface SectionEditorProps {
  section: SectionInput;
  index: number;
  total: number;
  cuttingActive: boolean;
  cuttingIndex: number | null;
  setCuttingIndex: (v: number | null) => void;
  moveSection: (from: number, to: number) => void;
  removeSection: (i: number) => void;
  updateSection: (i: number, field: keyof SectionInput, value: string) => void;
  updateSectionDoc: (i: number, doc: EditorDoc) => void;
  handleCut: (sectionIdx: number, paraIdx: number) => void;
}

const SectionEditor = memo(function SectionEditor({
  section, index: i, total, cuttingActive, cuttingIndex, setCuttingIndex,
  moveSection, removeSection, updateSection, updateSectionDoc, handleCut,
}: SectionEditorProps) {
  // Seed AST once per mount; React `key` (index) drives remount on splits/reorders.
  const initialDoc = useMemo(
    () => section.contentDoc,
    // Reason: editor is uncontrolled; reseeding from `section.contentDoc` on every
    // keystroke would clobber the user's in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button type="button" disabled={i === 0}
            onClick={() => moveSection(i, i - 1)}
            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors" title="Pomjeri gore">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button type="button" disabled={i === total - 1}
            onClick={() => moveSection(i, i + 1)}
            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors" title="Pomjeri dolje">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
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
            cuttingActive
              ? "bg-warning/20 text-warning"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          title="Režim rezanja"
        >
          <Scissors className="h-4 w-4" />
        </button>
        {total > 1 && (
          <button type="button" onClick={() => removeSection(i)} className="text-muted-foreground hover:text-destructive p-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {cuttingActive ? (
        <CuttingView
          doc={section.contentDoc}
          onCut={(pIdx) => handleCut(i, pIdx)}
          onCancel={() => setCuttingIndex(null)}
        />
      ) : (
        <EditorV4
          initialDoc={initialDoc}
          onChange={(doc) => updateSectionDoc(i, doc)}
          placeholder="Sadržaj ove cjeline odgovora..."
          showKeyPartToggle
        />
      )}
    </div>
  );
});

export default EditorSection;
