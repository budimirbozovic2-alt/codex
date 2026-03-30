import { useCallback, MutableRefObject } from "react";
import { toast } from "sonner";
import { Card, createCard, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";
import { type CategoryRecord } from "@/lib/db";

interface UseCardImportDeps {
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
  setCardMapState: (updater: (prev: CardMap) => CardMap) => void;
  cardMapRef: MutableRefObject<CardMap>;
  setCategoryRecordsState: (records: CategoryRecord[]) => void;
}

export function useCardImport({
  setCategories, setSubcategories,
  setReviewLog, updateSRSettings, setCardMapState, cardMapRef,
  setCategoryRecordsState,
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
        // H2 fix: Pre-compute merged array outside React updater using cardMapRef
        const currentMap = cardMapRef.current;
        const merged: Card[] = [];
        const nextMap = { ...currentMap };
        if (strategy === "newer") {
          const getLastReview = (c: Card) => c.sections.reduce((max, s) => Math.max(max, s.lastReviewed || 0), 0);
          importedCards.forEach((ic) => {
            const existing = nextMap[ic.id];
            if (!existing) { nextMap[ic.id] = ic; merged.push(ic); }
            else if (getLastReview(ic) > getLastReview(existing)) { nextMap[ic.id] = ic; merged.push(ic); }
          });
        } else if (strategy === "overwrite") {
          // Full replace: start from empty map, not current map
          for (const key of Object.keys(nextMap)) delete nextMap[key];
          importedCards.forEach((ic) => { nextMap[ic.id] = ic; merged.push(ic); });
          // Delete orphaned cards from IDB
          const { db: dbCards } = await import("@/lib/db");
          const allCardKeys = await dbCards.cards.toCollection().primaryKeys();
          const importedIdSet = new Set(importedCards.map(c => c.id));
          const orphanKeys = allCardKeys.filter(k => !importedIdSet.has(k as string));
          if (orphanKeys.length > 0) await dbCards.cards.bulkDelete(orphanKeys);
        } else {
          importedCards.forEach((ic) => { if (!nextMap[ic.id]) { nextMap[ic.id] = ic; merged.push(ic); } });
        }
        if (merged.length > 0) schedulePersist({ type: "bulk", cards: merged });
        cardMapRef.current = nextMap;
        setCardMapState(() => nextMap);
        bumpMapVersion();

        let importedAsRecords = false;
        let freshRecords: CategoryRecord[] = [];

        if (Array.isArray(data.categories) && (data.categories as unknown[]).length > 0) {
          const firstCat = (data.categories as unknown[])[0];
          const isRecordFormat = typeof firstCat === 'object' && firstCat !== null && 'id' in firstCat;

          if (isRecordFormat) {
            importedAsRecords = true;
            // v7+ CategoryRecord[] — write directly to IDB preserving UUIDs
            const { db: dbCat, idbLoadCategories } = await import("@/lib/db");
            const catRecords = data.categories as CategoryRecord[];
            if (strategy === "overwrite") {
              await dbCat.categories.clear();
              await dbCat.categories.bulkPut(catRecords);
            } else {
              await dbCat.categories.bulkPut(catRecords);
            }
            freshRecords = await idbLoadCategories();
            setCategoryRecordsState(freshRecords);
            setCategories(() => freshRecords.map(r => r.id));
          } else {
            // Legacy string[] format — fallback
            if (strategy === "overwrite") {
              setCategories(() => data.categories as string[]);
            } else {
              setCategories((prev) => [...new Set([...prev, ...(data.categories as string[])])]);
            }
          }
        }

        // Subcategories: for v7+ records, derive from embedded data; for legacy, use separate field
        if (importedAsRecords) {
          const subMap: Record<string, string[]> = {};
          freshRecords.forEach(r => {
            if (r.subcategories && r.subcategories.length > 0) {
              subMap[r.name] = (r.subcategories as any[]).map((s: any) => typeof s === "string" ? s : s.name);
            }
          });
          setSubcategories(() => subMap);
        } else if (strategy === "overwrite" && (!data.subcategories || Object.keys(data.subcategories as object).length === 0)) {
          setSubcategories(() => ({}));
        } else if (data.subcategories && typeof data.subcategories === "object") {
          if (strategy === "overwrite") {
            setSubcategories(() => data.subcategories as Record<string, string[]>);
          } else {
            setSubcategories((prev) => {
              const m = { ...prev };
              for (const [cat, subs] of Object.entries(data.subcategories as Record<string, string[]>)) {
                m[cat] = [...new Set([...(m[cat] || []), ...subs])];
              }
              return m;
            });
          }
        }
        if (Array.isArray(data.reviewLog) && strategy === "overwrite") {
          setReviewLog(data.reviewLog as ReviewLogEntry[]);
          // Also clear and replace IDB reviewLog table
          const { db: dbReview } = await import("@/lib/db");
          await dbReview.reviewLog.clear();
          if ((data.reviewLog as unknown[]).length > 0) {
            await dbReview.reviewLog.bulkAdd(data.reviewLog as ReviewLogEntry[]);
          }
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
            const { invalidateSourcesCache } = await import("@/lib/sources-storage");
            invalidateSourcesCache();
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

        // Restore metacognitive + planner IDB tables (v4+)
        const uuidTables = [
          { key: "diary", table: "diary" },
        ];
        const autoIncTables = [
          { key: "calibrationLog", table: "calibrationLog" },
          { key: "latencyLog", table: "latencyLog" }, { key: "slippageLog", table: "slippageLog" },
          { key: "activityLog", table: "activityLog" }, { key: "disciplineLog", table: "disciplineLog" },
          { key: "pomodoroLog", table: "pomodoroLog" },
        ];
        const idbTables = [...uuidTables, ...autoIncTables];
        const autoIncKeys = new Set(autoIncTables.map((t) => t.key));
        // C3 fix: Also enter the block when overwrite strategy has tables present (even if empty)
        // to clear stale data from IDB
        const hasExtraTables = idbTables.some((t) => Array.isArray(data[t.key]) && (data[t.key] as unknown[]).length > 0);
        const needsClear = strategy === "overwrite" && idbTables.some((t) => Array.isArray(data[t.key]));
        if (hasExtraTables || needsClear) {
          const { db: dbInst } = await import("@/lib/db");
          const dbRecord = dbInst as unknown as Record<string, { bulkPut: (items: unknown[]) => Promise<void>; bulkAdd: (items: unknown[]) => Promise<void>; clear: () => Promise<void>; toCollection: () => { primaryKeys: () => Promise<unknown[]> }; bulkDelete: (keys: unknown[]) => Promise<void> }>;
          for (const { key, table } of idbTables) {
            const arr = data[key];
            if (!Array.isArray(arr)) continue;
            if (arr.length > 0) {
              if (strategy === "overwrite" && autoIncKeys.has(key)) {
                await dbRecord[table].clear();
                const stripped = arr.map((r: Record<string, unknown>) => { const { id: _id, ...rest } = r; return rest; });
                await dbRecord[table].bulkAdd(stripped);
              } else {
                await dbRecord[table].bulkPut(arr);
                if (strategy === "overwrite") {
                  const importedIds = new Set((arr as Record<string, unknown>[]).map((r) => r.id));
                  const allKeys = await dbRecord[table].toCollection().primaryKeys();
                  const toDelete = allKeys.filter((k) => !importedIds.has(k));
                  if (toDelete.length > 0) await dbRecord[table].bulkDelete(toDelete);
                }
              }
            } else if (strategy === "overwrite") {
              // C3 fix: Empty array in backup = clear the table
              await dbRecord[table].clear();
            }
          }
        }

        // Restore localStorage data (v4+)
        if (data.localStorageData && typeof data.localStorageData === "object") {
          for (const [key, value] of Object.entries(data.localStorageData as Record<string, unknown>)) {
            localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
          }
        }
        // C1 fix: Invalidate in-memory caches after localStorage restore
        const { invalidateMonumentTypesCache } = await import("@/lib/forum-logic");
        invalidateMonumentTypesCache();
        // H2 fix: Clear stale review session data on overwrite import
        if (strategy === "overwrite") {
          try { localStorage.removeItem("sr-review-session"); } catch {}
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
    [setCardMapState, setCategories, setSubcategories, setReviewLog, updateSRSettings, cardMapRef, setCategoryRecordsState],
  );

  // H5 fix: importCards now syncs cardMapRef before setState
  const importCards = useCallback(
    (newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
      const created = newCards.map((c) => createCard(c.question, c.sections, category));
      created.forEach(c => { c.updatedAt = Date.now(); });
      // Sync ref before state update to prevent stale ref reads
      const nextRef = { ...cardMapRef.current };
      created.forEach((c) => { nextRef[c.id] = c; });
      cardMapRef.current = nextRef;
      schedulePersist({ type: "bulk", cards: created });
      setCardMapState(() => nextRef);
      bumpMapVersion();
      setCategories((prev) => prev.includes(category) ? prev : [...prev, category]);
    },
    [setCategories, setCardMapState, cardMapRef],
  );

  return { importData, importCards };
}
