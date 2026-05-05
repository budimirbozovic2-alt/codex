import { useCallback, MutableRefObject } from "react";
import { toast } from "sonner";
import { Card, createCard, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, bumpMapVersion, schedulePersist, persistQueue } from "@/lib/persist-queue";
import {
  db,
  idbLoadCategories,
  idbSaveCategories,
  type CategoryRecord,
  type SubcategoryNode,
} from "@/lib/db";
import { resolveLegacyTaxonomyNames } from "@/lib/migrations/resolve-legacy-taxonomy";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import { migrateBackup, BackupVersionError } from "@/lib/backup/migrate";
import { yieldUI } from "@/lib/backup/yield-ui";

export type ImportProgress = (pct: number, label: string) => void;

interface UseCardImportDeps {
  setCategoryRecords: React.Dispatch<React.SetStateAction<CategoryRecord[]>>;
  setReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
  setCardMapState: (updater: (prev: CardMap) => CardMap) => void;
  cardMapRef: MutableRefObject<CardMap>;
}

/** Whitelisted localStorage keys that the import path is allowed to restore.
 *  Must mirror the keys written by `useCardExport.ts`. */
const ALLOWED_LS_KEYS = new Set([
  "sr-app-settings", "sr-mnemonic-workshop", "sr-mnemonic-associations",
  "sr-major-system-map", "sr-learn-progress", "sr-last-backup",
  "sr-planner-config", "sr-daily-mapped-count", "sr-daily-mapped-date",
  "sr-dark-mode", "sr-tts-settings",
]);
const VALID_THEMES = new Set(["amber", "slate", "forest", "ocean", "rose", "midnight"]);

/** Recursively strip dangerous strings from imported settings objects. */
function sanitizeLSValue(v: unknown): unknown {
  if (typeof v === "string") {
    if (/[<>]/.test(v)) return "";
    return v;
  }
  if (Array.isArray(v)) return v.map(sanitizeLSValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeLSValue(val);
    }
    if (typeof out.colorTheme === "string" && !VALID_THEMES.has(out.colorTheme)) {
      out.colorTheme = "ocean";
    }
    return out;
  }
  return v;
}

/** Narrow `parsed.categories` (legacy union of CategoryRecord[] | string[]). */
function isCategoryRecordArray(v: ParsedBackup["categories"]): v is CategoryRecord[] {
  return v.length > 0 && typeof v[0] === "object" && v[0] !== null && "id" in v[0];
}

export function useCardImport({
  setCategoryRecords,
  setReviewLog,
  updateSRSettings,
  setCardMapState,
  cardMapRef,
}: UseCardImportDeps) {
  const importData = useCallback(
    async (
      file: File,
      strategy: "keep" | "overwrite" | "skip" | "newer" = "skip",
      onProgress?: ImportProgress,
    ) => {
      const progress: ImportProgress = onProgress ?? (() => { /* noop */ });
      try {
        progress(2, "Čitanje fajla…");
        let jsonText: string;
        if (file.name.endsWith(".zip")) {
          const { decompressJsonFromZip } = await import("@/lib/zip-service");
          jsonText = await decompressJsonFromZip(file);
        } else {
          jsonText = await file.text();
        }

        progress(15, "Parsiranje…");
        let raw: unknown;
        try { raw = JSON.parse(jsonText); } catch {
          toast.error("Neispravan JSON format. Fajl je oštećen ili nije validan.");
          return;
        }

        progress(20, "Validacija šeme…");
        const result = BackupSchema.safeParse(raw);
        if (!result.success) {
          const issue = result.error.issues[0];
          const path = issue?.path.join(".") || "(root)";
          toast.error(`Backup nije validan: ${path} — ${issue?.message ?? "nepoznata greška"}`);
          return;
        }

        // Schema-version migration ladder. Rejects backups newer than the app
        // before any IDB write so partial state can never leak through.
        let parsed: ParsedBackup;
        try {
          parsed = migrateBackup(result.data);
        } catch (err) {
          if (err instanceof BackupVersionError) {
            toast.error(err.message);
          } else {
            toast.error("Migracija backupa nije uspjela.");
            console.error("[useCardImport] migrate failed", err);
          }
          return;
        }

        if (parsed.cards.length === 0 && (!Array.isArray(parsed.categories) || parsed.categories.length === 0)) {
          toast.error("Fajl ne sadrži kartice ni kategorije za uvoz.");
          return;
        }
        progress(25, "Priprema podataka…");
        await yieldUI();

        // ── Cards: schema already migrated + sanitized ──
        const importedCards: Card[] = parsed.cards;
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
          for (const key of Object.keys(nextMap)) delete nextMap[key];
          importedCards.forEach((ic) => { nextMap[ic.id] = ic; merged.push(ic); });
          // E1: atomic overwrite — cards + categories in single transaction
          await db.transaction("rw", [db.cards, db.categories], async () => {
            const allCardKeys = await db.cards.toCollection().primaryKeys();
            const importedIdSet = new Set(importedCards.map(c => c.id));
            const orphanKeys = allCardKeys.filter(k => !importedIdSet.has(k as string));
            if (orphanKeys.length > 0) await db.cards.bulkDelete(orphanKeys);
            if (isCategoryRecordArray(parsed.categories)) {
              await db.categories.clear();
              await db.categories.bulkPut(parsed.categories);
            }
          });
        } else {
          importedCards.forEach((ic) => { if (!nextMap[ic.id]) { nextMap[ic.id] = ic; merged.push(ic); } });
        }

        // ── Categories import + remap BEFORE persist ──
        if (parsed.categories.length > 0) {
          if (isCategoryRecordArray(parsed.categories)) {
            const catRecords = parsed.categories;
            if (strategy === "overwrite") {
              const freshRecords = await idbLoadCategories();
              setCategoryRecords(freshRecords);
            } else {
              // Deduplicate by name: remap IDs when same name exists under different UUID
              const existingCats = await idbLoadCategories();
              const existingByName = new Map<string, string>();
              existingCats.forEach(c => existingByName.set(c.name.toLowerCase(), c.id));

              const idRemap = new Map<string, string>();
              const filteredCatRecords = catRecords.filter(cr => {
                const existingId = existingByName.get(cr.name.toLowerCase());
                if (existingId && existingId !== cr.id) {
                  idRemap.set(cr.id, existingId);
                  return false;
                }
                return true;
              });

              // Apply remap to cards & related entities BEFORE they are persisted
              if (idRemap.size > 0) {
                for (const card of merged) {
                  const remapped = idRemap.get(card.categoryId);
                  if (remapped) card.categoryId = remapped;
                }
                for (const card of Object.values(nextMap)) {
                  const remapped = idRemap.get(card.categoryId);
                  if (remapped) card.categoryId = remapped;
                }
                for (const src of parsed.sources) {
                  const remapped = idRemap.get(src.categoryId);
                  if (remapped) src.categoryId = remapped;
                }
                for (const mn of parsed.mnemonics) {
                  const remapped = idRemap.get(mn.categoryId);
                  if (remapped) mn.categoryId = remapped;
                }
                for (const a of parsed.knowledgeBaseArticles) {
                  const remapped = idRemap.get(a.subjectId);
                  if (remapped) a.subjectId = remapped;
                }
                // FK completeness: mindMaps also reference categoryId.
                for (const m of parsed.mindMaps) {
                  if (m.categoryId) {
                    const remapped = idRemap.get(m.categoryId);
                    if (remapped) m.categoryId = remapped;
                  }
                }
              }

              if (filteredCatRecords.length > 0) {
                await db.categories.bulkPut(filteredCatRecords);
              }
            }
            const freshRecords = await idbLoadCategories();
            setCategoryRecords(freshRecords);
          } else {
            // Legacy string[] format — create CategoryRecord[] from names
            const existing = await idbLoadCategories();
            const existingNames = new Set(existing.map(r => r.name));
            const legacyNames = parsed.categories;
            const newRecs: CategoryRecord[] = [];
            for (const name of legacyNames) {
              if (!existingNames.has(name)) {
                newRecs.push({
                  id: crypto.randomUUID(),
                  name,
                  sortOrder: existing.length + newRecs.length,
                  subcategories: [],
                });
              }
            }
            if (strategy === "overwrite") {
              const allRecs: CategoryRecord[] = legacyNames.map((name, i) => ({
                id: crypto.randomUUID(),
                name,
                sortOrder: i,
                subcategories: [],
              }));
              await db.categories.clear();
              await db.categories.bulkPut(allRecs);
              setCategoryRecords(allRecs);
            } else if (newRecs.length > 0) {
              await db.categories.bulkPut(newRecs);
              setCategoryRecords(await idbLoadCategories());
            }
          }
        }

        // ── Resolve legacy string-name taxonomy → UUIDs (prije persist-a) ──
        let legacyResolveReport: { resolvedSubcategory: number; resolvedChapter: number; unresolvedSubcategory: number; unresolvedChapter: number } | null = null;
        try {
          const freshRecs = await idbLoadCategories();
          legacyResolveReport = resolveLegacyTaxonomyNames(merged, freshRecs);
          for (const c of merged) nextMap[c.id] = c;
        } catch (resolveErr) {
          console.warn("[useCardImport] legacy taxonomy resolve failed:", resolveErr);
        }

        // ── Persist cards AFTER remap is complete ──
        progress(40, "Snimanje kartica…");
        if (merged.length > 0) schedulePersist({ type: "bulk", cards: merged });
        cardMapRef.current = nextMap;
        setCardMapState(() => nextMap);
        bumpMapVersion();
        // Drain the persist queue NOW so subsequent table writes see a stable
        // post-cards state. Without this, schedulePersist (debounced) could
        // race with the sources/mindMaps bulkPut block below — if the queue
        // failed AFTER those committed, we'd be left with a partially imported
        // database that has the satellites but not the cards they reference.
        try { await persistQueue.flush(); } catch (e) {
          console.warn("[useCardImport] persist flush failed (continuing)", e);
        }
        await yieldUI();

        // ── Legacy `subcategories` map (only relevant for legacy name-based backups) ──
        const isNewCatFormat = isCategoryRecordArray(parsed.categories);
        if (
          parsed.subcategories &&
          typeof parsed.subcategories === "object" &&
          !isNewCatFormat
        ) {
          const recs = await idbLoadCategories();
          const subData = parsed.subcategories as Record<string, string[]>;
          const updated = recs.map((r) => {
            const subs = subData[r.id] || subData[r.name] || [];
            if (subs.length === 0) return r;
            const existingNames = new Set(r.subcategories.map((n) => n.name));
            const newNodes: SubcategoryNode[] = subs
              .filter((s) => !existingNames.has(s))
              .map((name, i) => ({
                id: crypto.randomUUID(),
                name,
                chapters: [],
                sortOrder: r.subcategories.length + i,
              }));
            return { ...r, subcategories: [...r.subcategories, ...newNodes] };
          });
          await idbSaveCategories(updated);
          setCategoryRecords(updated);
        }

        // ── Review log overwrite (atomic clear+bulkAdd) ──
        if (parsed.reviewLog.length > 0 && strategy === "overwrite") {
          progress(50, "Uvoz dnevnika ponavljanja…");
          const log = parsed.reviewLog as unknown as ReviewLogEntry[];
          setReviewLog(log);
          await db.transaction("rw", db.reviewLog, async () => {
            await db.reviewLog.clear();
            await db.reviewLog.bulkAdd(log);
          });
          await yieldUI();
        }

        if (parsed.srSettings && strategy === "overwrite") {
          updateSRSettings({ ...DEFAULT_SR_SETTINGS, ...(parsed.srSettings as Partial<SRSettings>) });
        }

        // ── Sources & MindMaps & KB articles in a single atomic transaction ──
        // Combined so a malformed mindMap can't leave sources written but
        // mindMaps absent — the failed transaction rolls back to the
        // pre-import snapshot for these three tables.
        progress(55, "Uvoz izvora i mapa…");
        await db.transaction("rw", [db.sources, db.mindMaps, db.knowledgeBaseArticles], async () => {
          if (parsed.sources.length > 0) {
            await db.sources.bulkPut(parsed.sources);
            if (strategy === "overwrite") {
              const importedIds = new Set(parsed.sources.map((s) => s.id));
              const allKeys = await db.sources.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.sources.bulkDelete(toDelete);
            }
          }
          await yieldUI();
          if (parsed.mindMaps.length > 0) {
            await db.mindMaps.bulkPut(parsed.mindMaps);
            if (strategy === "overwrite") {
              const importedIds = new Set(parsed.mindMaps.map((m) => m.id));
              const allKeys = await db.mindMaps.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.mindMaps.bulkDelete(toDelete);
            }
          }
          await yieldUI();
          if (parsed.knowledgeBaseArticles.length > 0) {
            await db.knowledgeBaseArticles.bulkPut(parsed.knowledgeBaseArticles);
            if (strategy === "overwrite") {
              const importedIds = new Set(parsed.knowledgeBaseArticles.map((a) => a.id));
              const allKeys = await db.knowledgeBaseArticles.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.knowledgeBaseArticles.bulkDelete(toDelete);
            }
          } else if (strategy === "overwrite") {
            await db.knowledgeBaseArticles.clear();
          }
        });
        invalidateSourcesCache();
        progress(75, "Uvoz logova i postavki…");

        // ── Metacognitive + planner IDB tables ──
        type IdbBulkTable = {
          bulkPut: (items: unknown[]) => Promise<unknown>;
          bulkAdd: (items: unknown[]) => Promise<unknown>;
          clear: () => Promise<void>;
          toCollection: () => { primaryKeys: () => Promise<unknown[]> };
          bulkDelete: (keys: unknown[]) => Promise<void>;
        };
        const uuidTables = [
          { key: "diary", table: "diary" },
          { key: "mnemonics", table: "mnemonics" },
          { key: "majorSystem", table: "majorSystem" },
          { key: "settings", table: "settings" },
        ] as const;
        const autoIncTables = [
          { key: "calibrationLog", table: "calibrationLog" },
          { key: "latencyLog", table: "latencyLog" },
          { key: "slippageLog", table: "slippageLog" },
          { key: "activityLog", table: "activityLog" },
          { key: "disciplineLog", table: "disciplineLog" },
          { key: "pomodoroLog", table: "pomodoroLog" },
          { key: "mnemonicTestLog", table: "mnemonicTestLog" },
        ] as const;
        const idbTables = [...uuidTables, ...autoIncTables];
        const autoIncKeys = new Set(autoIncTables.map((t) => t.key));
        const dbRecord = db as unknown as Record<string, IdbBulkTable>;

        // Atomic over the whole satellite-table set: a malformed log can no
        // longer commit-then-fail mid-stream and leave half the metacognitive
        // state replaced. The transaction holds the IDB lock; yieldUI()
        // releases the JS thread between tables so the UI keeps painting.
        const allLogTables = idbTables.map(({ table }) => dbRecord[table] as unknown as object);
        await db.transaction("rw", allLogTables as never[], async () => {
          let i = 0;
          for (const { key, table } of idbTables) {
            const arr = (parsed as unknown as Record<string, unknown[]>)[key];
            if (Array.isArray(arr) && arr.length > 0) {
              if (strategy === "overwrite" && autoIncKeys.has(key as typeof autoIncTables[number]["key"])) {
                await dbRecord[table].clear();
                const stripped = arr.map((r) => {
                  const rec = (r ?? {}) as Record<string, unknown>;
                  const { id: _id, ...rest } = rec;
                  return rest;
                });
                await dbRecord[table].bulkAdd(stripped);
              } else {
                await dbRecord[table].bulkPut(arr);
                if (strategy === "overwrite") {
                  const pkField = key === "settings" ? "key" : "id";
                  const importedIds = new Set(arr.map((r) => (r as Record<string, unknown>)[pkField]));
                  const allKeys = await dbRecord[table].toCollection().primaryKeys();
                  const toDelete = allKeys.filter((k) => !importedIds.has(k));
                  if (toDelete.length > 0) await dbRecord[table].bulkDelete(toDelete);
                }
              }
            } else if (strategy === "overwrite") {
              await dbRecord[table].clear();
            }
            i++;
            progress(75 + Math.round((i / idbTables.length) * 20), `Logovi (${i}/${idbTables.length})…`);
            await yieldUI();
          }
        });

        // ── localStorage data (whitelist + sanitize) ──
        if (parsed.localStorageData && typeof parsed.localStorageData === "object") {
          for (const [key, value] of Object.entries(parsed.localStorageData as Record<string, unknown>)) {
            if (!ALLOWED_LS_KEYS.has(key)) continue;
            try {
              const parsedVal = typeof value === "string" ? JSON.parse(value) : value;
              const clean = sanitizeLSValue(parsedVal);
              localStorage.setItem(key, JSON.stringify(clean));
            } catch {
              if (typeof value === "string" && !/[<>]/.test(value)) {
                localStorage.setItem(key, value);
              }
            }
          }
        }
        if (strategy === "overwrite") {
          try { localStorage.removeItem("sr-review-session"); } catch {
            /* localStorage may be disabled */
          }
        }

        // ── Toast summary ──
        const extraParts: string[] = [];
        if (legacyResolveReport) {
          const okSum = legacyResolveReport.resolvedSubcategory + legacyResolveReport.resolvedChapter;
          const failSum = legacyResolveReport.unresolvedSubcategory + legacyResolveReport.unresolvedChapter;
          if (okSum > 0) extraParts.push(`mapirano ${okSum} legacy imena (${legacyResolveReport.resolvedSubcategory} podkat. + ${legacyResolveReport.resolvedChapter} glava)`);
          if (failSum > 0) extraParts.push(`bez para resetovano ${failSum} (${legacyResolveReport.unresolvedSubcategory} podkat. + ${legacyResolveReport.unresolvedChapter} glava)`);
        }
        if (parsed.sources.length > 0) extraParts.push(`${parsed.sources.length} izvora`);
        if (parsed.mindMaps.length > 0) extraParts.push(`${parsed.mindMaps.length} mentalnih mapa`);
        if (parsed.diary.length > 0) extraParts.push(`${parsed.diary.length} dnevničkih zapisa`);
        if (parsed.mnemonics.length > 0) extraParts.push(`${parsed.mnemonics.length} mnemoničkih kartica`);
        if (parsed.disciplineLog.length > 0) extraParts.push("disciplinski log");
        if (Array.isArray((parsed as unknown as Record<string, unknown[]>).settings) &&
            ((parsed as unknown as Record<string, unknown[]>).settings).length > 0) {
          extraParts.push(`${((parsed as unknown as Record<string, unknown[]>).settings).length} postavki`);
        }
        if (parsed.pomodoroLog.length > 0) extraParts.push(`${parsed.pomodoroLog.length} pomodoro zapisa`);
        if (parsed.localStorageData) extraParts.push("lokalna podešavanja");
        const extraMsg = extraParts.length > 0 ? ` + ${extraParts.join(", ")}` : "";
        toast.success(`Uspješno uvezeno ${importedCards.length} kartica${extraMsg}.`);
      } catch (err) {
        toast.error(`Greška pri uvozu: ${err instanceof Error ? err.message : "Neispravan format fajla."}`);
      }
    },
    [setCardMapState, setCategoryRecords, setReviewLog, updateSRSettings, cardMapRef],
  );

  // H5 fix: importCards now syncs cardMapRef before setState
  const importCards = useCallback(
    (newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
      const created = newCards.map((c) => createCard(c.question, c.sections, category));
      created.forEach(c => { c.updatedAt = Date.now(); });
      const nextRef = { ...cardMapRef.current };
      created.forEach((c) => { nextRef[c.id] = c; });
      cardMapRef.current = nextRef;
      schedulePersist({ type: "bulk", cards: created });
      setCardMapState(() => nextRef);
      bumpMapVersion();
    },
    [setCardMapState, cardMapRef],
  );

  return { importData, importCards };
}
