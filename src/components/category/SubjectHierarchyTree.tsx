import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Layers, FolderTree, BookMarked } from "lucide-react";
import type { SubcategoryNode } from "@/lib/db";

interface Props {
  subcategoryNodes: SubcategoryNode[];
  totalCount: number;
  subcategoryCounts: Record<string, number>;
  chapterCounts: Record<string, number>;
  selectedSubcategoryId: string;
  selectedChapterId: string;
  onSelectAll: () => void;
  onSelectSubcategory: (subId: string) => void;
  onSelectChapter: (subId: string, chapterId: string) => void;
  storageKey: string;
}

function readExpanded(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeExpanded(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore quota */
  }
}

export default function SubjectHierarchyTree({
  subcategoryNodes,
  totalCount,
  subcategoryCounts,
  chapterCounts,
  selectedSubcategoryId,
  selectedChapterId,
  onSelectAll,
  onSelectSubcategory,
  onSelectChapter,
  storageKey,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(storageKey));

  // Auto-expand parent of selected chapter so user always sees their selection
  useEffect(() => {
    if (selectedChapterId === "__all__") return;
    const parent = subcategoryNodes.find((s) =>
      (s.chapters ?? []).some((c) => c.id === selectedChapterId)
    );
    if (parent && !expanded.has(parent.id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(parent.id);
        writeExpanded(storageKey, next);
        return next;
      });
    }
  }, [selectedChapterId, subcategoryNodes, expanded, storageKey]);

  const toggleExpanded = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeExpanded(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const sortedSubcats = useMemo(
    () =>
      [...(subcategoryNodes ?? [])].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      ),
    [subcategoryNodes]
  );

  const isAllSelected =
    selectedSubcategoryId === "__all__" && selectedChapterId === "__all__";

  return (
    <nav
      role="tree"
      aria-label="Hijerarhija predmeta"
      className="rounded-lg border bg-card p-2 text-xs"
    >
      <div className="flex items-center gap-1.5 px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <FolderTree className="h-3 w-3" />
        Struktura predmeta
      </div>

      {/* Root: Sve kartice */}
      <button
        type="button"
        role="treeitem"
        aria-level={1}
        aria-selected={isAllSelected}
        onClick={onSelectAll}
        className={`group w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors ${
          isAllSelected
            ? "bg-primary/10 text-primary border-l-2 border-primary pl-[6px]"
            : "text-foreground hover:bg-muted border-l-2 border-transparent"
        }`}
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate font-medium">Sve kartice</span>
        <span
          className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
            isAllSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {totalCount}
        </span>
      </button>

      {sortedSubcats.length > 0 && (
        <ul role="group" className="mt-1 space-y-0.5">
          {sortedSubcats.map((sub) => {
            const subSelected =
              selectedSubcategoryId === sub.id && selectedChapterId === "__all__";
            const isExpanded = expanded.has(sub.id);
            const subCount = subcategoryCounts[sub.id] ?? 0;
            const chapters = [...(sub.chapters ?? [])].sort(
              (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
            );
            const hasChapters = chapters.length > 0;

            return (
              <li key={sub.id} role="none">
                <div
                  className={`group flex items-stretch rounded-md transition-colors ${
                    subSelected
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "border-l-2 border-transparent hover:bg-muted"
                  }`}
                >
                  {hasChapters ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(sub.id)}
                      aria-label={isExpanded ? "Skupi" : "Proširi"}
                      className="px-1 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="px-1 w-[22px]" aria-hidden />
                  )}
                  <button
                    type="button"
                    role="treeitem"
                    aria-level={2}
                    aria-selected={subSelected}
                    aria-expanded={hasChapters ? isExpanded : undefined}
                    onClick={() => onSelectSubcategory(sub.id)}
                    className={`flex-1 flex items-center gap-1.5 px-1 py-1.5 text-left ${
                      subSelected ? "text-primary font-medium" : "text-foreground"
                    }`}
                  >
                    <span className="flex-1 truncate">{sub.name}</span>
                    <span
                      className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                        subSelected
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {subCount}
                    </span>
                  </button>
                </div>

                {hasChapters && isExpanded && (
                  <ul role="group" className="mt-0.5 ml-5 space-y-0.5 border-l border-border pl-1">
                    {chapters.map((ch) => {
                      const chSelected = selectedChapterId === ch.id;
                      const chCount = chapterCounts[ch.id] ?? 0;
                      return (
                        <li key={ch.id} role="none">
                          <button
                            type="button"
                            role="treeitem"
                            aria-level={3}
                            aria-selected={chSelected}
                            onClick={() => onSelectChapter(sub.id, ch.id)}
                            className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors border-l-2 ${
                              chSelected
                                ? "bg-primary/10 text-primary border-primary font-medium pl-[6px]"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
                            }`}
                          >
                            <BookMarked className="h-3 w-3 shrink-0 opacity-70" />
                            <span className="flex-1 truncate">{ch.name}</span>
                            <span
                              className={`text-[10px] tabular-nums px-1 py-0.5 rounded ${
                                chSelected
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted/70 text-muted-foreground"
                              }`}
                            >
                              {chCount}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {sortedSubcats.length === 0 && (
        <p className="px-2 py-3 text-[11px] text-muted-foreground italic">
          Nema potkategorija. Dodaj ih u "Struktura i raspored".
        </p>
      )}
    </nav>
  );
}
