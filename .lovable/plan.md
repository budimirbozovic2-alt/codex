## Goal

Eliminate the `Proxy` indirection in `CardProvider` and the 308-line `useCards` distributor. Replace them with **independent domain providers**, one per sub-hook, each exposing a stable actions context. Public hook names (`useCardData`, `useCardActions`, `useCategoryData`, `useReviewData`) stay identical so all 60+ consumers keep working unchanged.

## Why this is safe

- All five sub-hooks (`useCardCRUD`, `useCardAnnotations`, `useCategoryManagement`, `useCardImport`, `useCardExport`) **already** wrap every returned function in `useCallback` with correct deps. The references are stable today; the Proxy was masking, not enabling, that stability.
- `useCardBootstrap` returns only `{ ready, dbError }` — trivially extractable.
- `useCards` itself only owns: 4 `useState`s, the `cardMapRef`, three `useEffect` listeners (quit-flush, source link clear, review-confirm, orphan reload), and one big derived-state `useMemo` (dueCards/stats/categoryStats/cardCountByCategory).
- Public consumers import only `useCardData` / `useCardActions` / `useCategoryData` / `useReviewData` from `@/contexts/AppContext` — verified, only `CardProvider.tsx` imports `useCards` directly. No external file changes required.

## Target architecture

```text
AppProvider
  ├─ CardStateProvider          (owns cardMap state + cardMapRef + boot + derived stats)
  │    exposes useCardData, useReviewData
  │
  ├─ CategoryStateProvider      (owns categoryRecords state)
  │    exposes useCategoryData
  │
  ├─ CardActionsProvider        (mounts useCardCRUD + useCardAnnotations, value = stable object)
  │    exposes useCardActions (CRUD + annotations slice)
  │
  ├─ CategoryActionsProvider    (mounts useCategoryManagement)
  │    exposes useCategoryActions  ← NEW, but useCardActions also re-exports for back-compat
  │
  ├─ BackupActionsProvider      (mounts useCardImport + useCardExport)
  │    exposes useBackupActions    ← NEW, also surfaced via useCardActions back-compat
  │
  ├─ PomodoroProvider, UIProvider (unchanged)
```

State providers must mount **above** action providers because actions need `setCardMapState` / `cardMapRef` / `setCategoryRecordsState` from state. We pass these down via a thin internal context (not exported) — no prop drilling beyond one layer.

## Step-by-step

### Step 1 — Extract state into `CardStateProvider`

Create `src/contexts/cards/CardStateProvider.tsx`:

- Owns `cardMap` state, `cardMapRef`, `reviewLog`, `srSettings` (these are tightly coupled to card mutation flow).
- Mounts `useCardBootstrap` for `ready` / `dbError`.
- Owns the three lifecycle `useEffect`s (quit-backup flush, `onCardLinksCleared`, `onCardReviewConfirmed`, `CARDS_UPDATED` orphan reload).
- Owns the big single-pass `useMemo` for `{ dueCards, stats, categoryStats, cardCountByCategory }` — but `categoryStats` depends on `categoryRecords`, which lives in a sibling provider. Resolve by **reading `categoryRecords` from `CategoryStateContext`** inside this provider via `useContext`. (CategoryStateProvider must therefore mount outside CardStateProvider.)
- Exposes 3 contexts: `CardStateContext`, `ReviewStateContext`, plus an internal `CardStateInternalsContext` carrying `{ setCardMapState, cardMapRef, setReviewLog, updateSRSettings }` for action providers below.
- `useCardData` and `useReviewData` move here unchanged.

### Step 2 — Extract `CategoryStateProvider`

Create `src/contexts/cards/CategoryStateProvider.tsx`:

- Owns only `categoryRecords` state + the derived `categories` UUID list and `subcategories` UUID map (`useMemo`s lifted verbatim from `useCards`).
- Primes the examiner-profile cache via `useEffect` (one-liner, currently in `CardProvider`).
- Exposes `CategoryStateContext` (public — used by `useCategoryData`) and `CategoryStateInternalsContext` (internal — `{ setCategoryRecords, getCategoryRecords }` for action providers).

### Step 3 — Build action providers

Create `src/contexts/cards/CardActionsProvider.tsx`:

- Reads internals from both state providers via `useContext`.
- Mounts `useCardCRUD` + `useCardAnnotations`.
- Combines their returns into one `useMemo` value (no Proxy — sub-hooks already stable, but `useMemo` ensures the wrapper object identity is stable too).
- Exposes `CardActionsContext`.

Create `src/contexts/cards/CategoryActionsProvider.tsx`:

- Mounts `useCategoryManagement` with internals from both state providers (`setCategoryRecords`, `setCardMapState`, `cardMapRef`, `getCategoryRecords`).
- Exposes `CategoryActionsContext`.

Create `src/contexts/cards/BackupActionsProvider.tsx`:

- Mounts `useCardImport` + `useCardExport` (export needs `cards` + `srSettings` — read from `CardStateContext` and `ReviewStateContext` via `useContext`).
- Exposes `BackupActionsContext`.

### Step 4 — Back-compat `useCardActions`

Keep the **existing public name** `useCardActions` returning the same 30-key shape. Implement it as a thin reader that pulls from the three new actions contexts and returns a single `useMemo`-stabilized merged object. No Proxy, no `ownKeys`, no `getOwnPropertyDescriptor`. Identity is stable because each underlying actions object is stable.

Optionally also export the new granular hooks `useCategoryActions` and `useBackupActions` for future code, but the back-compat shape stays so we don't have to touch any of the 19 existing call sites in this pass.

### Step 5 — New `CardProvider` composition

`src/contexts/cards/CardProvider.tsx` becomes a pure composition root, ~25 lines:

```tsx
<CategoryStateProvider>
  <CardStateProvider>
    <CardActionsProvider>
      <CategoryActionsProvider>
        <BackupActionsProvider>
          {dbError ? <DatabaseRecoveryPanel/> : children}
        </BackupActionsProvider>
      </CategoryActionsProvider>
    </CardActionsProvider>
  </CardStateProvider>
</CategoryStateProvider>
```

The DB-error branch keeps wrapping `children` in all providers (current behavior) so the recovery panel still has access to actions.

### Step 6 — Delete `src/hooks/useCards.ts`

Once everything is migrated, delete the file. `CardProvider.tsx` is the only importer; nothing else references it.

### Step 7 — Fix the silent-fallback inconsistency (audit fix #2 carryover)

The current `useCardData` / `useCategoryData` / `useReviewData` return `EMPTY_*` fallbacks instead of throwing. In the new providers, gate the fallback behind `import.meta.env.DEV` (logged warning + empty value) and **throw in production**. `useCardActions` already throws — now all four hooks share that contract.

## Files touched

**Created**
- `src/contexts/cards/CardStateProvider.tsx`
- `src/contexts/cards/CategoryStateProvider.tsx`
- `src/contexts/cards/CardActionsProvider.tsx`
- `src/contexts/cards/CategoryActionsProvider.tsx`
- `src/contexts/cards/BackupActionsProvider.tsx`

**Rewritten**
- `src/contexts/cards/CardProvider.tsx` — shrinks from 230 lines to ~50 (composition root + back-compat `useCardActions` re-export)
- `src/contexts/AppContext.tsx` — re-export list adjusted (no API changes for consumers)

**Deleted**
- `src/hooks/useCards.ts` (308 lines removed)

**Untouched**
- All consumer files (60+ components / views / hooks) — public hook names and shapes are identical.
- All sub-hooks (`useCardCRUD`, `useCardAnnotations`, `useCategoryManagement`, `useCardImport`, `useCardExport`, `useCardBootstrap`).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Re-render storms if action contexts churn | Each sub-hook already memoizes; wrap merged action objects in `useMemo` keyed only on the inner functions, which are stable. |
| `categoryStats` needs both card data and `categoryRecords` | `CardStateProvider` mounts inside `CategoryStateProvider` and reads its context. Verified the dependency graph is acyclic. |
| `useCardActions` consumer expects the merged shape | Back-compat hook returns the same merged object via `useMemo`; identity stability is *better* than today (Proxy returned a new wrapper on every read). |
| Provider mount order breaks an effect ordering assumption | The three lifecycle effects (quit-backup, source-link-clear, review-confirm, orphan reload) all live inside `CardStateProvider` — same execution order as today. |
| Silent-fallback change breaks dev HMR | DEV branch retains the current warning + empty-fallback behavior; only production throws. |

## Net result

- **−308 lines** (`useCards.ts` deletion).
- **−180 lines** (`CardProvider.tsx` slimmed from 230 to ~50).
- **+~250 lines** spread across five focused provider files (each ~50 lines, single responsibility).
- **Net code: ~−240 lines**, plus the Proxy disappears, plus consistent throw-on-missing-provider semantics.
- Zero changes required in any consumer file. Verified by grep: only `CardProvider.tsx` imports `useCards`.