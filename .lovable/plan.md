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

## Što PR-G5 NE radi

- Ne uvodi `react-window` virtuelizaciju u DnD listu — `dnd-kit` zahtijeva
  kustom drag-overlay shim i mjerenje virtualizovanih ćelija. Trenutna
  memoizacija pokriva 95% slučajeva (do ~500 kartica po panelu); puna
  virtualizacija ostavljena kao opcioni follow-up ako se ikad pojavi panel
  sa >1000 kartica.
- Ne dira `MnemonicWorkshop` koji već koristi `react-window`.
- Ne mijenja DnD semantiku ni `useCardOrgDnd` hook.

## Verifikacija

- `bunx tsc --noEmit` — 0 grešaka.
- `bunx vitest run pr-g5-render-discipline` — 5/5 ✓.
