import { useMemo, useState } from "react";
import { Check, ChevronDown, Link2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Source } from "@/lib/sources-storage";

interface Props {
  allSources: Source[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}

export default function LinkedSourcesPicker({ allSources, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sourceById = useMemo(() => {
    const m = new Map<string, Source>();
    for (const s of allSources) m.set(s.id, s);
    return m;
  }, [allSources]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSources;
    return allSources.filter(s => s.title.toLowerCase().includes(q));
  }, [allSources, query]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };

  const remove = (id: string) => onChange(selectedIds.filter(x => x !== id));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            Povezani izvori
            <ChevronDown className="h-3 w-3 opacity-60" />
            {selectedIds.length > 0 && (
              <span className="ml-1 px-1 rounded bg-primary/15 text-primary text-[10px]">{selectedIds.length}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2 border-b border-border">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Pretraži izvore..."
              className="h-8 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs italic text-muted-foreground text-center">
                Nema izvora za ovaj predmet.
              </p>
            ) : (
              filtered.map(s => {
                const checked = selectedIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-accent/50 text-xs"
                  >
                    <span className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                      {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedIds.map(id => {
        const s = sourceById.get(id);
        if (!s) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md border border-border bg-secondary/40 text-[11px]"
          >
            <span className="truncate max-w-[160px]">{s.title}</span>
            <button
              type="button"
              onClick={() => remove(id)}
              className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Ukloni ${s.title}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
