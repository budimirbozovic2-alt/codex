import { useState, useCallback } from "react";
import { default as ClipboardPaste } from "lucide-react/dist/esm/icons/clipboard-paste";
import { default as MapPin } from "lucide-react/dist/esm/icons/map-pin";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import { default as Trash2 } from "lucide-react/dist/esm/icons/trash-2";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down";
import { default as ChevronUp } from "lucide-react/dist/esm/icons/chevron-up";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ExamQuestion {
  id: string;
  text: string;
  done: boolean;
  moduleCount?: number;
}

interface Props {
  questions: ExamQuestion[];
  onSetQuestions: (q: ExamQuestion[]) => void;
  onMapSelection: (questionId: string) => void;
  hasSelection: boolean;
}

export default function ExamSidebar({ questions, onSetQuestions, onMapSelection, hasSelection }: Props) {
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [doneExpanded, setDoneExpanded] = useState(false);

  const pending = questions.filter(q => !q.done);
  const done = questions.filter(q => q.done);

  const handlePasteConfirm = useCallback(() => {
    const lines = pasteText
      .split("\n")
      .map(l => l.replace(/^\d+[\.\)\-]\s*/, "").trim())
      .filter(l => l.length > 3);

    if (lines.length === 0) return;

    const newQs: ExamQuestion[] = lines.map(text => ({
      id: crypto.randomUUID(),
      text,
      done: false,
    }));

    onSetQuestions([...questions, ...newQs]);
    setPasteText("");
    setPasteMode(false);
  }, [pasteText, questions, onSetQuestions]);

  const handleRemove = useCallback((id: string) => {
    onSetQuestions(questions.filter(q => q.id !== id));
  }, [questions, onSetQuestions]);

  const handleClearDone = useCallback(() => {
    onSetQuestions(questions.filter(q => !q.done));
  }, [questions, onSetQuestions]);

  return (
    <div className="w-72 flex-shrink-0 sticky top-20 self-start max-h-[calc(100vh-8rem)] flex flex-col">
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden h-full">
        {/* Header */}
        <div className="px-3 py-2.5 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Ispitna pitanja
            </h4>
            <Badge variant="outline" className="text-[10px]">
              {pending.length}/{questions.length}
            </Badge>
          </div>
        </div>

        {/* Paste area or button */}
        <div className="px-3 py-2 border-b">
          {pasteMode ? (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring min-h-[100px] resize-none"
                placeholder={"Zalijepite listu pitanja...\n(jedno pitanje po redu)\n\n1. Pitanje jedan\n2. Pitanje dva"}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={handlePasteConfirm} disabled={!pasteText.trim()}>
                  Dodaj
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPasteMode(false); setPasteText(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs gap-1.5"
              onClick={() => setPasteMode(true)}
            >
              <ClipboardPaste className="h-3 w-3" />
              Dodaj pitanja
            </Button>
          )}
        </div>

        {/* Pending questions */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
          {pending.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {questions.length === 0
                ? "Dodajte pitanja paste-ovanjem"
                : "Sva pitanja su mapirana ✓"}
            </p>
          )}
          {pending.map(q => (
            <div key={q.id} className="group rounded-md border bg-background px-2.5 py-2 space-y-1.5">
              <p className="text-xs leading-relaxed">{q.text}</p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className={cn(
                    "flex-1 h-6 text-[10px] gap-1",
                    hasSelection
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50"
                  )}
                  disabled={!hasSelection}
                  onClick={() => onMapSelection(q.id)}
                  title={hasSelection ? "Mapiraj selektovani tekst na ovo pitanje" : "Prvo selektujte tekst u zakonu"}
                >
                  <MapPin className="h-3 w-3" />
                  Mapiraj selekciju
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemove(q.id)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Done section */}
        {done.length > 0 && (
          <div className="border-t">
            <button
              onClick={() => setDoneExpanded(!doneExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-green-500" />
                Završeno ({done.length})
              </span>
              {doneExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
            {doneExpanded && (
              <div className="px-2 pb-2 space-y-1">
                {done.map(q => (
                  <div key={q.id} className="rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-1.5">
                    <p className="text-xs text-green-700 dark:text-green-400 line-through opacity-70">{q.text}</p>
                    {q.moduleCount && (
                      <span className="text-[10px] text-green-600 dark:text-green-500">{q.moduleCount} modula</span>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="w-full h-6 text-[10px] text-muted-foreground" onClick={handleClearDone}>
                  Očisti završena
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
