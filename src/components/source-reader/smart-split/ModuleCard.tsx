import { ChevronDown, ChevronUp, Scissors, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import RichTextEditor from "@/components/RichTextEditor";
import { cn } from "@/lib/utils";
import { htmlToPlain, splitHtmlIntoBlocks, type SelectionModule } from "@/lib/selection-split-engine";
import type { defaultEdit } from "@/lib/split-wizard-build";
import { CuttingView } from "./CuttingView";
import { ModuleTags } from "./ModuleTags";

type EditDraft = ReturnType<typeof defaultEdit>;

interface Props {
  index: number;
  total: number;
  mod: SelectionModule;
  edit: EditDraft;
  isCutting: boolean;
  onMove: (from: number, to: number) => void;
  onDelete: (i: number) => void;
  onToggleCut: (i: number) => void;
  onCut: (moduleIdx: number, blockIdx: number) => void;
  onCancelCut: () => void;
  onUpdateModule: (i: number, patch: Partial<SelectionModule>) => void;
  onUpdateEdit: (i: number, patch: Partial<EditDraft>) => void;
}

/** Single module card inside the wizard's module list. */
export function ModuleCard({
  index: i, total, mod, edit, isCutting,
  onMove, onDelete, onToggleCut, onCut, onCancelCut,
  onUpdateModule, onUpdateEdit,
}: Props) {
  const blockCount = splitHtmlIntoBlocks(mod.contentHtml).length;

  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3", edit.skipped && "opacity-60")}>
      {/* Header: move + title + scissors + delete */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] flex-shrink-0">Modul {i + 1}</Badge>
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => onMove(i, i - 1)}
            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors"
            title="Pomjeri gore"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={i === total - 1}
            onClick={() => onMove(i, i + 1)}
            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors"
            title="Pomjeri dolje"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <RichTextEditor
            value={edit.question}
            onChange={(v) => onUpdateEdit(i, { question: v })}
            placeholder={mod.title || "Naziv cjeline..."}
            minimal
          />
        </div>
        <button
          type="button"
          onClick={() => onToggleCut(i)}
          disabled={edit.skipped || blockCount < 2}
          className={cn(
            "p-1 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
            isCutting
              ? "bg-warning/20 text-warning"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
          title={blockCount < 2 ? "Nema dovoljno blokova za rezanje" : "Režim rezanja"}
          aria-label="Režim rezanja"
        >
          <Scissors className="h-4 w-4" />
        </button>
        {total > 1 && (
          <button
            type="button"
            onClick={() => onDelete(i)}
            className="text-muted-foreground hover:text-destructive p-1"
            title="Obriši cjelinu"
            aria-label={`Obriši cjelinu ${i + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content: cutting view OR rich-text editor */}
      {isCutting ? (
        <CuttingView
          blocks={splitHtmlIntoBlocks(mod.contentHtml)}
          onCut={(bIdx) => onCut(i, bIdx)}
          onCancel={onCancelCut}
        />
      ) : (
        <div className={cn(edit.skipped && "opacity-50 pointer-events-none")}>
          <RichTextEditor
            value={mod.contentHtml}
            onChange={(html) => {
              const plain = htmlToPlain(html);
              onUpdateModule(i, { contentHtml: html, contentText: plain, plainSnippet: plain.trim() });
            }}
            placeholder="Sadržaj ove cjeline odgovora..."
          />
        </div>
      )}

      <ModuleTags edit={edit} onUpdate={(patch) => onUpdateEdit(i, patch)} />
    </div>
  );
}
