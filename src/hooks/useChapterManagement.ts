import { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import { toast } from "sonner";

interface UseChapterManagementParams {
  categoryId: string;      // ✓ UUID
  subcategoryId: string;   // ✓ UUID
  cardsByChapter: Record<string, Card[]>; // Key je sada chapterId (UUID)
  cardDerivedChapters: string[]; // Lista chapterId-eva prisutnih na karticama
  onUpdateChapters: (updates: { id: string; chapterId: string | undefined; chapterOrder: number }[]) => void;
}

export function useChapterManagement({
  categoryId,
  subcategoryId,
  cardsByChapter,
  cardDerivedChapters,
  onUpdateChapters,
}: UseChapterManagementParams) {
  const [storedChapters, setStoredChapters] = useState<string[]>([]);
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [renamingChapter, setRenamingChapter] = useState<string | null>(null); // Drži chapterId
  const [renameValue, setRenameValue] = useState("");

  // Ključ za IDB sada koristi isključivo UUID-ove za stabilnost
  const idbKey = `chapters-${categoryId}-${subcategoryId}`;

  // Load stored chapters (sa migracijom stare localStorage logike)
  useEffect(() => {
    async function init() {
      const { idbLoadSettings, idbSaveSettings } = await import("@/lib/db");

      // Migracija legacy localStorage-a (ako postoji pod starim string ključem)
      // Napomena: Ovo je rijetko jer smo prešli na UUID, ali čuvamo radi sigurnosti
      const oldKey = `memoria-chapters-${categoryId}-${subcategoryId}`;
      const old = localStorage.getItem(oldKey);
      if (old) {
        try {
          const parsed = JSON.parse(old) as string[];
          if (parsed.length > 0) {
            await idbSaveSettings(idbKey, parsed);
            setStoredChapters(parsed);
            localStorage.removeItem(oldKey);
            return;
          }
        } catch {}
      }

      const stored = await idbLoadSettings<string[]>(idbKey, []);
      setStoredChapters(stored);
    }
    init();
  }, [categoryId, subcategoryId, idbKey]);

  // Spaja sačuvani redoslijed sa ID-ovima koji su pronađeni na karticama
  const allChapters = useMemo(() => {
    const ordered = [...storedChapters];
    cardDerivedChapters.forEach(chId => {
      if (!ordered.includes(chId)) ordered.push(chId);
    });
    return ordered;
  }, [cardDerivedChapters, storedChapters]);

  const handleAddChapter = useCallback(() => {
    const name = newChapterName.trim();
    if (!name) return;

    // U UUID sistemu, ime se čuva u CategoryRecords, ali ovaj hook 
    // i dalje upravlja listom/redoslijedom ID-eva
    toast.success(`Glava kreirana. Prevuci kartice u nju.`);
    setNewChapterName("");
    setAddingChapter(false);
    
    // Ovdje bi idealno bilo generisati UUID, ali pošto ovaj hook 
    // trenutno radi sa listom stringova, tretiramo 'name' kao ID 
    // dok se ne uveže sa punim CategoryManagement-om
    setStoredChapters(prev => prev.includes(name) ? prev : [...prev, name]);

    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(existing => {
        if (!existing.includes(name)) {
          idbSaveSettings(idbKey, [...existing, name]);
        }
      });
    });
  }, [newChapterName, idbKey]);

  const handleRenameChapter = useCallback((chapterId: string) => {
    setRenamingChapter(chapterId);
    setRenameValue(chapterId); // U UUID sistemu, ovdje bi išao lookup za name
  }, []);

  const submitRename = useCallback(() => {
    if (!renamingChapter || !renameValue.trim()) return;
    
    const chapterId = renamingChapter;
    const newName = renameValue.trim();
    const chapterCards = cardsByChapter[chapterId] || [];
    
    // Ažuriramo kartice koristeći chapterId (UUID)
    const updates = chapterCards.map((c, i) => ({
      id: c.id,
      chapterId: chapterId, // ID ostaje isti, ali šaljemo update za redoslijed ili trigger
      chapterOrder: c.chapterOrder ?? i,
    }));
    
    onUpdateChapters(updates);

    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(existing => {
        const updated = existing.map(ch => ch === chapterId ? newName : ch);
        idbSaveSettings(idbKey, updated);
      });
    });

    toast.success(`Glava ažurirana`);
    setRenamingChapter(null);
  }, [renamingChapter, renameValue, cardsByChapter, onUpdateChapters, idbKey]);

  const handleDeleteChapter = useCallback((chapterId: string) => {
    const chapterCards = cardsByChapter[chapterId] || [];
    
    // KLJUČNA IZMJENA: chapterId se postavlja na undefined umjesto praznog stringa
    const properUpdates = chapterCards.map((c) => ({ 
      id: c.id, 
      chapterId: undefined, 
      chapterOrder: 0 
    }));
    
    onUpdateChapters(properUpdates);

    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(idbKey, []).then(existing => {
        idbSaveSettings(idbKey, existing.filter(ch => ch !== chapterId));
      });
    });

    toast.success(`Glava obrisana, kartice vraćene u neraspoređene`);
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
