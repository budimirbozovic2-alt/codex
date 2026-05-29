import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { SubcategoryNode } from "@/lib/db-types";
import type { PassiveReaderFiltersAPI, TypeFilter } from "./usePassiveReaderFilters";

interface Props {
  filters: PassiveReaderFiltersAPI;
  subcategoryNodes: SubcategoryNode[];
  total: number;
  index: number;
}

export function PassiveReaderFilters({ filters, subcategoryNodes, total, index }: Props) {
  const sub = subcategoryNodes.find(s => s.id === filters.subFilter);
  const chapters = filters.subFilter === "all" ? [] : sub?.chapters ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.subFilter}
        onValueChange={(v) => { filters.setSubFilter(v); filters.setChapterFilter("all"); }}
      >
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue placeholder="Potkategorija" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Sve potkategorije</SelectItem>
          {subcategoryNodes.map(s => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.subFilter !== "all" && chapters.length > 0 && (
        <Select value={filters.chapterFilter} onValueChange={filters.setChapterFilter}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Glava" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sve glave</SelectItem>
            {chapters.map(ch => (
              <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.typeFilter} onValueChange={(v) => filters.setTypeFilter(v as TypeFilter)}>
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="Tip" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Svi tipovi</SelectItem>
          <SelectItem value="essay">Esejska</SelectItem>
          <SelectItem value="flash">Blic</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto text-xs text-muted-foreground">
        {total === 0 ? "Nema kartica" : `${index + 1} / ${total}`}
      </div>
    </div>
  );
}
