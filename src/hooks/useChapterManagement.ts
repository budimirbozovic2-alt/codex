import { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import { toast } from "sonner";

interface UseChapterManagementParams {
  category: string;
  subcategory: string;
  cardsByChapter: Record<string, Card[]>;
  cardDerivedChapters: string[];
  onUpdateChapters: (updates: { id: string; chapter: string; chapterOrder: number }[]) => void;
}

export function useChapterManagement({
  category,
  subcategory,
  cardsByChapter,
  cardDerivedChapters,
  onUpdateChapters,
}: UseChapterManagementParams) {
  const [storedChapters, setStoredChapters] = useState<string[]>([]);
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [renamingChapter, setRenamingChapter] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const idbKey = `chapters-${category}-${subcategory}`;

  // Load stored chapters from IDB (+ migrate legacy localStorage)
  useEffect(() => {
    import("@/lib/db").then(({ idbLoadSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(setStoredChapters);
    });
    const oldKey = `memoria-chapters-${category}-${subcategory}`;
    const old = localStorage.getItem(oldKey);
    if (old) {
      try {
        const parsed = JSON.parse(old) as string[];
        if (parsed.length > 0) {
          import("@/lib/db").then(({ idbSaveSettings }) => {
            idbSaveSettings(idbKey, parsed);
          });
          setStoredChapters(parsed);
          localStorage.removeItem(oldKey);
        }
      } catch {}
    }
  }, [category, subcategory, idbKey]);

  // Preserve stored order, append any card-derived chapters not yet stored
  const allChapters = useMemo(() => {
    const ordered = [...storedChapters];
    cardDerivedChapters.forEach(ch => {
      if (!ordered.includes(ch)) ordered.push(ch);
    });
    return ordered;
  }, [cardDerivedChapters, storedChapters]);

  const handleAddChapter = useCallback(() => {
    const name = newChapterName.trim();
    if (!name) return;
    toast.success(`Glava "${name}" kreirana. Prevuci kartice u nju.`);
    setNewChapterName("");
    setAddingChapter(false);
    setStoredChapters(prev => prev.includes(name) ? prev : [...prev, name]);

    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(existing => {
        if (!existing.includes(name)) {
          idbSaveSettings(idbKey, [...existing, name]);
        }
      });
    });
  }, [newChapterName, idbKey]);

  const handleRenameChapter = useCallback((oldName: string) => {
    setRenamingChapter(oldName);
    setRenameValue(oldName);
  }, []);

  const submitRename = useCallback(() => {
    if (!renamingChapter || !renameValue.trim()) return;
    const chapterCards = cardsByChapter[renamingChapter] || [];
    const updates = chapterCards.map((c, i) => ({
      id: c.id,
      chapter: renameValue.trim(),
      chapterOrder: c.chapterOrder ?? i,
    }));
    onUpdateChapters(updates);

    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(existing => {
        const updated = existing.map(ch => ch === renamingChapter ? renameValue.trim() : ch);
        idbSaveSettings(idbKey, updated);
      });
    });

    toast.success(`Preimenovano u "${renameValue.trim()}"`);
    setRenamingChapter(null);
  }, [renamingChapter, renameValue, cardsByChapter, onUpdateChapters, idbKey]);

  const handleDeleteChapter = useCallback((name: string) => {
    const chapterCards = cardsByChapter[name] || [];
    const updates = chapterCards.map(() => ({ id: chapterCards[0]?.id || "", chapter: "", chapterOrder: 0 }));
    // Re-map properly with actual card IDs
    const properUpdates = chapterCards.map((c) => ({ id: c.id, chapter: "", chapterOrder: 0 }));
    onUpdateChapters(properUpdates);

    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(existing => {
        idbSaveSettings(idbKey, existing.filter(ch => ch !== name));
      });
    });

    toast.success(`Glava "${name}" obrisana, kartice vraćene u neraspoređene`);
  }, [cardsByChapter, onUpdateChapters, idbKey]);

  const handleMoveChapter = useCallback((index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= allChapters.length) return;
    const reordered = [...allChapters];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, item);
    setStoredChapters(reordered);
    import("@/lib/db").then(({ idbSaveSettings }) => {
      idbSaveSettings(idbKey, reordered);
    });
  }, [allChapters, idbKey]);

  return {
    storedChapters,
    allChapters,
    addingChapter,
    setAddingChapter,
    newChapterName,
    setNewChapterName,
    renamingChapter,
    setRenamingChapter,
    renameValue,
    setRenameValue,
    handleAddChapter,
    handleRenameChapter,
    submitRename,
    handleDeleteChapter,
    handleMoveChapter,
  };
}
