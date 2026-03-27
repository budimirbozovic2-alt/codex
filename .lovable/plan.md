

# UX Fix: Source Card CTA + Edit Date Field

## Problems
1. **"Čitaj" (Eye) button blends in** with edit/delete/version icons — all same ghost style, all hidden behind hover opacity. The primary action (reading the source) should be visually prominent.
2. **Edit dialog missing date field** — `handleEditSource` only loads `editLabel` and `editGazette`, no `editDate`. The edit dialog has no date input.

## Changes — single file: `src/views/SourcesView.tsx`

### 1. Promote "Čitaj" button to primary CTA
- Move the Eye/read button OUT of the hover-only icon group
- Make it a visible, always-shown `variant="default"` or `variant="outline"` button with text label "Čitaj"
- Keep edit/delete/version/diff as ghost icon buttons in the hover group

### 2. Add date editing to edit dialog
- Add `editDate` state (initialized from `editingSource.date` in `handleEditSource`)
- Add date input to the edit dialog (between label and gazette fields)
- Include `date: editDate` in the `handleSaveEdit` updated source object

### Files changed
| File | Change |
|------|--------|
| `src/views/SourcesView.tsx` | Add `editDate` state; update `handleEditSource` + `handleSaveEdit`; add date input to edit dialog; restyle read button as primary CTA |

