

# Zustand Store za SourceReader — Eliminacija kaskadnih re-rendera

## Rezime za korisnika
Uvodimo Zustand kao lightweight state manager za SourceReader modul. Umjesto da jedan gigantski hook gura ~30 state varijabli odozgo ka dolje kroz props, svaka komponenta će direktno čitati samo ono što joj treba iz centralnog store-a. Rezultat: toolbar se ne re-renderuje kad se promijeni selekcija teksta, content se ne re-renderuje kad se promijeni width, itd.

---

## Korak 1: Instalacija Zustand-a
```bash
npm install zustand
```

## Korak 2: Kreiranje `src/store/useSourceReaderStore.ts`

Store sadrži **sav state** koji je trenutno razbijen između `useSourceLogic` i `useSourceReaderLogic`:

**UI slices** (svaka komponenta čita samo svoj):
- `viewMode` → koristi samo Toolbar, Content
- `editMode` → koristi Toolbar, Tooltip, ContextMenu
- `readerWidth` → koristi samo SourceReader layout
- `outlineOpen` → koristi Toolbar, layout
- `examOpen` → koristi Toolbar, layout
- `selection` → koristi Tooltip, ExamSidebar
- `headingMenu` → koristi ContextMenu
- `essayDialogOpen`, `essayQuestion`, `selectedText` → koristi EssayDialog
- `splitSummaryOpen`, `splitResult`, `splitDone`, `splitCreatedCount`, `splitParentName`, `splitModules` → koristi SmartSplitDialog
- `autoSplitOpen` → koristi AutoSplitDialog
- `linkModalOpen`, `linkSelectedText` → koristi LinkModal
- `examQuestions` → koristi ExamSidebar, Toolbar (pending count)

**Computed/derived** (ostaje izvan store-a, u komponenti):
- `safeHtml`, `coverage`, `linkedCount`, `sourceCards` — zavise od `source` prop-a i `cards` iz AppContext, pa se računaju u SourceReader ili malom wrapper hooku

**Actions** (funkcije u store-u):
- `setViewMode`, `setEditMode`, `setReaderWidth`, `setOutlineOpen`, `setExamOpen`, `setSelection`, `setHeadingMenu`
- `openEssayDialog`, `closeEssayDialog`, `openSplitSummary`, `closeSplitSummary`
- `openAutoSplit`, `closeAutoSplit`, `openLinkModal`, `closeLinkModal`
- `setExamQuestions`

**Bitno**: `handleSetHeading`, `handleFormatAsList`, `handleCreateEssay`, `handleSmartSplitConfirm`, `handleLinkConfirm` ostaju kao **eksterni handleri** (ne u store-u) jer zavise od `source` prop-a, `addCard`, `patchCard` iz AppContext. Definišu se u malom `useSourceReaderActions(source)` hooku.

### Store struktura (pseudokod):
```ts
import { create } from "zustand";

interface SourceReaderState {
  // UI state
  viewMode: "standard" | "coverage";
  editMode: boolean;
  readerWidth: ReaderWidth;
  outlineOpen: boolean;
  examOpen: boolean;
  selection: { text: string; x: number; y: number } | null;
  headingMenu: { x: number; y: number; element: HTMLElement } | null;
  
  // Dialog state
  essayDialogOpen: boolean;
  essayQuestion: string;
  selectedText: string;
  autoSplitOpen: boolean;
  splitSummaryOpen: boolean;
  splitResult: SplitResult | null;
  splitDone: boolean;
  splitCreatedCount: number;
  splitParentName: string;
  splitModules: SelectionModule[];
  linkModalOpen: boolean;
  linkSelectedText: string;
  examQuestions: ExamQuestion[];
  
  // Actions
  setViewMode: (m: ViewMode) => void;
  setEditMode: (v: boolean) => void;
  setReaderWidth: (w: ReaderWidth) => void;
  // ... ostale set funkcije
  reset: () => void; // za cleanup kad se SourceReader unmountuje
}
```

### Zlatno pravilo selektora
Svaka komponenta koristi **granularne selektore**:
```ts
// SourceToolbar.tsx — ISPRAVNO
const viewMode = useSourceReaderStore(s => s.viewMode);
const setViewMode = useSourceReaderStore(s => s.setViewMode);

// ZABRANJENO — nikada cijeli state:
// const state = useSourceReaderStore();
```

## Korak 3: Novi `src/hooks/useSourceReaderActions.ts`

Ovaj hook sadrži **side-effect akcije** koje zavise od `source` propa i AppContext-a:
- `handleSetHeading(level, targetEl?)` — čita `contentRef`, piše u IDB
- `handleFormatAsList(type)` — čita `contentRef`, piše u IDB
- `handleFormatSelectionAs(tag)` — delegira na gornje dvije
- `handleConvertToEssay()` — čita `selection` iz store-a, otvara dialog
- `handleCreateEssay()` — čita `essayQuestion`/`selectedText` iz store-a, poziva `addCard`
- `handleSmartSplitConfirm()` — čita split state iz store-a, poziva `addCard`
- `handleLinkToExisting()` / `handleLinkConfirm()` — čita iz store-a, poziva `patchCard`
- `handleMapSelection(questionId)` — čita `selection`/`examQuestions` iz store-a
- `handleContextMenu(e)` — čita `editMode` iz store-a
- `handleMouseUp()` — postavlja `selection` u store
- `scrollToHeading(id)` — čist DOM scroll

**contentRef** ostaje kao `useRef` u ovom hooku.

## Korak 4: Ažuriranje `SourceReader.tsx` — postaje "ljuštura"

```tsx
export default function SourceReader({ source, onBack, onSourceUpdated }: Props) {
  const { actions, contentRef } = useSourceReaderActions(source, onSourceUpdated);
  const viewMode = useSourceReaderStore(s => s.viewMode);
  const readerWidth = useSourceReaderStore(s => s.readerWidth);
  const outlineOpen = useSourceReaderStore(s => s.outlineOpen);
  const examOpen = useSourceReaderStore(s => s.examOpen);
  // ... ostalo

  // Reset store on unmount
  useEffect(() => () => useSourceReaderStore.getState().reset(), []);

  // Derived (ostaje ovdje jer zavisi od source prop-a)
  const sourceCards = useMemo(...);
  const coverage = useMemo(...);
  const safeHtml = useMemo(...);

  return (
    <div className="space-y-4">
      <SourceToolbar source={source} onBack={onBack} onAutoSplit={actions.openAutoSplit} />
      {/* ... */}
    </div>
  );
}
```

## Korak 5: Ažuriranje `SourceToolbar.tsx` — direktno čita store

```tsx
export const SourceToolbar = memo(function SourceToolbar({ source, onBack, onAutoSplit }) {
  const viewMode = useSourceReaderStore(s => s.viewMode);
  const setViewMode = useSourceReaderStore(s => s.setViewMode);
  const editMode = useSourceReaderStore(s => s.editMode);
  const setEditMode = useSourceReaderStore(s => s.setEditMode);
  const readerWidth = useSourceReaderStore(s => s.readerWidth);
  const setReaderWidth = useSourceReaderStore(s => s.setReaderWidth);
  const examOpen = useSourceReaderStore(s => s.examOpen);
  const setExamOpen = useSourceReaderStore(s => s.setExamOpen);
  const outlineOpen = useSourceReaderStore(s => s.outlineOpen);
  const setOutlineOpen = useSourceReaderStore(s => s.setOutlineOpen);
  const examQuestions = useSourceReaderStore(s => s.examQuestions);
  // Props: source, onBack, onAutoSplit (jedini preostali)
  // ...
});
```

Isto za `SourceTooltip`, `SourceContextMenu`, `EssayCreationDialog`, `SmartSplitSummaryDialog`.

## Korak 6: Brisanje starih fajlova
- `src/hooks/useSourceReaderLogic.ts` → obrisati (zamijenjeno store-om + actions hookom)
- `src/hooks/useSourceLogic.ts` → obrisati (logika premještena u store + actions hook)

## Korak 7: Keyboard shortcuts
- Premjestiti `useEffect` za keyboard shortcuts u `useSourceReaderActions.ts`
- Čita `selection`, `editMode`, `essayDialogOpen` itd. iz store-a direktno (`useSourceReaderStore.getState()`)

---

## Fajlovi

| Fajl | Promjena |
|------|----------|
| `package.json` | Dodaj `zustand` dependency |
| `src/store/useSourceReaderStore.ts` | **NOVO** — centralni store |
| `src/hooks/useSourceReaderActions.ts` | **NOVO** — side-effect akcije |
| `src/components/SourceReader.tsx` | Pojednostavi na ljušturu |
| `src/components/source-reader/SourceToolbar.tsx` | Čita direktno iz store-a, manje props |
| `src/components/source-reader/SourceTooltip.tsx` | Čita `selection`, `editMode` iz store-a |
| `src/components/source-reader/SourceContextMenu.tsx` | Čita `headingMenu` iz store-a |
| `src/components/source-reader/EssayCreationDialog.tsx` | Čita essay state iz store-a |
| `src/components/source-reader/SmartSplitSummaryDialog.tsx` | Čita split state iz store-a |
| `src/hooks/useSourceReaderLogic.ts` | **OBRISATI** |
| `src/hooks/useSourceLogic.ts` | **OBRISATI** |

## Guardrails
- FSRS logika: netaknuta
- Zustand selektori: **granularni** — nikada cijeli state u jednoj komponenti
- `source` prop i AppContext (`addCard`, `patchCard`, `cards`): ostaju React-native, ne idu u Zustand
- `contentRef`: ostaje kao `useRef`, ne ide u store
- Store `reset()` se poziva na unmount da ne ostanu stale podaci
- CSS/styling: bez promjena

## Scope
- 11 fajlova (2 nova, 2 obrisana, 7 ažuriranih)
- ~400 linija (store ~120, actions hook ~180, ostalo refaktoring)
- 1 nova dependency: `zustand`

