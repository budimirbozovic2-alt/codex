import { FolderTree } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SubcatLite { id: string; name: string }
interface ChapterLite { id: string; name: string }

interface Props {
  subcategories: SubcatLite[];
  chapters: ChapterLite[];
  subcategoryId: string;
  chapterId: string;
  onSubcategoryChange: (id: string) => void;
  onChapterChange: (id: string) => void;
}

/** Optional location-in-subject metadata (subcategory + chapter). */
export function MetadataPanel({
  subcategories, chapters, subcategoryId, chapterId,
  onSubcategoryChange, onChapterChange,
}: Props) {
  return (
    <div className="space-y-4 rounded-xl border bg-card/50 p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-1.5">
        <FolderTree className="h-3.5 w-3.5" />
        Metapodaci
      </p>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Podkategorija (opciono)</label>
        <Select
          value={subcategoryId || "__none__"}
          onValueChange={(v) => onSubcategoryChange(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Direktno u predmet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— direktno u predmet —</SelectItem>
            {subcategories.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {subcategoryId && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Glava (opciono)</label>
          <Select
            value={chapterId || "__none__"}
            onValueChange={(v) => onChapterChange(v === "__none__" ? "" : v)}
            disabled={chapters.length === 0}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={chapters.length === 0 ? "(nema glave)" : "Bez glave"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— bez glave —</SelectItem>
              {chapters.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
