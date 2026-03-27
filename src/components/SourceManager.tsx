import { useState, useEffect, useMemo, useCallback } from "react";
import { Library, Merge, ToggleLeft, ToggleRight, Search, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCardContext } from "@/contexts/AppContext";
import { loadSources, type Source } from "@/lib/sources-storage";
import {
  loadSourceRegistry,
  saveSourceRegistry,
  buildAliasMap,
  buildSourceMap,
  getUniqueSources,
  getCategoryDepthMode,
  type SourceRegistry,
  type DepthMode,
} from "@/lib/source-registry";

export default function SourceManager() {
  const { cards, categories } = useCardContext();
  const [sources, setSources] = useState<Source[]>([]);
  const [registry, setRegistry] = useState<SourceRegistry>(loadSourceRegistry);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");

  useEffect(() => {
    loadSources().then(setSources);
  }, []);

  const aliasMap = useMemo(() => buildAliasMap(registry), [registry]);
  const sourceMap = useMemo(() => buildSourceMap(sources), [sources]);

  const uniqueSources = useMemo(
    () => getUniqueSources(cards, sourceMap, aliasMap),
    [cards, sourceMap, aliasMap],
  );

  // All raw labels across all cards (with source)
  const allRawLabels = useMemo(() => {
    const labels = new Map<string, number>();
    for (const card of cards) {
      if (!card.sourceId) continue;
      const src = sourceMap.get(card.sourceId);
      if (!src) continue;
      labels.set(src.label, (labels.get(src.label) || 0) + 1);
    }
    return Array.from(labels.entries())
      .map(([label, count]) => ({
        label,
        masterSource: aliasMap.get(label) || label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [cards, sourceMap, aliasMap]);

  const filteredLabels = useMemo(() => {
    if (!search) return allRawLabels;
    const q = search.toLowerCase();
    return allRawLabels.filter(
      l => l.label.toLowerCase().includes(q) || l.masterSource.toLowerCase().includes(q),
    );
  }, [allRawLabels, search]);

  // Category depth info
  const categoryDepths = useMemo(() => {
    return categories
      .filter(cat => cards.some(c => c.category === cat && c.sourceId))
      .map(cat => ({
        category: cat,
        mode: getCategoryDepthMode(cat, cards, sourceMap, aliasMap, registry),
        override: registry.overrides.find(o => o.category === cat)?.forcedMode || null,
      }));
  }, [categories, cards, sourceMap, aliasMap, registry]);

  const persistRegistry = useCallback((next: SourceRegistry) => {
    setRegistry(next);
    saveSourceRegistry(next);
  }, []);

  const handleMerge = useCallback(() => {
    if (!mergeName.trim() || selected.size === 0) return;
    const next = { ...registry, aliases: [...registry.aliases] };
    // Remove existing aliases for selected labels, then add new ones
    next.aliases = next.aliases.filter(a => !selected.has(a.rawLabel));
    for (const rawLabel of selected) {
      next.aliases.push({ rawLabel, masterSource: mergeName.trim() });
    }
    persistRegistry(next);
    setSelected(new Set());
    setMergeOpen(false);
    setMergeName("");
  }, [registry, selected, mergeName, persistRegistry]);

  const handleRemoveAlias = useCallback((rawLabel: string) => {
    const next = {
      ...registry,
      aliases: registry.aliases.filter(a => a.rawLabel !== rawLabel),
    };
    persistRegistry(next);
  }, [registry, persistRegistry]);

  const handleToggleOverride = useCallback((category: string, currentMode: DepthMode) => {
    const next = { ...registry, overrides: [...registry.overrides] };
    const idx = next.overrides.findIndex(o => o.category === category);
    const newMode: "A" | "B" | null =
      currentMode === "A" ? "B" : currentMode === "B" ? null : "A";

    if (idx >= 0) {
      if (newMode === null) {
        next.overrides.splice(idx, 1);
      } else {
        next.overrides[idx] = { category, forcedMode: newMode };
      }
    } else if (newMode !== null) {
      next.overrides.push({ category, forcedMode: newMode });
    }
    persistRegistry(next);
  }, [registry, persistRegistry]);

  const toggleSelect = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Stats
  const totalAliases = registry.aliases.length;
  const modeACats = categoryDepths.filter(c => c.mode === "A").length;
  const modeBCats = categoryDepths.filter(c => c.mode === "B").length;

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border bg-card text-center">
          <p className="text-2xl font-semibold">{uniqueSources.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Master izvora</p>
        </div>
        <div className="p-4 rounded-xl border bg-card text-center">
          <p className="text-2xl font-semibold">{totalAliases}</p>
          <p className="text-xs text-muted-foreground mt-1">Alias mapiranja</p>
        </div>
        <div className="p-4 rounded-xl border bg-card text-center">
          <p className="text-2xl font-semibold">
            {modeACats}A / {modeBCats}B
          </p>
          <p className="text-xs text-muted-foreground mt-1">Kategorija po modu</p>
        </div>
      </div>

      {/* Section 1: Source labels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            Izvori
          </h3>
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMergeName("");
                setMergeOpen(true);
              }}
              className="gap-1.5"
            >
              <Merge className="h-3.5 w-3.5" />
              Spoji ({selected.size})
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži izvore..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {filteredLabels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {cards.some(c => c.sourceId) ? "Nema rezultata pretrage" : "Kartice nemaju povezane izvore"}
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredLabels.map(({ label, masterSource, count }) => {
              const isAliased = label !== masterSource;
              const isSelected = selected.has(label);
              return (
                <div
                  key={label}
                  onClick={() => toggleSelect(label)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-secondary/40"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                  }`}>
                    {isSelected && <div className="w-2 h-2 bg-primary-foreground rounded-sm" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{label}</p>
                    {isAliased && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        → {masterSource}
                        <button
                          onClick={e => { e.stopPropagation(); handleRemoveAlias(label); }}
                          className="ml-2 text-destructive hover:underline"
                        >
                          ukloni
                        </button>
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {count} kartica
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Category Depth Overrides */}
      {categoryDepths.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Dubina po kategoriji
          </h3>
          <p className="text-xs text-muted-foreground">
            Mod A = Više izvora (L1: Izvor → L2: Potkategorija). Mod B = Duboki pregled (L1: Potkategorija → L2: Glava).
          </p>
          <div className="space-y-1">
            {categoryDepths.map(({ category, mode, override }) => (
              <div
                key={category}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{category}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {override ? `Ručno: Mod ${mode}` : `Auto: Mod ${mode}`}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleOverride(category, mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-secondary transition-colors"
                >
                  {mode === "A" ? (
                    <ToggleRight className="h-4 w-4 text-primary" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                  Mod {mode}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Merge Dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Spoji u Master izvor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Odabrani izvori ({selected.size}) će biti mapirani na jedan Master izvor:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selected).map(label => (
                <Badge key={label} variant="outline" className="text-xs">
                  {label}
                </Badge>
              ))}
            </div>
            <Input
              value={mergeName}
              onChange={e => setMergeName(e.target.value)}
              placeholder="Naziv Master izvora..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setMergeOpen(false)}>
                Otkaži
              </Button>
              <Button size="sm" onClick={handleMerge} disabled={!mergeName.trim()}>
                <Merge className="h-3.5 w-3.5 mr-1.5" />
                Spoji
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
