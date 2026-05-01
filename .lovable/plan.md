# Extract `useWikiLinkAutoCreate` from `ZettelkastenView`

Refactors the wiki-link auto-create concern out of the 681-line `ZettelkastenView.tsx` orchestrator into a single-purpose hook. **Behaviour is preserved verbatim** — same adaptive debounce, same 50-item batch cap, same overflow-toast latch, same Dexie transaction boundary. No other logic in the view is touched.

## Scope of code moved

From `src/views/ZettelkastenView.tsx`, the following two blocks are removed:

1. **Lines 152–160** — the `existingTitlesLowerRef` declaration and its sync `useEffect`. Verified via ripgrep that this ref is referenced **only** by the auto-create effect, so it correctly belongs in the new hook.
2. **Lines 205–311** — the entire wiki-link auto-create block: cadence refs (`lastKeystrokeAtRef`, `lastIntervalRef`, `lastOverflowNotifiedRef`), the `WIKI_LINK_BATCH_CAP` constant, the per-`activeId` reset effect, and the main `useEffect` that runs `matchAll(/\[\[([^\]]+)\]\]/g)` and dispatches `bulkCreateArticlesIfMissing`.

Three imports (`bulkCreateArticlesIfMissing`, `eventBus`, `EVENT_TYPES`, `toast`) become unused in the view if no other call site needs them — I will only drop them from `ZettelkastenView.tsx` if `rg` confirms they are no longer referenced after removal.

## New file: `src/hooks/useWikiLinkAutoCreate.ts`

Exports a single hook:

```ts
useWikiLinkAutoCreate({
  activeId,            // string | null  — resets cadence/overflow on switch
  categoryId,          // string | undefined
  isEditing,           // boolean        — gates the effect
  draftContent,        // string | undefined — primary trigger
  rootSubcategoryId,   // string | null | undefined — passed through to storage
  articles,            // KnowledgeBaseArticle[] — keeps title set fresh + drains overflow tail
  setArticles,         // React state setter
}): void
```

Internally owns:
- `existingTitlesLowerRef` and its sync effect (moved from view).
- Cadence + overflow-latch refs.
- Per-`activeId` reset effect.
- Main debounced auto-create effect (the **strict debounce** required by the task — adaptive 300–1000ms `setTimeout` cleared on every keystroke, so the regex + IDB `bulkCreateArticlesIfMissing` call only fire after the user pauses).

The regex literal is hoisted to module scope (`WIKI_LINK_RE`) so the same compiled regex object is reused across runs — small win, but free.

## Edit to `src/views/ZettelkastenView.tsx`

- **Add import** near the top: `import { useWikiLinkAutoCreate } from "@/hooks/useWikiLinkAutoCreate";`
- **Delete** lines 152–160 (the `existingTitlesLowerRef` block, including the surrounding "Always-current title lookup…" comment).
- **Delete** lines 205–311 (the entire auto-create section, including its header comment, cadence refs, `WIKI_LINK_BATCH_CAP` constant, reset effect, and main effect).
- **Insert** in their place a single call:

```tsx
// ── Auto-create placeholder articles for new [[Wiki Links]] (extracted) ──
useWikiLinkAutoCreate({
  activeId,
  categoryId,
  isEditing,
  draftContent: draft?.content,
  rootSubcategoryId: activeArticle?.rootSubcategoryId,
  articles,
  setArticles,
});
```

Placement: right after the cleanup-flush effect at line 203 (preserves the original ordering of "persistence → wiki-link auto-create → mutations").

## Verification after edit

- `rg -n "matchAll|WIKI_LINK_BATCH_CAP|existingTitlesLowerRef|lastKeystrokeAtRef|lastOverflowNotifiedRef" src/views/ZettelkastenView.tsx` → must return zero hits.
- `rg -n "bulkCreateArticlesIfMissing" src/views/ZettelkastenView.tsx` → must return zero hits; remove the import if so.
- Confirm `eventBus`, `EVENT_TYPES`, `toast` still used elsewhere in the view (they are — `flushDraft`, `handleCreate`, etc.) so their imports stay.

## What is **not** changed

- `flushDraft`, draft state, edit-mode toggling, `handleWikiLink` (the click handler at line 409), `handleCreate`, explorer/preview/sidebar wiring — all untouched.
- No changes to `zettelkasten-storage.ts`, `event-bus.ts`, or any other file.
- No behavioural change for the user. The debounce timing, batch cap, toast copy, and side-effect order are byte-for-byte the same.
