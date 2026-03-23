import { useState, useCallback, useEffect } from "react";
import { default as ClipboardPaste } from "lucide-react/dist/esm/icons/clipboard-paste";
import { default as MapPin } from "lucide-react/dist/esm/icons/map-pin";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import { default as Trash2 } from "lucide-react/dist/esm/icons/trash-2";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down";
import { default as ChevronUp } from "lucide-react/dist/esm/icons/chevron-up";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import { default as PencilLine } from "lucide-react/dist/esm/icons/pencil-line";
import { default as Eraser } from "lucide-react/dist/esm/icons/eraser";
import { default as Loader2 } from "lucide-react/dist/esm/icons/loader-2";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [mappingId, setMappingId] = useState<string | null>(null);
  const [justMappedId, setJustMappedId] = useState<string | null>(null);

  const pending = questions.filter(q => !q.done);
  const done = questions.filter(q => q.done);

  // Open edit modal — populate with current pending questions
  const handleOpenEdit = useCallback(() => {
    setEditText(pending.map(q => q.text).join("\n"));
    setEditModalOpen(true);
  }, [pending]);

  // Save edited list — replace pending, keep done
  const handleSaveEdit = useCallback(() => {
    const lines = editText
      .split("\n")
      .map(l => l.replace(/^\d+[\.\)\-]\s*/, "").trim())
      .filter(l => l.length > 3);

    const newPending: ExamQuestion[] = lines.map(text => {
      // Reuse existing question if text matches
      const existing = pending.find(q => q.text === text);
      return existing || { id: crypto.randomUUID(), text, done: false };
    });

    onSetQuestions([...newPending, ...done]);
    setEditModalOpen(false);
  }, [editText, pending, done, onSetQuestions]);

  const handleRemove = useCallback((id: string) => {
    onSetQuestions(questions.filter(q => q.id !== id));
  }, [questions, onSetQuestions]);

  const handleClearAll = useCallback(() => {
    onSetQuestions([]);
  }, [onSetQuestions]);

  const handleClearDone = useCallback(() => {
    onSetQuestions(questions.filter(q => !q.done));
  }, [questions, onSetQuestions]);

  // Wrap onMapSelection with animation
  const handleMap = useCallback((qId: string) => {
    setMappingId(qId);
    // Small delay for visual feedback before actual action
    setTimeout(() => {
      onMapSelection(qId);
      setMappingId(null);
      setJustMappedId(qId);
    }, 300);
  }, [onMapSelection]);

  // Clear justMapped after animation
  useEffect(() => {
    if (!justMappedId) return;
    const t = setTimeout(() => setJustMappedId(null), 1200);
    return () => clearTimeout(t);
  }, [justMappedId]);

  return (
    <>
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

          {/* Action buttons */}
          <div className="px-3 py-2 border-b flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs gap-1.5"
              onClick={handleOpenEdit}
            >
              <PencilLine className="h-3 w-3" />
              Uredi listu pitanja
            </Button>
            {questions.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={handleClearAll}
                title="Očisti cijelu listu"
              >
                <Eraser className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Pending questions */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
            {pending.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                {questions.length === 0
                  ? "Kliknite 'Uredi listu pitanja' da dodate pitanja"
                  : "Sva pitanja su mapirana ✓"}
              </p>
            )}
            {pending.map(q => {
              const isMapping = mappingId === q.id;
              const justMapped = justMappedId === q.id;

              return (
                <div
                  key={q.id}
                  className={cn(
                    "group rounded-md border px-2.5 py-2 space-y-1.5 transition-all duration-300",
                    justMapped
                      ? "bg-green-500/10 border-green-500/30 scale-95 opacity-50"
                      : "bg-background"
                  )}
                >
                  <p className="text-xs leading-relaxed">{q.text}</p>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className={cn(
                        "flex-1 h-6 text-[10px] gap-1 transition-all",
                        isMapping
                          ? "bg-green-600 text-white"
                          : hasSelection
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50"
                      )}
                      disabled={!hasSelection || isMapping}
                      onClick={() => handleMap(q.id)}
                      title={hasSelection ? "Mapiraj selektovani tekst na ovo pitanje" : "Prvo selektujte tekst u zakonu"}
                    >
                      {isMapping ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Mapiranje...
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3 w-3" />
                          Mapiraj selekciju
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemove(q.id)}
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
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
                    <div key={q.id} className="rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 flex items-start gap-1.5">
                      <Check className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground line-through opacity-70">{q.text}</p>
                        {q.moduleCount && (
                          <span className="text-[10px] text-green-600 dark:text-green-500">{q.moduleCount} modula</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => handleRemove(q.id)}
                      >
                        <X className="h-2.5 w-2.5 text-muted-foreground" />
                      </Button>
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

      {/* Edit Questions Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-5 w-5 text-primary" />
              Uredi listu ispitnih pitanja
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Zalijepite pitanja iz Worda ili drugog dokumenta. Svaki red = jedno pitanje.
              Numeracija (1. 2. 3.) će biti automatski uklonjena.
            </p>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[250px] resize-y font-mono leading-relaxed"
              placeholder={"Zalijepite listu pitanja ovdje...\n\n1. Prvo ispitno pitanje\n2. Drugo ispitno pitanje\n3. Treće ispitno pitanje"}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {editText.split("\n").filter(l => l.trim().length > 3).length} pitanja detektovano
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                  Otkaži
                </Button>
                <Button onClick={handleSaveEdit} disabled={!editText.trim()}>
                  <ClipboardPaste className="h-4 w-4 mr-1.5" />
                  Sačuvaj listu
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
