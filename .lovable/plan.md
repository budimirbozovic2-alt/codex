

# Dekompozicija MindMapCanvas.tsx (757 → ~300 linija)

## Struktura razdvajanja

| Novi modul | Sadržaj | ~Linije |
|------------|---------|---------|
| `mindmap/mindmap-constants.ts` | Template-ovi (HIERARCHY, PROCEDURE, SPECIAL), edge presets (EDGE_STYLES, EDGE_COLORS, EDGE_TYPES), `getId()`, `NodeTemplate` tip | ~95 |
| `mindmap/MindMapToolbar.tsx` | Toolbar sa title input, quick-add dropdown, auto-layout, presentation/save dugmad | ~130 |
| `mindmap/EdgeSettingsPanel.tsx` | Panel za podešavanje veza (boja, stil, tip, label, animacija, brisanje) | ~130 |
| `mindmap/mindmap-utils.ts` | `autoLayout()` funkcija i `SnapGuideLines` komponenta | ~65 |
| `mindmap/MindMapCanvas.tsx` | Core canvas — state, callbacks, ReactFlow render | ~300 |

## Zavisnosti

```text
mindmap-constants.ts ←── MindMapToolbar.tsx
         ↑                     ↑
mindmap-utils.ts    ←── MindMapCanvas.tsx (core)
         ↑                     ↑
EdgeSettingsPanel.tsx ─────────┘
```

## Detalji

### `mindmap-constants.ts`
- `NodeTemplate` interface (L46-52)
- `HIERARCHY_TEMPLATES`, `PROCEDURE_TEMPLATES`, `SPECIAL_TEMPLATES` (L54-73)
- `EDGE_STYLES`, `EDGE_COLORS`, `EDGE_TYPES` (L76-96)
- `nodeIdCounter`, `getId()` (L42-43)

### `mindmap-utils.ts`
- `autoLayout()` (L118-158)
- `SnapGuideLines` komponenta (L99-115)

### `EdgeSettingsPanel.tsx`
- Kompletna `EdgeSettingsPanel` funkcija (L161-287)
- Importuje konstante iz `mindmap-constants.ts`

### `MindMapToolbar.tsx`
- Props: `title`, `setTitle`, `dirty`, `isProcedure`, `mode`, `templates`, `onSave`, `onBack`, `onAddTemplate`, `onAddBlank`, `onAutoLayout`, `onPresentation`, `onExport`
- JSX iz L554-648 (toolbar) i L652-663 (presentation bar)

### `MindMapCanvas.tsx` (ostatak)
- Sav state i callback logika ostaje
- Importuje 4 nova modula
- JSX koristi `<MindMapToolbar>`, `<EdgeSettingsPanel>`, `<SnapGuideLines>`

## Scope
- 4 nova fajla, 1 refaktorisan
- 0 promjena u potrošačima (`MindMapPage.tsx`, `MindMapViewer.tsx`)
- Nema novih zavisnosti

