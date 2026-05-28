import { ArrowLeft, Wand2, FileQuestion, List, X, Pencil, Type } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Source, SourceKind } from "@/lib/db-types";
import { SourceHeader } from "./SourceHeader";
import { useSourceReaderStore, type ReaderWidth } from "@/store";

const WIDTH_OPTIONS: ReaderWidth[] = ["S", "M", "L", "XL", "Full"];

interface Props {
  source: Source;
  onBack: () => void;
  onAutoSplit: () => void;
  onAutoFormat?: () => void;
}

/**
 * Two-row header for the source reader/editor.
 *  Row 1 — Identity:  back arrow · title/meta · outline (Sadržaj) toggle.
 *  Row 2 — Tools:     edit · contextual edit-mode tools · pitanja · width selector.
 *
 * Coverage view was removed; the reader is single-mode (read/edit only).
 */
export const SourceToolbar = memo(function SourceToolbar({ source, onBack, onAutoSplit, onAutoFormat }: Props) {
  const sourceKind: SourceKind = source.sourceKind ?? "propis";
  const editMode = useSourceReaderStore(s => s.editMode);
  const setEditMode = useSourceReaderStore(s => s.setEditMode);
  const readerWidth = useSourceReaderStore(s => s.readerWidth);
  const setReaderWidth = useSourceReaderStore(s => s.setReaderWidth);
  const examOpen = useSourceReaderStore(s => s.examOpen);
  const setExamOpen = useSourceReaderStore(s => s.setExamOpen);
  const outlineOpen = useSourceReaderStore(s => s.outlineOpen);
  const setOutlineOpen = useSourceReaderStore(s => s.setOutlineOpen);
  const examQuestions = useSourceReaderStore(s => s.examQuestions);

  const pendingCount = examQuestions.filter(q => !q.done).length;

  return (
    <div className="space-y-2">
      {/* Row 1 — identity */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 shrink-0" aria-label="Nazad">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <SourceHeader source={source} />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setOutlineOpen(!outlineOpen)}
          className="gap-1.5 shrink-0"
          aria-label={outlineOpen ? "Zatvori sadržaj" : "Otvori sadržaj"}
        >
          {outlineOpen ? <X className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          {outlineOpen ? "Zatvori" : "Sadržaj"}
        </Button>
      </div>

      {/* Row 2 — tools */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={() => setEditMode(!editMode)}
          className="gap-1.5"
          title="Režim uređivanja"
        >
          <Pencil className="h-3.5 w-3.5" />
          {editMode ? "Uređivanje" : "Uredi"}
        </Button>

        {!editMode && sourceKind === "propis" && (
          <Button variant="outline" size="sm" onClick={onAutoSplit} className="gap-1.5" title="Generiši eseje iz članova">
            <Wand2 className="h-3.5 w-3.5" />
            Auto-Split
          </Button>
        )}

        {editMode && onAutoFormat && sourceKind === "propis" && (
          <Button variant="outline" size="sm" onClick={onAutoFormat} className="gap-1.5" title="Bolduj članove i nazive">
            <Type className="h-3.5 w-3.5" />
            Članovi
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!editMode && (
            <Button
              variant={examOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setExamOpen(!examOpen)}
              className="gap-1.5"
              title="Ispitna pitanja sidebar (M)"
            >
              <FileQuestion className="h-3.5 w-3.5" />
              {examOpen ? "Zatvori pitanja" : "Pitanja"}
              <kbd className="hidden sm:inline text-[9px] opacity-60 ml-0.5">M</kbd>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1">
                  {pendingCount}
                </Badge>
              )}
            </Button>
          )}

          <div
            className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5"
            role="group"
            aria-label="Širina čitača"
          >
            {WIDTH_OPTIONS.map(w => (
              <button
                key={w}
                onClick={() => setReaderWidth(w)}
                className={cn(
                  "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  readerWidth === w ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={readerWidth === w}
                title={`Širina: ${w}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
