import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Plus from "lucide-react/dist/esm/icons/plus";
import X from "lucide-react/dist/esm/icons/x";
import FileText from "lucide-react/dist/esm/icons/file-text";
import type { CardType } from "@/hooks/useCardActions";

interface MetadataSectionProps {
  cardType: CardType;
  category: string;
  setCategory: (v: string) => void;
  subcategory: string;
  setSubcategory: (v: string) => void;
  chapter: string;
  setChapter: (v: string) => void;
  categories: string[];
  availableSubs: string[];
  availableChapters: string[];
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
}

const MetadataSection = memo(function MetadataSection({
  cardType, category, setCategory, subcategory, setSubcategory, chapter, setChapter,
  categories, availableSubs, availableChapters,
  newCategory, setNewCategory, showNewCat, setShowNewCat,
  newSubcategory, setNewSubcategory, showNewSub, setShowNewSub,
  newChapter, setNewChapter, showNewChapter, setShowNewChapter,
  linkedGazetteInfo, sourceId,
}: MetadataSectionProps) {
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
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
        {!showNewSub ? (
          <div className="flex gap-2">
            <Select value={subcategory || "__none__"} onValueChange={(v) => setSubcategory(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="Bez podkategorije" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Bez podkategorije</SelectItem>
                {availableSubs.map((sc) => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewSub(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} placeholder="Nova podkategorija..." className="bg-background" />
            <Button type="button" variant="outline" size="icon" onClick={() => { setShowNewSub(false); if (newSubcategory.trim()) setSubcategory(newSubcategory.trim()); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Chapter */}
      {cardType === "essay" && (subcategory || (showNewSub && newSubcategory.trim())) && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Glava (opciono)</label>
          {!showNewChapter ? (
            <div className="flex gap-2">
              <Select value={chapter || "__none__"} onValueChange={(v) => setChapter(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="Bez glave" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Bez glave</SelectItem>
                  {availableChapters.map((ch) => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowNewChapter(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input value={newChapter} onChange={(e) => setNewChapter(e.target.value)} placeholder="Nova glava (npr. Glava 1)..." className="bg-background" />
              <Button type="button" variant="outline" size="icon" onClick={() => { setShowNewChapter(false); if (newChapter.trim()) setChapter(newChapter.trim()); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default MetadataSection;
