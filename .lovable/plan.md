

# Read-Only Refaktor Mentalnog Kostura / Mape Znanja

## Rezime
Pretvaramo cijeli modul Mentalni Kostur u read-only vizuelizaciju. Brišemo svu DnD logiku, chapter management UI, i navigator/auditor mode toggle. Preimenovujemo `DraggableCardTile` u `SkeletonCardTile`. Komponenta postaje lagani, informativni dashboard stanja znanja.

---

## Promjene po fajlovima

### 1. PREIMENOVANJE: `DraggableCardTile.tsx` → `SkeletonCardTile.tsx`

Kreiramo novi fajl `src/components/mental-skeleton/SkeletonCardTile.tsx`, brišemo stari.

- Ukloniti: `useSortable`, `CSS` iz `@dnd-kit`, `GripVertical` ikonu, `attributes/listeners/transform/transition/isDragging`
- Ukloniti: `mode` prop — svi tile-ovi sada uvijek prikazuju mastery boju (auditor stil)
- Zadržati: `getCardMasteryLevel`, `getMasteryColor`, tooltip sa stabilnošću, error dot indikator
- Interfejs: `{ card: Card; onClick: () => void }`

### 2. `src/components/mental-skeleton/ChapterBox.tsx` (~50 linija manje)

- Ukloniti: `useDroppable` iz `@dnd-kit/core`, `SortableContext`/`rectSortingStrategy` iz `@dnd-kit/sortable`
- Ukloniti: `isOver` logiku, drop highlight stilove (`ring-2 ring-primary`, `← Pusti ovdje`)
- Ukloniti: `mode` prop — nema navigator/auditor razlike
- Ukloniti: `onRename`, `onDelete`, `onMoveUp`, `onMoveDown` prop-ove i njihov UI (Edit3, Trash2, ArrowUp, ArrowDown dugmad)
- Zamjena import: `DraggableCardTile` → `SkeletonCardTile`
- Zadržati: Collapsible, progress bar, mastery bar, section stats tooltip
- Interfejs: `{ chapter: string; cards: Card[]; isOpen: boolean; onToggle: () => void; onCardClick: (card: Card) => void }`

### 3. `src/components/MentalSkeleton.tsx` (~150 linija manje)

- Ukloniti importi: `DndContext`, `PointerSensor`, `useSensor`, `useSensors`, `DragEndEvent`, `DragOverlay`, `DragStartEvent`, `MeasuringStrategy`, `arrayMove`, `createPortal`, `toast`, `DraggableCardTile`, `Plus`, `X`
- Ukloniti props: `onUpdateChapters`, `onReviewSection` — komponenta postaje read-only
- Ukloniti: `useChapterManagement` hook i sav chapter CRUD UI (dodaj/preimenuj/obriši glavu)
- Ukloniti: `mode` state, mode toggle UI, `activeId`, `handleDragStart`, `handleDragEnd`, `findChapterForCard`, `sensors`, `DndContext` wrapper, `DragOverlay` portal
- Ukloniti: `handleGradeSection` (nema review iz ovog modula)
- Zadržati: `selectedCard` + `LearnModal` za read-only pregled kartice (klik otvara modal sa detaljima, ali bez ocjenjivanja)
- Zadržati: mastery legend, chapter collapsible expand/collapse, `AuditorDetailPanel`
- Props: `{ cards: Card[]; subcategory: string; category: string; onBack: () => void }`

### 4. `src/components/KnowledgeMap.tsx` (~10 linija)

- Ukloniti iz Props: `onUpdateChapters`, `onReviewSection`
- L139: Ukloniti uslov `&& onUpdateChapters && onReviewSection` — detail view se uvijek renderuje
- L151-158: `MentalSkeleton` prima samo `cards, category, subcategory, onBack` — bez callback-ova

### 5. `src/views/KnowledgeMapPage.tsx` (~5 linija)

- Ukloniti: `bulkUpdateChapter`, `reviewSection` iz `useCardContext()` destrukturiranja
- Ukloniti: `onUpdateChapters` i `onReviewSection` prop-ove sa `<KnowledgeMap>`

### 6. `src/components/mental-skeleton/types.ts`

- Ukloniti: `Mode` tip (više nema navigator/auditor)
- Zadržati: `UNASSIGNED_CHAPTER`

### 7. `src/hooks/useChapterManagement.ts`

- NE BRIŠEMO — koristi se i iz drugih mjesta potencijalno. Ali MentalSkeleton ga više ne importuje.

### 8. Cleanup importa u `LearnModal.tsx` i `AuditorDetailPanel.tsx`

- Provjeriti da li koriste `Mode` tip i ukloniti ako da (LearnModal se otvara uvijek, AuditorDetailPanel isto)

---

## Vizuelna promjena

```text
PRIJE:                              POSLIJE:
┌─ Navigator / Auditor ─┐          ┌─ Mentalni Kostur ────────┐
│ [+ Dodaj Glavu]        │          │ Legenda mastery boja     │
│ DnD: prevuci kartice   │   →      │                          │
│ Edit/Delete/Move glave │          │ Glava 1 [▓▓▓░░] 72%     │
│ Mode toggle dugmad     │          │   ■ ■ ■ ■ (read-only)   │
└────────────────────────┘          │ Nekategorisane [░░] 0%   │
                                    └──────────────────────────┘
```

Svaka kartica tile prikazuje mastery boju. Klik otvara detail panel. Nema prevlačenja, editovanja, niti dodavanja glava.

---

## Scope
- 3 fajla značajno smanjeni (MentalSkeleton, ChapterBox, DraggableCardTile→SkeletonCardTile)
- 2 fajla minor cleanup (KnowledgeMap, KnowledgeMapPage)
- 1 fajl preimenovan (DraggableCardTile → SkeletonCardTile)
- 1 fajl types.ts cleanup
- Netto: ~200 linija manje koda
- Nema novih zavisnosti
- FSRS: netaknut

