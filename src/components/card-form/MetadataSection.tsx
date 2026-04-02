import { Plus, X, FileText } from "lucide-react";
import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CardType } from "@/hooks/useCardActions";
import type { CategoryRecord } from "@/lib/db";

interface MetadataSectionProps {
  cardType: CardType;
  categoryId: string;
  setCategoryId: (v: string) => void;
  subcategoryId: string;
  setSubcategoryId: (v: string) => void;
  chapterId: string;
  setChapterId: (v: string) => void;
  categories: string[];
  availableSubs: { id: string; name: string }[];
  availableChapters: { id: string; name: string }[];
  newCategory: string;
  setNewCategory: (v: string) => void;
  showNewCat: boolean;
  setShowNewCat: (v: boolean) => void;
  newSubcategory: string;
  setNewSubcategory: (v: string) => void;
  showNewSub: boolean;
  setShowNewSub: (v: boolean) => void;
  newChapter: string;
  setNewChapter: (v: string) => void;
  showNewChapter: boolean;
  setShowNewChapter: (v: boolean) => void;
  /** Read-only gazette info from linked source */
  linkedGazetteInfo?: string | null;
  /** Source ID for backlink */
  sourceId?: string;
  /** Category records for UUID → name resolution */
  categoryRecords?: CategoryRecord[];
}

const MetadataSection = memo(function MetadataSection({
  cardType, categoryId, setCategoryId, subcategoryId, setSubcategoryId, chapterId, setChapterId,
  categories, availableSubs, availableChapters,
  newCategory, setNewCategory, showNewCat, setShowNewCat,
  newSubcategory, setNewSubcategory, showNewSub, setShowNewSub,
  newChapter, setNewChapter, showNewChapter, setShowNewChapter,
  linkedGazetteInfo, sourceId, categoryRecords = [],
}: MetadataSectionProps) {
  const catNameMap = Object.fromEntries(categoryRecords.map(r => [r.id, r.name]));
  return (
    <div className="space-y-4 rounded-xl border bg-card/50 p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Metapodaci</p>

      {/* Linked source gazette info (read-only) */}
      {linkedGazetteInfo && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
          <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Službeni list</p>
            <p className="text-sm text-foreground truncate" title={linkedGazetteInfo}>{linkedGazetteInfo}</p>
          </div>
        </div>
      )}

      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
        {!showNewCat ? (
          <div className="flex gap-2">
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(""); }}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{catNameMap[c] || c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewCat(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova kategorija..." className="bg-background" />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewCat(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Subcategory */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Podkategorija (opciono)</label>
        <Select value={subcategoryId || "__none__"} onValueChange={(v) => setSubcategoryId(v === "__none__" ? "" : v)}>
          <SelectTrigger className="bg-background"><SelectValue placeholder="Bez podkategorije" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Bez podkategorije</SelectItem>
            {availableSubs.map((sc) => <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Chapter — cascading: only when subcategory selected */}
      {cardType === "essay" && subcategoryId && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Glava (opciono)</label>
          <Select value={chapterId || "__none__"} onValueChange={(v) => setChapterId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Bez glave" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Bez glave</SelectItem>
              {availableChapters.map((ch) => <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {availableChapters.length === 0 && (
            <p className="text-[10px] text-muted-foreground/60">Koristite "Struktura" dugme u prikazu kategorije za dodavanje glava.</p>
          )}
        </div>
      )}
    </div>
  );
});

export default MetadataSection;
