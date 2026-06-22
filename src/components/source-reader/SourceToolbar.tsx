import { ArrowLeft, Wand2, FileQuestion, List, X, Pencil, Type, Scale } from "lucide-react";
import { memo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SaveStatusChip } from "@/components/ui/SaveStatusChip";
import { cn } from "@/lib/utils";
import type { Source, SourceKind } from "@/lib/db-types";
import { SourceHeader } from "./SourceHeader";
import { useSourceReaderStore, type ReaderWidth, type ReaderFontSize, type ReaderLineHeight, READER_FONT_SIZE_LABELS, READER_LINE_HEIGHT_LABELS } from "@/store";
import { useSourceContentSaveStore, flushSourceContentSave, getSourceContentDirty } from "@/store/useSourceContentSaveStore";

const WIDTH_OPTIONS: ReaderWidth[] = ["S", "M", "L", "XL", "Full"];

const WIDTH_LABELS: Record<ReaderWidth, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
  Full: "Puna",
};

interface Props {
  source: Source;
  onBack: () => void;
  onAutoSplit: () => void;
  onAutoFormat?: () => void;
  onAutoFormatLegal?: () => void;
}

/**
 * Two-row header for the source reader/editor.
 *  Row 1 — Identity:  back arrow · title/meta · outline (Sadržaj) toggle.
 *  Row 2 — Tools:     edit · contextual edit-mode tools · pitanja · width selector.
 *
 * Coverage view was removed; the reader is single-mode (read/edit only).
 */
export const SourceToolbar = memo(function SourceToolbar({
  source,
  onBack,
  onAutoSplit,
  onAutoFormat,
  onAutoFormatLegal,
}: Props) {
  const sourceKind: SourceKind = source.sourceKind ?? "propis";
  const {
    editMode, setEditMode,
    readerWidth, setReaderWidth,
    readerFontSize, setReaderFontSize,
    readerLineHeight, setReaderLineHeight,
    examOpen, setExamOpen,
    outlineOpen, setOutlineOpen,
  } = useSourceReaderStore(
    useShallow((s) => ({
      editMode: s.editMode,
      setEditMode: s.setEditMode,
      readerWidth: s.readerWidth,
      setReaderWidth: s.setReaderWidth,
      readerFontSize: s.readerFontSize,
      setReaderFontSize: s.setReaderFontSize,
      readerLineHeight: s.readerLineHeight,
      setReaderLineHeight: s.setReaderLineHeight,
      examOpen: s.examOpen,
      setExamOpen: s.setExamOpen,
      outlineOpen: s.outlineOpen,
      setOutlineOpen: s.setOutlineOpen,
    })),
  );

  const pendingCount = useSourceReaderStore(
    (s) => s.examQuestions.filter((q) => !q.done).length,
  );
  const saveStatus = useSourceContentSaveStore((s) => s.status);

  const handleEditToggle = useCallback(async () => {
    if (editMode && getSourceContentDirty()) {
      await flushSourceContentSave();
    }
    setEditMode(!editMode);
  }, [editMode, setEditMode]);

  return (
    <div className="space-y-2">
      {/* Row 1 — identity */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 shrink-0" aria-label="Nazad">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <SourceHeader source={source} />

        <SaveStatusChip status={saveStatus} className="shrink-0" />

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
          onClick={() => void handleEditToggle()}
          className="gap-1.5"
          title="Režim uređivanja"
        >
          <Pencil className="h-3.5 w-3.5" />
          {editMode ? "Uređivanje" : "Uredi"}
        </Button>

        {!editMode && sourceKind === "propis" && (
          <Button variant="outline" size="sm" onClick={onAutoSplit} className="gap-1.5" title="Generiši eseje iz članova">
            <Wand2 className="h-3.5 w-3.5" />
            Auto-podjela
          </Button>
        )}

        {editMode && onAutoFormat && sourceKind === "propis" && (
          <Button variant="outline" size="sm" onClick={onAutoFormat} className="gap-1.5" title="Bolduj članove i nazive">
            <Type className="h-3.5 w-3.5" />
            Članovi
          </Button>
        )}

        {editMode && onAutoFormatLegal && sourceKind === "skripta" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAutoFormatLegal}
            className="gap-1.5"
            title="Vizuelno izdvoji citate propisa (blockquote i pasusi)"
          >
            <Scale className="h-3.5 w-3.5" />
            Propisi
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!editMode && (
            <>
              <div
                className="hidden sm:flex items-center rounded-lg border border-border bg-muted/50 p-0.5"
                role="group"
                aria-label="Veličina teksta"
              >
                {(["sm", "base", "lg"] as ReaderFontSize[]).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setReaderFontSize(size)}
                    className={cn(
                      "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                      readerFontSize === size ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={readerFontSize === size}
                    title={`Veličina: ${READER_FONT_SIZE_LABELS[size]}`}
                  >
                    {size === "sm" ? "A-" : size === "lg" ? "A+" : "A"}
                  </button>
                ))}
              </div>

              <div
                className="hidden md:flex items-center rounded-lg border border-border bg-muted/50 p-0.5"
                role="group"
                aria-label="Razmak redova"
              >
                {(["normal", "relaxed", "loose"] as ReaderLineHeight[]).map(height => (
                  <button
                    key={height}
                    type="button"
                    onClick={() => setReaderLineHeight(height)}
                    className={cn(
                      "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                      readerLineHeight === height ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={readerLineHeight === height}
                    title={`Razmak: ${READER_LINE_HEIGHT_LABELS[height]}`}
                  >
                    {height === "normal" ? "1×" : height === "relaxed" ? "1.2×" : "1.4×"}
                  </button>
                ))}
              </div>

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
            </>
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
                title={`Širina: ${WIDTH_LABELS[w]}`}
              >
                {WIDTH_LABELS[w]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
