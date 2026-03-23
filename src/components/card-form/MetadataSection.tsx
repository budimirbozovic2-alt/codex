import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
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
}

const MetadataSection = memo(function MetadataSection({
  cardType, category, setCategory, subcategory, setSubcategory, chapter, setChapter,
  categories, availableSubs, availableChapters,
  newCategory, setNewCategory, showNewCat, setShowNewCat,
  newSubcategory, setNewSubcategory, showNewSub, setShowNewSub,
  newChapter, setNewChapter, showNewChapter, setShowNewChapter,
}: MetadataSectionProps) {
  return (
    <>
      {/* Category */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
        {!showNewCat ? (
          <div className="flex gap-2">
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
              <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
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
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova kategorija..." className="bg-card" />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewCat(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Subcategory */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Podkategorija (opciono)</label>
        {!showNewSub ? (
          <div className="flex gap-2">
            <Select value={subcategory || "__none__"} onValueChange={(v) => setSubcategory(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-card"><SelectValue placeholder="Bez podkategorije" /></SelectTrigger>
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
            <Input value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} placeholder="Nova podkategorija..." className="bg-card" />
            <Button type="button" variant="outline" size="icon" onClick={() => { setShowNewSub(false); if (newSubcategory.trim()) setSubcategory(newSubcategory.trim()); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Chapter */}
      {cardType === "essay" && (subcategory || (showNewSub && newSubcategory.trim())) && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Glava (opciono)</label>
          {!showNewChapter ? (
            <div className="flex gap-2">
              <Select value={chapter || "__none__"} onValueChange={(v) => setChapter(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-card"><SelectValue placeholder="Bez glave" /></SelectTrigger>
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
              <Input value={newChapter} onChange={(e) => setNewChapter(e.target.value)} placeholder="Nova glava (npr. Glava 1)..." className="bg-card" />
              <Button type="button" variant="outline" size="icon" onClick={() => { setShowNewChapter(false); if (newChapter.trim()) setChapter(newChapter.trim()); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
});

export default MetadataSection;
