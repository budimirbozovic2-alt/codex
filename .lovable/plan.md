

# "Link to Existing Essay" Feature

## Overview
Add a "Poveži sa postojećim" button to the source text selection tooltip that opens a modal showing unlinked essay cards from the same category, allowing the user to link one to the current source.

## Architecture

### 1. New Component: `src/components/LinkToExistingCardModal.tsx`
- Dialog with search input + scrollable card list
- Props: `open`, `onOpenChange`, `sourceId`, `sourceLabel`, `selectedText`, `cards` (from AppContext), `onLink(cardId, sourceId, selectedText)`
- **Pre-filtering** (before search): only cards where `!card.sourceId && card.type !== "flash" && card.category === sourceLabel`
- Search input filters the pre-filtered list by `card.question` (case-insensitive substring)
- Each row shows card question + "Odaberi" button
- On "Odaberi": calls `onLink`, closes modal, clears selection, shows toast "Esej uspješno povezan!"

### 2. Modified: `src/hooks/useSourceLogic.ts`
- Add state: `linkModalOpen` (boolean), `linkSelectedText` (string)
- Add handler `handleLinkToExisting`: saves `selection.text` to `linkSelectedText`, sets `linkModalOpen = true`, clears selection
- Add handler `handleLinkConfirm(cardId, sourceId, selectedText)`: uses `patchCard` to set `sourceId` and append selectedText as a new section titled "Isječak iz izvora"
- Export new state + handlers
- **Problem**: `useSourceLogic` doesn't have access to `patchCard`. Solution: also get `patchCard` from `useAppContext`.

### 3. Check: Does AppContext expose `patchCard`?

Need to verify this before finalizing.

### 4. Modified: `src/components/SourceReader.tsx`
- Import `LinkToExistingCardModal` and `Link` icon
- Add "Poveži sa postojećim" button next to "Pretvori u esej" in the selection tooltip (lines 158-171)
- Render `LinkToExistingCardModal` with props from logic

## Files Changed

| File | Change |
|------|--------|
| `src/components/LinkToExistingCardModal.tsx` | New — search modal with pre-filtered unlinked same-category cards |
| `src/hooks/useSourceLogic.ts` | Add `linkModalOpen`, `linkSelectedText`, handlers for opening modal and confirming link |
| `src/components/SourceReader.tsx` | Add second button in tooltip, render modal |
| `src/contexts/AppContext.tsx` | Expose `patchCard` if not already exposed (need to verify) |

## UI Flow
```text
User selects text in source
  → Tooltip shows: [Pretvori u esej] [Poveži sa postojećim]
  → Click "Poveži sa postojećim"
  → Modal opens with pre-filtered list (unlinked, same category, essay-only)
  → User searches/scrolls, clicks "Odaberi"
  → Card updated: sourceId set, selected text appended as section
  → Toast: "Esej uspješno povezan!"
  → Modal closes
```

## Linking Logic Detail
When user clicks "Odaberi" on a card:
1. `patchCard(cardId, card => ({ ...card, sourceId, sections: [...card.sections, { title: "Isječak iz izvora", content: sanitizeHtml(selectedText), ...defaultSectionState }] }))`
2. Close modal, clear text selection
3. Toast confirmation

