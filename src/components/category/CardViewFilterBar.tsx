import { Filter, X, Plus, Upload, CheckSquare } from "lucide-react";
import { MASTERY_LEVELS } from "@/lib/mastery";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARD_TAGS } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";

interface Props {
  filterType: "all" | "essay" | "flash" | "mnemonic";
  onChangeType: (v: "all" | "essay" | "flash" | "mnemonic") => void;
  filterTag: string;
  onChangeTag: (v: string) => void;
  masteryFilter?: number | null;
  onClearMasteryFilter?: () => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  filteredCount: number;
  totalCount: number;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  onBulkImport: () => void;
  onAddCard: () => void;
  onDelete?: (id: string) => void;
}

export default function CardViewFilterBar({
  filterType, onChangeType,
  filterTag, onChangeTag,
  masteryFilter, onClearMasteryFilter,
  hasActiveFilters, onResetFilters,
  filteredCount, totalCount,
  selectionMode, onToggleSelectionMode,
  onBulkImport, onAddCard, onDelete,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card p-2.5">
      <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <div className="flex items-center gap-0.5 rounded-md border p-0.5">
        {(["all", "essay", "flash", "mnemonic"] as const).map(t => (
          <button
            key={t}
            onClick={() => onChangeType(t)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
              filterType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "all" ? "Sve" : t === "essay" ? "Esej" : t === "flash" ? "Blic" : "Mnemo"}
          </button>
        ))}
      </div>

      <Select value={filterTag} onValueChange={onChangeTag}>
        <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs">
          <SelectValue placeholder="Tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Svi tagovi</SelectItem>
          {CARD_TAGS.map(tag => (
            <SelectItem key={tag.id} value={tag.id} className="text-xs">{tag.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {masteryFilter !== null && masteryFilter !== undefined && (
        <button
          onClick={onClearMasteryFilter}
          className="flex items-center gap-1.5 h-7 px-2 rounded-md border text-[10px] font-medium hover:bg-secondary transition-colors"
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MASTERY_LEVELS[masteryFilter].color }} />
          {MASTERY_LEVELS[masteryFilter].label}
          <X className="h-3 w-3" />
        </button>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-[10px] text-muted-foreground">{filteredCount}/{totalCount}</span>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onResetFilters} className="h-6 px-2 text-[10px] gap-1">
            <X className="h-3 w-3" /> Reset
          </Button>
        )}
        {onDelete && (
          <Button
            variant={selectionMode ? "secondary" : "outline"}
            size="sm"
            onClick={onToggleSelectionMode}
            className="h-7 gap-1.5 text-xs"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectionMode ? "Otkaži" : "Izaberi"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onBulkImport} className="h-7 gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" /> Masovni Import
        </Button>
        <Button variant="default" size="sm" onClick={onAddCard} className="h-7 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nova kartica
        </Button>
      </div>
    </div>
  );
}
