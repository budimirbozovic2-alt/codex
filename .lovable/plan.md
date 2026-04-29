## Goal

Restructure `SubjectCardsView` from a flat 4-tab strip into a clear 2-group hierarchy, drop the Mnemonics section entirely, and upgrade `PassiveReader` into a richer reading workspace with FSRS stats, a parallel Source/Mind-map side panel, and a quick "Edit" shortcut.

---

### 1. SubjectCardsView reorganization

Replace the single `Tabs` + 4-trigger `TabsList` with two visually grouped sections rendered above the content area:

```text
┌─ UPRAVLJANJE ────────────────────────────────────────────┐
│  [✏ Uređivanje i dodavanje kartica]  [⛓ Struktura i raspored kartica] │
└──────────────────────────────────────────────────────────┘

┌─ UČENJE ─────────────────────────────────────────────────┐
│  [📖 Pasivno čitanje]                                     │
└──────────────────────────────────────────────────────────┘

[ active section content here ]
```

Implementation details:

- Keep the `Tabs` primitive but split its `TabsList` into two labelled `<div>` groups separated by a faint divider/header (small uppercase "UPRAVLJANJE" / "UČENJE" labels in `text-muted-foreground`). The active trigger keeps the same primary highlight as today.
- Tab values: `manage`, `structure`, `read`. Drop `mnemonics`.
- Rename triggers:
  - `manage` → "Uređivanje i dodavanje kartica" (icon `Pencil`)
  - `structure` → "Struktura i raspored kartica" (icon `Network`/`ListOrdered`)
  - `read` → "Pasivno čitanje" (icon `BookOpen`)
- Header subtitle updated to "Kartice — uređivanje, struktura i pasivno čitanje" (drops "mnemonika").
- Remove imports of `MnemonicModule` and `Brain`. Remove the `<TabsContent value="mnemonics">` block.

The content of each tab (`CardViewMode` + filter bar, `CardOrgMode` + structure dialog button, `PassiveReader`) stays as-is wiring-wise; only the trigger UI changes.

### 2. Upgraded PassiveReader

Rewrite `src/components/subject-cards/PassiveReader.tsx` into a richer workspace.

**Header (next to question title)** — small inline FSRS stat chips computed from `card.sections`:

- Reviews count: sum of `(section.state !== New ? 1 : 0) * max(reps,1)` … since we don't track explicit reps, use `card.readCount ?? 0` which is already on the Card.
- Lapses: sum of `section.lapses` across sections.
- Avg stability (days): mean of `section.stability` over reviewed sections, displayed as `~Xd` (helper "snaga"/strength).
- Retention now: `getCardRetrievability(card)` from `@/lib/spaced-repetition`, displayed as `XX%` with semantic color (green ≥80, amber ≥50, red <50).
- "New" badge if all sections are `SectionState.New`.

Render as small `Tooltip`-wrapped chips in a row beneath the question; chip primitives are plain `<span>` with `bg-muted/40` rounded.

**Quick Edit shortcut** — top-right `Button` "✎ Uredi karticu" that calls the same edit flow used by the Pregled tab:

```ts
sessionStorage.setItem("sr-edit-return-view", "subject-cards:" + categoryId);
setEditingCard(current);
navigate("/edit");
```

To keep `PassiveReader` decoupled, accept a callback prop `onEditCard?: (card: Card) => void` and wire it from `SubjectCardsView` (which already imports `setEditingCard` and `useNavigate`).

**Parallel Source/Mind-map side panel**:

- New local state `const [sidePanel, setSidePanel] = useState<"source" | "mindmap" | null>(null);`. Reset to `null` whenever `current.id` changes (effect on `current?.id`).
- Toolbar above the card has two toggle buttons:
  - "📑 Izvor" — disabled if `!current.sourceId`. Toggles `sidePanel` between `"source"` and `null`.
  - "🗺️ Mapa uma" — always enabled per subject (mind maps are subject-scoped), toggles `"mindmap"` / `null`.
- When a side panel is active the workspace becomes a 2-column grid (`lg:grid-cols-2`); otherwise single column (full width as today).
- **Source panel**: load the card's source on demand via `getSource(current.sourceId)` (already exported from `src/lib/sources-storage.ts`). Render a header (title + "Pun prikaz" button that uses the existing `sessionStorage["sr-open-source-id"]` + `navigate('/category/${categoryId}')` pattern from `SourceSidePanel`) and a sanitized scrollable HTML body. To avoid duplicating that component, **reuse `<SourceSidePanel>`** from `src/components/zettelkasten/SourceSidePanel.tsx` (it already accepts `{source, categoryId, onClose}`). Pass `categoryId` from props.
- **Mind-map panel**: lightweight inline picker — `loadMindMaps()` filtered to `categoryId`, list as buttons. When the user picks one, render `<MindMapViewer>` (lazy) inside a fixed-height (e.g. `min-h-[420px] flex-1`) bordered box. New tiny component `src/components/subject-cards/MindMapSidePanel.tsx` with header (title + close + "Otvori sve mape" link to `/subject/${categoryId}/mind-maps`), back button to picker, and lazy `MindMapViewer`.
- The PassiveReader receives `categoryId` as a new prop so both panels can route correctly.

**Layout**:

```text
┌───────────── card column ───────────────┐ ┌── side panel ──┐
│ filters · pager                          │ │ Source / Map   │
│ [Izvor] [Mapa uma]   ····  [Uredi]       │ │                │
│ ┌─ Article ─────────────────────────┐    │ │                │
│ │ "Pasivno čitanje"                 │    │ │                │
│ │ Q: ...                            │    │ │                │
│ │ chips: reviews · lapses · ret%    │    │ │                │
│ │ sections...                       │    │ │                │
│ └───────────────────────────────────┘    │ │                │
│ [← prev]  ←/→  [next →]                  │ │                │
└──────────────────────────────────────────┘ └────────────────┘
```

### 3. Files

| File | Change |
|---|---|
| `src/views/SubjectCardsView.tsx` | Split tab triggers into two grouped sections; rename labels; remove `mnemonics` tab + `MnemonicModule` import; pass `categoryId` and `onEditCard` to `PassiveReader`. |
| `src/components/subject-cards/PassiveReader.tsx` | New props `categoryId`, `onEditCard`. Add FSRS stat chips, source/mindmap toggle toolbar, side-panel grid, on-demand source load via `getSource`, lazy mind-map panel, quick Edit button. |
| `src/components/subject-cards/MindMapSidePanel.tsx` (new) | Picker → lazy `MindMapViewer` with header. Reuses `loadMindMaps` filtered by `categoryId`. |

### 4. Out of scope

- No data-model changes (cards still don't have a direct mind-map FK; we offer a subject-scoped picker instead, which is honest).
- The mnemonics module is reachable globally from the sidebar (`/mnemonics`) and from the embedded picker in CardEditor — removing the tab does not orphan it.
- `CardViewMode`, `CardOrgMode`, `StructureManagerDialog`: untouched.
