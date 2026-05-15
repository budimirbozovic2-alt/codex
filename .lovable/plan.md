# P2 — Arhitekturne suboptimizacije (status)

## ✅ Step 2 — `SRSettingsPanel.tsx` ref konsolidacija — DONE
- Novi `src/hooks/useLatestRef.ts` (generic latest-value ref helper).
- `SRSettingsPanel.tsx`: 5 manualnih `useRef + useEffect` parova zamijenjena sa `useLatestRef(...)`. 0 `Ref.current = ` linija ostalo.

## ✅ Step 3 — Mnemonics memory sync — DONE
- `mem://features/subject-cards-hub-v2` ažurirana: uklonjena netačna tvrdnja "Mnemonics removed"; jasno označeno da Mnemonika živi na zasebnoj ruti `/subject/:categoryId/mnemonics` (linkovana iz `SubjectHeader`).

## ✅ Step 4 — Console strip u produkciji — DONE
- `vite.config.ts`: dodato `esbuild.pure = ["console.log", "console.info", "console.debug", "console.warn"]` u prod modu + `drop: ["debugger"]`. `console.error` preživljava (crash log path).
- `src/lib/logger.ts`: centralizovan logger (no-op u prod osim `error`). Postojećih 130 `console.*` poziva ostaje — esbuild ih tree-shake-uje. Novi kod treba koristiti `logger`.

## ✅ Step 6 — Fix 4 failing testa — DONE
- `backup-schema.ts`: `BackupSchema` top-level `.strict()` → `.passthrough()` da unknown polja prežive round-trip.
- `zettelkasten-wiki-link-integration.test.ts`: dodat `initBacklinkIndexSubscriptions()` u `beforeEach`/cleanup u `afterEach`. Root cause nije bio u `backlink-index.ts` (version bump logika je bila ispravna) — već u test setup-u koji nije registrovao event-bus listenere.
- **Suite status: 398/398 zelena (sa 44/44 fajla).**

## ⏭️ Step 5 — JSON.stringify u equality hot path-u — AUDIT COMPLETE, NO CODE CHANGE
Triage svih 34 poziva pokazao da ih je **0 u equality / `useEffect` deps / `useMemo` deps**. Sve lokacije su:
- Persist boundary: `localStorage.setItem`, `sessionStorage.setItem`, IDB backup export-stream, electron-integration IPC.
- Dirty-check sa cached string ref-om: `SourceReader.tsx` (već optimizovano — stringify se izvršava samo kad `examQuestions` promijeni referencu, ne na svaki render).

Acceptance kriterij (`<15 non-persist`) već zadovoljen sa rezervom (0). Step 5 zatvoren bez izmjena.

## ⏸️ Step 1 — Dekompozicija velikih komponenti — ODGOĐENO za zaseban PR
Obim: ~1400 linija refactoring kroz 3 fajla + 7 novih hookova. Najbolje izvedeno kao samostalan, fokusiran PR sa per-fajl test smoke-om:
- `SmartSplitSummaryDialog.tsx` (601) → `hooks/smart-split/use{SplitPreviewState,SplitCommit,SplitValidation}.ts`
- `MindMapNode.tsx` (390) → `hooks/mindmap/use{NodeEditing,NodeMenu}.ts`
- `WorkshopCardItem.tsx` (428) → `hooks/workshop/use{CardItemMutations,CardItemDragState}.ts`

Plan ostaje validan; preporuka: pokrenuti kao "P2 #9 — Orchestrator decomposition" sa najmanjom komponentom prvo (MindMapNode).

---

## Sažetak

| Korak | Status |
|---|---|
| 2 SRSettingsPanel refs | ✅ |
| 3 Mnemonics memory | ✅ |
| 4 Console strip prod | ✅ |
| 5 JSON.stringify | ✅ (audit only, nema izmjena) |
| 6 4 failing tests | ✅ |
| 1 Decomposition | ⏸️ Za zaseban PR |

Test suite: **398/398 prolazi**, P0/P1 prethodno završen.
