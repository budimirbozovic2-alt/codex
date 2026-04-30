## Goal

Cap the wiki-link auto-creation batch at **50 placeholders per debounce tick** in `ZettelkastenView`. Anything beyond the cap is deferred to the next tick(s); the user is notified once per overflow burst (not once per keystroke).

## File

- **edited**: `src/views/ZettelkastenView.tsx` — extends the existing adaptive-debounce effect (lines 173–218).

## Changes

1. Add a constant `WIKI_LINK_BATCH_CAP = 50` inside the view.
2. Add `lastOverflowNotifiedRef` (a `useRef<number>(0)`) to dedupe overflow notifications across keystrokes.
3. Reset that ref alongside the existing cadence-reset effect on `activeId` change.
4. After computing `pendingAll` (the unresolved candidates):
   - If empty → reset overflow latch and bail (existing behavior).
   - Else slice to the cap: `pending = pendingAll.slice(0, WIKI_LINK_BATCH_CAP)`.
   - If `pendingAll.length > cap` AND the latch value differs from the current overflow size:
     - `console.warn(...)` with both numbers.
     - `toast.warning("Previše novih wiki-linkova (N). Obrađujem 50 po koraku — ostatak slijedi.")`.
     - Update the latch to `pendingAll.length`.
   - If batch shrank back under the cap, clear the latch to 0 so future overflows re-notify.
5. Pass the capped `pending` (not `pendingAll`) to `bulkCreateArticlesIfMissing`.

## Why the tail still gets created

After each successful batch the new placeholders flow into `articles` state → `existingTitleSet` memo updates → next debounce tick sees the remaining unresolved titles as the new "pending" set and processes the next 50. No additional scheduling is needed — the existing effect dependency on `existingTitleSet` already triggers a re-run after each `setArticles`.

## Notification dedup logic

Latch stores the last overflow count we toasted for. While the user keeps typing and the size stays the same → no new toast. If the size changes (paste grew, or one chunk drained), we re-notify with the new number. When count drops to/below 50 the latch clears so the next paste storm notifies fresh.

## Verification

- Type/paste 200 wiki-links: one warning toast + one console.warn, 50 placeholders appear, next tick auto-processes 50 more, etc., until drained.
- Normal typing of 1–10 new links: no warnings, no behavior change.
- Switching articles mid-overflow: latch resets, new article evaluated cleanly.
