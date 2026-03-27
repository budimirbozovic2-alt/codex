import { useCallback } from "react";
import { toast } from "sonner";
import { Card, createCard, createSection, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap } from "@/lib/persist-queue";

interface UseCardImportDeps {
  categories: string[];
  setCardMap: (updater: (prev: CardMap) => CardMap, persist?: "surgical" | "full") => void;
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
  schedulePersist: (action: { type: string; cards?: Card[] }) => void;
  setCardMapState: (updater: (prev: CardMap) => CardMap) => void;
}

export function useCardImport({
  categories, setCardMap, setCategories, setSubcategories,
  setReviewLog, updateSRSettings, schedulePersist, setCardMapState,
}: UseCardImportDeps) {
  const importData = useCallback(
    async (file: File, strategy: "keep" | "overwrite" | "skip" | "newer" = "skip") => {
      try {
        let jsonText: string;
        if (file.name.endsWith(".zip")) {
          const { decompressJsonFromZip } = await import("@/lib/zip-service");
          jsonText = await decompressJsonFromZip(file);
        } else {
          jsonText = await file.text();
        }

        let parsed: unknown;
        try { parsed = JSON.parse(jsonText); } catch {
          toast.error("Neispravan JSON format. Fajl je oštećen ili nije validan.");
          return;
        }

        const data = parsed as Record<string, unknown>;
        if (!data || typeof data !== "object") { toast.error("Fajl ne sadrži validan JSON objekat."); return; }
        if (!Array.isArray(data.cards)) { toast.error("Fajl ne sadrži 'cards' niz. Provjerite format."); return; }

        const cardsArr = data.cards as Record<string, unknown>[];
        for (let i = 0; i < Math.min(5, cardsArr.length); i++) {
          const c = cardsArr[i];
          if (!c || typeof c.question !== "string" || !Array.isArray(c.sections)) {
            toast.error(`Kartica #${i + 1} ima neispravan format (nedostaje question ili sections).`);
            return;
          }
        }

        const { sanitizeHtml } = await import("@/lib/sanitize");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic JSON migration requires flexible typing
        const migrateImported = (c: any): Card => ({
          ...c,
          readCount: c.readCount || 0,
          type: c.type || "essay",
          subcategory: c.subcategory || "",
          question: sanitizeHtml(c.question ?? ""),
          tags: c.tags || [],
          errorLog: c.errorLog || [],
          sections: (c.sections || []).map((s: any) => ({
            ...s,
            id: s.id || crypto.randomUUID(),
            state: s.state ?? 0,
            lapses: s.lapses || 0,
            content: sanitizeHtml(s.content ?? ""),
            stability: s.stability ?? 0,
            difficulty: s.difficulty ?? 5,
            interval: s.interval ?? 0,
            nextReview: s.nextReview ?? 0,
            lastReviewed: s.lastReviewed ?? null,
            elapsedDays: s.elapsedDays ?? 0,
            scheduledDays: s.scheduledDays ?? 0,
          })),
        });

        const importedCards: Card[] = cardsArr.map(c => migrateImported(c));
        setCardMap((prev) => {
          const next = { ...prev };
          if (strategy === "newer") {
            const getLastReview = (c: Card) => Math.max(0, ...c.sections.map((s) => s.lastReviewed || 0));
            importedCards.forEach((ic) => {
              const existing = next[ic.id];
              if (!existing) next[ic.id] = ic;
              else if (getLastReview(ic) > getLastReview(existing)) next[ic.id] = ic;
            });
          } else if (strategy === "overwrite") {
            importedCards.forEach((ic) => { next[ic.id] = ic; });
          } else {
            importedCards.forEach((ic) => { if (!next[ic.id]) next[ic.id] = ic; });
          }
          return next;
        }, "full");

        if (Array.isArray(data.categories)) {
          setCategories((prev) => [...new Set([...prev, ...(data.categories as string[])])]);
        }
        if (data.subcategories && typeof data.subcategories === "object") {
          setSubcategories((prev) => {
            const merged = { ...prev };
            for (const [cat, subs] of Object.entries(data.subcategories as Record<string, string[]>)) {
              merged[cat] = [...new Set([...(merged[cat] || []), ...subs])];
            }
            return merged;
          });
        }
        if (Array.isArray(data.reviewLog) && strategy === "overwrite") {
          setReviewLog(data.reviewLog as ReviewLogEntry[]);
        }
        if (data.srSettings && strategy === "overwrite") {
          updateSRSettings({ ...DEFAULT_SR_SETTINGS, ...(data.srSettings as Partial<SRSettings>) });
        }

        // Restore sources & mindMaps (v3+) — surgical upsert
        if (Array.isArray(data.sources) || Array.isArray(data.mindMaps)) {
          const { db } = await import("@/lib/db");
          if (Array.isArray(data.sources) && (data.sources as unknown[]).length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sanitizedSources = (data.sources as any[]).map((src) => ({
              ...src, htmlContent: sanitizeHtml(src.htmlContent ?? ""),
            }));
            await db.sources.bulkPut(sanitizedSources);
            if (strategy === "overwrite") {
              const importedIds = new Set(sanitizedSources.map((s: { id: string }) => s.id));
              const allKeys = await db.sources.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.sources.bulkDelete(toDelete);
            }
          }
          if (Array.isArray(data.mindMaps) && (data.mindMaps as unknown[]).length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await db.mindMaps.bulkPut(data.mindMaps as any[]);
            if (strategy === "overwrite") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const importedIds = new Set((data.mindMaps as any[]).map((m: { id: string }) => m.id));
              const allKeys = await db.mindMaps.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.mindMaps.bulkDelete(toDelete);
            }
          }
        }

        // Restore metacognitive + planner IDB tables (v4+) — surgical upsert
        const idbTables = [
          { key: "diary", table: "diary" }, { key: "calibrationLog", table: "calibrationLog" },
          { key: "latencyLog", table: "latencyLog" }, { key: "slippageLog", table: "slippageLog" },
          { key: "activityLog", table: "activityLog" }, { key: "disciplineLog", table: "disciplineLog" },
          { key: "pomodoroLog", table: "pomodoroLog" },
        ];
        const hasExtraTables = idbTables.some((t) => Array.isArray(data[t.key]) && (data[t.key] as unknown[]).length > 0);
        if (hasExtraTables) {
          const { db: dbInst } = await import("@/lib/db");
          const dbRecord = dbInst as unknown as Record<string, { bulkPut: (items: unknown[]) => Promise<void>; toCollection: () => { primaryKeys: () => Promise<unknown[]> }; bulkDelete: (keys: unknown[]) => Promise<void> }>;
          for (const { key, table } of idbTables) {
            const arr = data[key];
            if (Array.isArray(arr) && arr.length > 0) {
              await dbRecord[table].bulkPut(arr);
              if (strategy === "overwrite") {
                const importedIds = new Set((arr as Record<string, unknown>[]).map((r) => r.id));
                const allKeys = await dbRecord[table].toCollection().primaryKeys();
                const toDelete = allKeys.filter((k) => !importedIds.has(k));
                if (toDelete.length > 0) await dbRecord[table].bulkDelete(toDelete);
              }
            }
          }
        }

        // Restore localStorage data (v4+)
        if (data.localStorageData && typeof data.localStorageData === "object") {
          for (const [key, value] of Object.entries(data.localStorageData as Record<string, unknown>)) {
            localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
          }
        }

        const extraParts: string[] = [];
        if (Array.isArray(data.sources) && (data.sources as unknown[]).length > 0) extraParts.push(`${(data.sources as unknown[]).length} izvora`);
        if (Array.isArray(data.mindMaps) && (data.mindMaps as unknown[]).length > 0) extraParts.push(`${(data.mindMaps as unknown[]).length} mentalnih mapa`);
        if (Array.isArray(data.diary) && (data.diary as unknown[]).length > 0) extraParts.push(`${(data.diary as unknown[]).length} dnevničkih zapisa`);
        if (Array.isArray(data.disciplineLog) && (data.disciplineLog as unknown[]).length > 0) extraParts.push("disciplinski log");
        if (data.localStorageData) extraParts.push("podešavanja i planer");
        const extraMsg = extraParts.length > 0 ? ` + ${extraParts.join(", ")}` : "";
        toast.success(`Uspješno uvezeno ${importedCards.length} kartica${extraMsg}.`);
      } catch (err) {
        toast.error(`Greška pri uvozu: ${err instanceof Error ? err.message : "Neispravan format fajla."}`);
      }
    },
    [setCardMap, setCategories, setSubcategories, updateSRSettings],
  );

  const importCards = useCallback(
    (newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
      const created = newCards.map((c) => createCard(c.question, c.sections, category));
      setCardMapState((prev) => {
        const next = { ...prev };
        created.forEach((c) => { next[c.id] = c; });
        schedulePersist({ type: "bulk", cards: created });
        return next;
      });
      if (!categories.includes(category)) setCategories((prev) => [...prev, category]);
    },
    [categories, setCategories, setCardMapState, schedulePersist],
  );

  return { importData, importCards };
}
