import { Plus, X, FileText } from "lucide-react";
import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CardType } from "@/hooks/useCardActions";
import type { CategoryRecord } from "@/lib/db";
import type { FrequencyTag, CardSourceType } from "@/lib/spaced-repetition";
import { FREQUENCY_TAGS, SOURCE_TYPES } from "@/lib/spaced-repetition";

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
  linkedGazetteInfo?: string | null;
  sourceId?: string;
  categoryRecords?: CategoryRecord[];
  frequencyTag: FrequencyTag | "";
  setFrequencyTag: (v: FrequencyTag | "") => void;
  sourceType: CardSourceType | "";
  setSourceType: (v: CardSourceType | "") => void;
}

const MetadataSection = memo(function MetadataSection({
  cardType, categoryId, setCategoryId, subcategoryId, setSubcategoryId, chapterId, setChapterId,
  categories, availableSubs, availableChapters,
  newCategory, setNewCategory, showNewCat, setShowNewCat,
  newSubcategory, setNewSubcategory, showNewSub, setShowNewSub,
  newChapter, setNewChapter, showNewChapter, setShowNewChapter,
  linkedGazetteInfo, sourceId, categoryRecords = [],
  frequencyTag, setFrequencyTag, sourceType, setSourceType,
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

      {/* Frequency Tag */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Frekventnost na ispitu</label>
        <Select value={frequencyTag || "__none__"} onValueChange={(v) => setFrequencyTag(v === "__none__" ? "" : v as FrequencyTag)}>
          <SelectTrigger className="bg-background"><SelectValue placeholder="Nije označeno" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nije označeno</SelectItem>
            {FREQUENCY_TAGS.map((ft) => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Source Type */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Tip izvora</label>
        <Select value={sourceType || "__none__"} onValueChange={(v) => setSourceType(v === "__none__" ? "" : v as CardSourceType)}>
          <SelectTrigger className="bg-background"><SelectValue placeholder="Nije označeno" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nije označeno</SelectItem>
            {SOURCE_TYPES.map((st) => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
});

export default MetadataSection;
