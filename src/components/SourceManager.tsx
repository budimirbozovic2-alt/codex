import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Library,
  Search,
  AlertTriangle,
  Plus,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  X,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/* ─── Monument type ─── */
interface Monument {
  name: string;
  laws: { label: string; count: number }[];
  totalCards: number;
  mode: DepthMode;
  override: "A" | "B" | null;
  category: string | null;
}

export default function SourceManager() {
  const { cards, categories } = useCardContext();
  const [sources, setSources] = useState<Source[]>([]);
  const [registry, setRegistry] = useState<SourceRegistry>(loadSourceRegistry);
  const [search, setSearch] = useState("");

  // Dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLabel, setAssignLabel] = useState("");
  const [assignTarget, setAssignTarget] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [addLawOpen, setAddLawOpen] = useState(false);
  const [addLawMonument, setAddLawMonument] = useState("");

  // Expanded monuments
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSources().then(setSources);
  }, []);

  const aliasMap = useMemo(() => buildAliasMap(registry), [registry]);
  const sourceMap = useMemo(() => buildSourceMap(sources), [sources]);

  /* All raw labels with counts */
  const allRawLabels = useMemo(() => {
    const labels = new Map<string, number>();
    for (const card of cards) {
      if (!card.sourceId) continue;
      const src = sourceMap.get(card.sourceId);
      if (!src) continue;
      labels.set(src.label, (labels.get(src.label) || 0) + 1);
    }
    return labels;
  }, [cards, sourceMap]);

  /* Unmapped labels: those without an alias entry */
  const unmappedLabels = useMemo(() => {
    const result: { label: string; count: number }[] = [];
    for (const [label, count] of allRawLabels) {
      if (!aliasMap.has(label)) {
        result.push({ label, count });
      }
    }
    return result.sort((a, b) => b.count - a.count);
  }, [allRawLabels, aliasMap]);

  /* Monuments: group aliases by masterSource */
  const monuments = useMemo(() => {
    const groups = new Map<string, { label: string; count: number }[]>();
    for (const alias of registry.aliases) {
      const count = allRawLabels.get(alias.rawLabel) || 0;
      if (!groups.has(alias.masterSource)) {
        groups.set(alias.masterSource, []);
      }
      groups.get(alias.masterSource)!.push({ label: alias.rawLabel, count });
    }

    const uniqueSources = getUniqueSources(cards, sourceMap, aliasMap);
    const result: Monument[] = [];

    for (const [name, laws] of groups) {
      const totalCards = laws.reduce((s, l) => s + l.count, 0);

      // Use direct source.category field (v6 schema)
      const matchingCat = (() => {
        // Check if any source in this monument group has a direct category
        for (const law of laws) {
          const src = sources.find(s => s.label === law.label);
          if (src?.category) return src.category;
        }
        // Fallback: infer from linked cards
        return categories.find((cat) =>
          cards.some((c) => {
            if (c.category !== cat || !c.sourceId) return false;
            const src = sourceMap.get(c.sourceId);
            if (!src) return false;
            const master = aliasMap.get(src.label) || src.label;
            return master === name;
          })
        );
      })();

      const override =
        registry.overrides.find((o) => o.category === matchingCat)
          ?.forcedMode || null;
      const mode = matchingCat
        ? getCategoryDepthMode(
            matchingCat,
            cards,
            sourceMap,
            aliasMap,
            registry
          )
        : "A";

      result.push({
        name,
        laws: laws.sort((a, b) => b.count - a.count),
        totalCards,
        mode,
        override,
        category: matchingCat || null,
      });
    }

    return result.sort((a, b) => b.totalCards - a.totalCards);
  }, [registry, allRawLabels, cards, sourceMap, aliasMap, categories]);

  /* Master source names for assign dropdown */
  const monumentNames = useMemo(
    () => monuments.map((m) => m.name).sort(),
    [monuments]
  );

  /* Filtered */
  const filteredUnmapped = useMemo(() => {
    if (!search) return unmappedLabels;
    const q = search.toLowerCase();
    return unmappedLabels.filter((l) => l.label.toLowerCase().includes(q));
  }, [unmappedLabels, search]);

  const filteredMonuments = useMemo(() => {
    if (!search) return monuments;
    const q = search.toLowerCase();
    return monuments.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.laws.some((l) => l.label.toLowerCase().includes(q))
    );
  }, [monuments, search]);

  /* Persist helper */
  const persistRegistry = useCallback((next: SourceRegistry) => {
    setRegistry(next);
    saveSourceRegistry(next);
  }, []);

  /* Actions */
  const handleCreateMonument = useCallback(
    (rawLabel: string, monumentName?: string) => {
      const name = monumentName?.trim() || rawLabel;
      const next = { ...registry, aliases: [...registry.aliases] };
      next.aliases = next.aliases.filter((a) => a.rawLabel !== rawLabel);
      next.aliases.push({ rawLabel, masterSource: name });
      persistRegistry(next);
    },
    [registry, persistRegistry]
  );

  const handleAssignToMonument = useCallback(() => {
    if (!assignLabel || !assignTarget) return;
    const next = { ...registry, aliases: [...registry.aliases] };
    next.aliases = next.aliases.filter((a) => a.rawLabel !== assignLabel);
    next.aliases.push({ rawLabel: assignLabel, masterSource: assignTarget });
    persistRegistry(next);
    setAssignOpen(false);
    setAssignLabel("");
    setAssignTarget("");
  }, [registry, assignLabel, assignTarget, persistRegistry]);

  const handleAddLawToMonument = useCallback(
    (rawLabel: string) => {
      if (!addLawMonument) return;
      const next = { ...registry, aliases: [...registry.aliases] };
      next.aliases = next.aliases.filter((a) => a.rawLabel !== rawLabel);
      next.aliases.push({ rawLabel, masterSource: addLawMonument });
      persistRegistry(next);
    },
    [registry, addLawMonument, persistRegistry]
  );

  const handleRemoveLaw = useCallback(
    (rawLabel: string) => {
      const next = {
        ...registry,
        aliases: registry.aliases.filter((a) => a.rawLabel !== rawLabel),
      };
      persistRegistry(next);
    },
    [registry, persistRegistry]
  );

  const handleSetMode = useCallback(
    (category: string | null, mode: "A" | "B") => {
      if (!category) return;
      const next = { ...registry, overrides: [...registry.overrides] };
      const idx = next.overrides.findIndex((o) => o.category === category);
      if (idx >= 0) {
        next.overrides[idx] = { category, forcedMode: mode };
      } else {
        next.overrides.push({ category, forcedMode: mode });
      }
      persistRegistry(next);
    },
    [registry, persistRegistry]
  );

  const handleCreateDialog = useCallback(() => {
    if (!createName.trim() || !createLabel) return;
    handleCreateMonument(createLabel, createName.trim());
    setCreateOpen(false);
    setCreateName("");
    setCreateLabel("");
  }, [createName, createLabel, handleCreateMonument]);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Stats
  const totalLaws = registry.aliases.length;

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 rounded-xl text-center">
          <p className="text-2xl font-bold">{monuments.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Spomenika</p>
        </div>
        <div className="glass-card p-4 rounded-xl text-center">
          <p className="text-2xl font-bold">{totalLaws}</p>
          <p className="text-xs text-muted-foreground mt-1">Zakona</p>
        </div>
        <div className="glass-card p-4 rounded-xl text-center">
          <p className="text-2xl font-bold text-yellow-500">
            {unmappedLabels.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Neprepoznatih</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pretraži izvore i spomenike..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Unmapped Sources */}
      {filteredUnmapped.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <h3 className="text-lg font-bold">Neprepoznati izvori</h3>
            <Badge
              variant="secondary"
              className="text-xs bg-yellow-500/10 text-yellow-600"
            >
              {filteredUnmapped.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Ovi zakoni postoje u bazi ali nisu dodijeljeni nijednom spomeniku.
          </p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {filteredUnmapped.map(({ label, count }) => (
              <div
                key={label}
                className="flex items-center gap-3 p-3 rounded-lg glass-card border-yellow-500/20"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{label}</p>
                </div>
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  {count} modula
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setCreateLabel(label);
                    setCreateName(label);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Kreiraj Spomenik
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setAssignLabel(label);
                    setAssignTarget("");
                    setAssignOpen(true);
                  }}
                >
                  <ArrowRight className="h-3 w-3" />
                  Dodaj u postojeći
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monuments */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          Spomenici
          {monuments.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {monuments.length}
            </Badge>
          )}
        </h3>

        {filteredMonuments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {monuments.length === 0
              ? 'Nema spomenika. Koristi "Kreiraj Spomenik" iznad.'
              : "Nema rezultata pretrage."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMonuments.map((monument) => {
              const isExpanded = expanded.has(monument.name);
              return (
                <div
                  key={monument.name}
                  className="glass-card rounded-xl border overflow-hidden"
                >
                  {/* Monument header */}
                  <button
                    onClick={() => toggleExpand(monument.name)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/30 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <Landmark className="h-4 w-4 flex-shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">
                        {monument.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {monument.laws.length}{" "}
                        {monument.laws.length === 1 ? "zakon" : "zakona"} •{" "}
                        {monument.totalCards} modula •{" "}
                        {monument.mode === "A" ? "Grupni" : "Detaljni"} prikaz
                        {monument.override ? " (ručno)" : ""}
                      </p>
                    </div>
                    <Badge
                      variant={monument.mode === "A" ? "default" : "secondary"}
                      className="text-xs flex-shrink-0"
                    >
                      Mod {monument.mode}
                    </Badge>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                      {/* Laws list */}
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Zakoni u ovom spomeniku
                        </p>
                        {monument.laws.map((law) => (
                          <div
                            key={law.label}
                            className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-secondary/30 transition-colors group"
                          >
                            <span className="text-sm flex-1 truncate">
                              {law.label}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-xs flex-shrink-0"
                            >
                              {law.count} modula
                            </Badge>
                            {monument.laws.length > 1 && (
                              <button
                                onClick={() => handleRemoveLaw(law.label)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                                title="Ukloni iz spomenika"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 mt-1 text-muted-foreground"
                          onClick={() => {
                            setAddLawMonument(monument.name);
                            setAddLawOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          Dodaj novi zakon u ovaj spomenik
                        </Button>
                      </div>

                      {/* A/B mode selector */}
                      {monument.category && (
                        <div className="space-y-2 pt-2 border-t border-border/30">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Prikaz unutar spomenika
                          </p>
                          <div className="flex flex-col gap-1.5">
                            <label
                              className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                                monument.mode === "A"
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-transparent hover:bg-secondary/30"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`mode-${monument.name}`}
                                checked={monument.mode === "A"}
                                onChange={() =>
                                  handleSetMode(monument.category, "A")
                                }
                                className="accent-[hsl(var(--primary))]"
                              />
                              <div>
                                <p className="text-sm font-semibold">
                                  Grupni prikaz (Više izvora)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Svaki zakon je posebna kolona u spomeniku
                                </p>
                              </div>
                            </label>
                            <label
                              className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                                monument.mode === "B"
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-transparent hover:bg-secondary/30"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`mode-${monument.name}`}
                                checked={monument.mode === "B"}
                                onChange={() =>
                                  handleSetMode(monument.category, "B")
                                }
                                className="accent-[hsl(var(--primary))]"
                              />
                              <div>
                                <p className="text-sm font-semibold">
                                  Detaljni prikaz (Jedan obiman izvor)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Glave/poglavlja su kolone u spomeniku
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Monument Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kreiraj novi spomenik</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Izvor{" "}
              <span className="font-semibold text-foreground">
                "{createLabel}"
              </span>{" "}
              će biti prvi zakon u novom spomeniku:
            </p>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Naziv spomenika (npr. Upravno pravo)..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Otkaži
              </Button>
              <Button
                size="sm"
                onClick={handleCreateDialog}
                disabled={!createName.trim()}
              >
                <Landmark className="h-3.5 w-3.5 mr-1.5" />
                Kreiraj
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign to existing monument dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj u postojeći spomenik</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Zakon{" "}
              <span className="font-semibold text-foreground">
                "{assignLabel}"
              </span>{" "}
              će biti dodat u:
            </p>
            <Select value={assignTarget} onValueChange={setAssignTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Izaberi spomenik..." />
              </SelectTrigger>
              <SelectContent>
                {monumentNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignOpen(false)}
              >
                Otkaži
              </Button>
              <Button
                size="sm"
                onClick={handleAssignToMonument}
                disabled={!assignTarget}
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                Dodaj
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add law to monument dialog */}
      <Dialog open={addLawOpen} onOpenChange={setAddLawOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj zakon u „{addLawMonument}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {unmappedLabels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Svi izvori su već prepoznati. Nema neprepoznatih zakona za
                dodavanje.
              </p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {unmappedLabels.map(({ label, count }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors"
                  >
                    <span className="text-sm flex-1 truncate">{label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {count} modula
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        handleAddLawToMonument(label);
                        if (
                          unmappedLabels.filter((u) => u.label !== label)
                            .length === 0
                        ) {
                          setAddLawOpen(false);
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Dodaj
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddLawOpen(false)}
              >
                Zatvori
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
