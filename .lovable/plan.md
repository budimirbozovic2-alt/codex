# P2 — Arhitekturne suboptimizacije

Plan se izvršava u 6 nezavisnih koraka. Svaki korak je samostalno mergeabilan; redoslijed dolje je preporučen po riziku/koristi.

## Korak 1 — Dekompozicija velikih komponenti (P2 #9)

**Mete (verifikovane):**
- `src/components/source-reader/SmartSplitSummaryDialog.tsx` — 601 linija
- `src/components/mindmap/MindMapNode.tsx` — 390 linija
- `src/components/workshop/WorkshopCardItem.tsx` — 428 linija

**Pristup (Orchestrator pattern, per memory):**

```text
SmartSplitSummaryDialog.tsx (UI <250)
  ├─ hooks/smart-split/useSplitPreviewState.ts   (split/merge/reorder reducer)
  ├─ hooks/smart-split/useSplitCommit.ts          (commit pipeline + toasts)
  └─ hooks/smart-split/useSplitValidation.ts      (empty/duplicate detekcija)

MindMapNode.tsx (UI <200)
  ├─ hooks/mindmap/useNodeEditing.ts              (inline edit, blur/escape)
  └─ hooks/mindmap/useNodeMenu.ts                 (context menu actions)

WorkshopCardItem.tsx (UI <250)
  ├─ hooks/workshop/useCardItemMutations.ts       (rename/delete/move)
  └─ hooks/workshop/useCardItemDragState.ts       (drag handles, selection)
```

**Acceptance:** sve 3 UI komponente <250 linija; vitest suite zelena; nema regresije u Smart-Split wizard-u, MindMap editing sesiji, WorkshopCardItem rename/delete.

## Korak 2 — `SRSettingsPanel.tsx` ref konsolidacija (P2 #10)

- Uvesti `src/hooks/useLatestRef.ts`:
  ```ts
  export function useLatestRef<T>(value: T) {
    const ref = useRef(value);
    useEffect(() => { ref.current = value; }, [value]);
    return ref;
  }
  ```
- Zamijeniti 4–5 manualnih `xRef.current = x` parova jednim pozivom po polju.
- 7 useEffect-a redukovati grupisanjem onih čiji deps liste su podskupovi.
- Cast cleanup za 6 `as unknown as Record<string, unknown>` već je pokriven u prethodnom P0 koraku (`shallowEqual` relax) — provjeriti da nema preživjelih.

**Acceptance:** SRSettingsPanel <230 linija; 0 manualnih `Ref.current = ` linija; 0 `as unknown as` u fajlu.

## Korak 3 — Mnemonics memory sync (P2 #11)

Verifikovano: ruta `/subject/:categoryId/mnemonics` je **i dalje aktivno linkovana** iz `src/views/subject-cards/SubjectHeader.tsx:60`. Memorija `subject-cards-hub-v2` je netačna.

**Akcija:** ažurirati `mem://features/subject-cards-hub-v2` — ukloniti tvrdnju "Mnemonics removed", dodati notu da je Mnemonics zaseban route handler dostupan iz SubjectHeader linka. Nema kod izmjena.

## Korak 4 — Console strip u produkciji (P2 #12)

130 `console.*` poziva u 53 fajla.

**Pristup:** centralizovani `src/lib/logger.ts` + Vite esbuild `drop` opcija u prod modu (nul-dependency, tree-shake-friendly).

```ts
// vite.config.ts (prod only)
esbuild: { drop: mode === 'production' ? ['console', 'debugger'] : [] }
```

Plus `src/lib/logger.ts` sa `log/warn/error` koji u dev pozivaju `console.*`, u prod ostaju no-op (osim `error` koji ide u postojeći crash log path). Postojeći `console.*` pozivi ostaju za sada — esbuild ih dropuje. Postepena migracija na `logger` u kasnijim PR-ovima.

**Acceptance:** prod build (`vite build`) emituje 0 `console.log` u dist chunks (provjeriti `rg "console\.log" dist/assets/`); dev nepromijenjen.

## Korak 5 — JSON.stringify u equality hot path-u (P2 #13)

34 `JSON.stringify` poziva. Triage:
- **Persist boundary** (Dexie write, backup export, IPC): zadržati.
- **Equality / diff / dependency keys** u hooks/contexts: zamijeniti `shallowEqual` (već postoji u `src/lib/struct-eq.ts`) ili `dequal` (jedna mala dep, već u tree ako nije — provjeriti).

Konkretne meta-lokacije identifikuju se u Step 5 PR-u (rg pass + manualna kategorizacija). Cilj: <15 `JSON.stringify` u non-persist kodu.

**Acceptance:** 0 `JSON.stringify` u `useEffect` deps, `useMemo` deps, ili equality return path-ovima; perf benchmark FSRS grade akcije nepromijenjen ili bolji.

## Korak 6 — Fix 4 failing testa (P2 #14)

### 6a. `backup-schema.test.ts:55` — Zod passthrough

Zod `.passthrough()` na nested objektu ne propagira na root parse ako root koristi `.strict()` ili `.strip()`. Audit `src/lib/backup/schema.ts`:
- Ako je root `z.object({...})` (default = strip) → unknown polja se gube.
- Fix: koristiti `.passthrough()` na svim level-ima koji moraju preživjeti round-trip, ili eksplicitno `z.record(z.unknown())` za "extras" polje.

### 6b. `zettelkasten-wiki-link-integration.test.ts:206,261,300` — `backlinkIndex.getVersion()`

Test očekuje da svaki `addBacklink/removeBacklink` bumpa `version`. Trenutno `version` se inkrementira samo u `rebuildFromAll`. Fix: bump u svim mutacijama (`addBacklink`, `removeBacklink`, `removeSubject`, `setAlias`).

**Acceptance:** sve 4 testa zelena; ukupan suite 398/398.

---

## Tehnički sažetak

| Korak | Fajlovi | Risk | Test pokrivenost |
|---|---|---|---|
| 1 | 3 komponente + 7 novih hooks | M | postojeći vitest |
| 2 | `SRSettingsPanel.tsx` + `useLatestRef.ts` | L | manual smoke |
| 3 | samo `mem://` | L | n/a |
| 4 | `vite.config.ts` + `logger.ts` | L | prod build inspekcija |
| 5 | ~10–15 fajlova | M | postojeći vitest + perf check |
| 6 | `backup/schema.ts`, `backlinkIndex.ts` | L | 4 testa zelena |

**Out of scope:** P0/P1 stavke, dalja `as unknown as` čišćenja izvan SRSettingsPanel, `react-refresh/only-export-components` warninzi, refactor `body-pointer-events-guard`.

**Predloženi redoslijed izvršavanja:** 3 → 6 → 4 → 2 → 1 → 5 (od najjeftinijeg/najsigurnijeg ka najobimnijem).