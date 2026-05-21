import { ArrowLeft, Filter, FolderOpen, Zap, Clock, List, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { MnemonicCard, HookType } from "../mnemonic-storage";
import { Button } from "@/components/ui/button";
import {
  buildCategoryTree, buildHookTypeCounts, filterTestable,
  type TestFilter,
} from "../test-tree";

interface Props {
  allTestable: MnemonicCard[];
  uuidToName: Record<string, string>;
  onBack: () => void;
  onStart: (cards: MnemonicCard[]) => void;
}

const HOOK_TYPE_CONFIG: Record<HookType, { label: string; icon: typeof Clock }> = {
  rokovi: { label: "Rokovi", icon: Clock },
  nabrajanja: { label: "Nabrajanja", icon: List },
  ostalo: { label: "Ostalo", icon: MoreHorizontal },
};

export default function MnemonicTestSelector({ allTestable, uuidToName, onBack, onStart }: Props) {
  const [filter, setFilter] = useState<TestFilter>({ category: null, subcategory: null, hookType: null });

  const categoryTree = useMemo(() => buildCategoryTree(allTestable), [allTestable]);
  const hookTypeCounts = useMemo(() => buildHookTypeCounts(allTestable), [allTestable]);
  const filtered = useMemo(() => filterTestable(allTestable, filter), [allTestable, filter]);
  const subcategories = filter.category ? [...(categoryTree[filter.category] || [])] : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Nazad
      </button>

      <div>
        <h2 className="imperial-title flex items-center gap-3">
          <Filter className="h-7 w-7 text-primary" /> Izbor drila
        </h2>
        <p className="text-muted-foreground mt-1">Filtriraj kartice za testiranje.</p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" /> Predmet
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(f => ({ ...f, category: null, subcategory: null }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filter.category ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
          >
            Svi ({allTestable.length})
          </button>
          {Object.entries(categoryTree).map(([cat]) => {
            const count = allTestable.filter(c => c.categoryId === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilter(f => ({ ...f, category: f.category === cat ? null : cat, subcategory: null }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter.category === cat ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
              >
                {uuidToName[cat] || cat} ({count})
              </button>
            );
          })}
        </div>

        {subcategories.length > 0 && (
          <div className="pl-3 border-l-2 border-primary/20 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kategorija</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter(f => ({ ...f, subcategory: null }))}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${!filter.subcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
              >
                Sve
              </button>
              {subcategories.map(sub => {
                const count = allTestable.filter(c => c.categoryId === filter.category && c.subcategoryId === sub).length;
                return (
                  <button
                    key={sub}
                    onClick={() => setFilter(f => ({ ...f, subcategory: f.subcategory === sub ? null : sub }))}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${filter.subcategory === sub ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
                  >
                    {uuidToName[sub] || sub} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tip kuke</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(f => ({ ...f, hookType: null }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filter.hookType ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
          >
            Svi tipovi
          </button>
          {(["rokovi", "nabrajanja", "ostalo"] as HookType[]).map(ht => {
            const conf = HOOK_TYPE_CONFIG[ht];
            const Icon = conf.icon;
            return (
              <button
                key={ht}
                onClick={() => setFilter(f => ({ ...f, hookType: f.hookType === ht ? null : ht }))}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter.hookType === ht ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
              >
                <Icon className="h-3 w-3" />
                {conf.label} ({hookTypeCounts[ht]})
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{filtered.length} kartica u drilu</p>
          <p className="text-xs text-muted-foreground">
            {filter.category ? (uuidToName[filter.category] || filter.category) : "Svi predmeti"}
            {filter.subcategory ? ` › ${uuidToName[filter.subcategory] || filter.subcategory}` : ""}
            {filter.hookType ? ` • ${HOOK_TYPE_CONFIG[filter.hookType].label}` : ""}
          </p>
        </div>
        <Button onClick={() => onStart(filtered)} disabled={filtered.length === 0} className="gap-2">
          <Zap className="h-4 w-4" /> Započni ({filtered.length})
        </Button>
      </div>
    </div>
  );
}
