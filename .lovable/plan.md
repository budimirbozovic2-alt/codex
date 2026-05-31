# PR-G5 (RC-5): Selektori i render disciplina (DnD Organizer)

Cilj: smanjiti reconciliation cost u `CardOrgMode` (drag-and-drop organizator)
gdje pointer-move tokom DnD-a trigeruje render cijelog stabla, što je sa
200+ kartica i 5+ potkategorija dovodilo do dropped frame-ova.

## Izmjene

### 1. `OrgSubcategoryPanel` — hoisting derived maps
- `availableChapters`, `chapterIdMap`, `otherSubs`, `subIdMap` su prebačeni
  iz inner `node.unassigned.map(...)` callback-a na panel-scope kroz `useMemo`.
- Per-row callbacks (`onAssignChapter`, `onMoveSub`) prebačeni u stabilne
  `useCallback` faktorije (`makeAssignChapter`/`makeMoveSub`) — eliminiše
  novu funkcijsku referencu na svaki render.
- Komponenta sada izvezena kroz `React.memo(OrgSubcategoryPanelInner)`.

### 2. `OrgCardTiles.tsx` — memoizacija drop zone-a i unassigned row-a
- `DroppableChapterZone` wrap-ovan u `React.memo`. `useDroppable` već
  izoluje `isOver` stanje → ostali pointer-move event-i ne reconcile-uju
  zonu.
- `UnassignedCardRow` wrap-ovan u `React.memo` sa custom komparatorom koji
  poredi `card.updatedAt`, `index`, oba lookup array-a po identity-ju i obje
  callback reference. Sve su sada stabilne nakon (1).
- `SortableCardTile` već bio memoiziran (PR-G6/RC-6) — zadržan.

### 3. Regresioni test `src/test/pr-g5-render-discipline.test.ts`
- Provjerava `$$typeof === Symbol.for("react.memo")` za sva četiri kompo-
  nenta (panel, drop zone, unassigned row, sortable tile).
- Statički guard: čita `OrgSubcategoryPanel.tsx` i fail-uje ako se ikad
  ponovo uvedu in-callback alokacije `availableChapters` / `chapterIdMap` /
  `otherSubs` / `subIdMap`.

### 3. Virtualizacija DnD chapter liste (`react-window` v2 + dnd-kit shim)

`src/components/category/org-mode/VirtualSortableCardList.tsx`:

- `react-window` v2 `<List />` sa fixed `rowHeight = 50px` (SortableCardTile + gap).
- **Shim:** parent `<SortableContext>` u `OrgSubcategoryPanel` ostaje SSOT
  za potpunu listu ID-ova (`ch.cards.map(c => c.id)`). Virtualizovana
  komponenta NE wrap-uje drugi `SortableContext` (duplo nesting kvari
  dnd-kit index math). `<DragOverlay />` iz `CardOrgMode` (portal u
  `document.body`) preživljava unmount source row-a kad virtualizator
  scroll-uje granu van viewport-a.
- `overscanCount = 8` pokriva edge drag-and-drop dok dnd-kit `useAutoScroll`
  ne uhvati scrollable ancestor i ne dovuče sljedeće rows.
- Threshold: `VIRTUALIZATION_THRESHOLD = 30`. Ispod toga inline render —
  overhead virtualizacije (constant mount/unmount + `MeasuringStrategy.Always`)
  ne isplati se za male liste.
- Unassigned sekcija (`UnassignedCardRow` sa Select dropdown-ima) namjerno
  ostavljena inline — varijabilna visina + portal Select-i komplikuju
  virtualizaciju, a typično ima <20 stavki.

### 4. Regresioni testovi

- `src/test/pr-g5-render-discipline.test.ts` — 5 testova: memo guard za
  panel/zone/row/tile + statički guard protiv re-uvođenja in-callback
  alokacija.
- `src/test/pr-g5-dnd-virtualization.test.ts` — 5 testova: memo guard za
  `VirtualSortableCardList`, threshold sanity, panel wire-up,
  no-nested-SortableContext invariant, `DragOverlay` portal shim
  preživio u `CardOrgMode`.

## Što PR-G5 NE radi

- Ne virtualizuje `UnassignedCardRow` (variable height, portal Select-i).
- Ne dira `MnemonicWorkshop` koji već koristi `react-window`.
- Ne mijenja DnD semantiku ni `useCardOrgDnd` hook.

## Verifikacija

- `bunx tsc --noEmit` — 0 grešaka.
- `bunx vitest run pr-g5-render-discipline` — 5/5 ✓.
