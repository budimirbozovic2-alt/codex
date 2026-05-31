## PR-E5 — Status: već shipped, ništa za prepisati

### Verifikacija

`rg "cardMapStore|cardMapWrites|useCardMap|getCardMap|replaceCardMap|seedCardMap|setCardMap|cardMapRefFacade|useCardsBySourceRam|useCardsByCategoryRam" src/test`

→ **1 hit**, i to samo komentar na vrhu `src/test/cards-mirror-and-rollback.test.tsx:4` koji glasi `"Post PR-E2/E4 there is no Zustand cardMapStore and no cardMapWrites…"` — opisuje šta JE bilo, ne koristi API.

Sam fajl već nosi `PR-E5 — Cards mutations: TanStack-only mirror + rollback contract` u headeru (linija 1). Mockovi su prebačeni na novi seam:
- `listAllCards` (feed za `['cards','all']`)
- `getCardsByIds`
- `putCardDirect` (write seam)
- Asserts: `notifyCardsChanged` → bridge invalidate → `useAllCards` refetch; `onMutate` snapshot + `onError` rollback.

### Tests koji su obrisani u PR-E2/E4 (potvrđeno odsutni iz `ls src/test/`)
- `card-map-writes.test.ts` ❌
- `card-selectors.test.tsx` ❌
- `use-cards-by-source.test.tsx` ❌

Već dokumentovano u `mem://architecture/cards-tanstack-ssot` ("**Deleted files:** … tests `card-map-writes.test.ts`, `card-selectors.test.tsx`, `use-cards-by-source.test.tsx`. … **Tests:** `cards-mirror-and-rollback.test.tsx` rewritten…").

### Ostali "trag" referenci u tests (false positives)
- `card-count-by-category-sql.test.tsx`, `cards-e2e-smoke.test.tsx`, `category-view-loading.test.tsx` koriste **`cardCountByCategory`** — to je živi SQL helper iz `@/lib/db/queries/cards-counts.ts` (PR-F), ne RAM API. Ne dirati.

### Live src reference (sve doc-komentari, ne kod)
`seedCardMap`/`Ref-Delta`/`applySyncDelta` se javljaju isključivo u doc-komentarima (`useCardsQuery.ts:4`, `useCardAnnotations.ts:29`, `cards-writes.ts:7`, `bridges.ts:4`, `usePlannerMutations.ts:10`) — opisuju ŠTA je deprecated, korisni future readerima.

---

## Plan — samo memo + jedan minorni cleanup

### 1. Osvježi PR-marker komentara u `cards-mirror-and-rollback.test.tsx`

Linija 4: `"Post PR-E2/E4 there is no…"` → `"Post PR-E (E2/E4) there is no…"` da PR-E5 marker bude konzistentan sa headerom linije 1. Trivijalna kozmetika.

### 2. Update `mem://architecture/cards-tanstack-ssot`

Dodaj kratku PR-E5 verifikaciju u Status liniji: "**PR-E5 verified** — sve test-rewrites završene u PR-E2/E4; `rg "cardMapStore|cardMapWrites|…" src/test` = 1 hit (komentar). Nema preostalih testova koji zavise od RAM mape."

### 3. Verifikacija
- `rg "cardMapStore|cardMapWrites|seedCardMap|setCardMapState|replaceCardMap" src/test` → mora vratiti 0 ili samo komentar.
- `bunx vitest run src/test/cards-mirror-and-rollback.test.tsx src/test/card-count-by-category-sql.test.tsx src/test/cards-e2e-smoke.test.tsx src/test/category-view-loading.test.tsx src/test/query-bridges.test.ts` → svi pass.
- `bun run lint` zeleno (PR-E3 guard već aktivan).

### Šta NE diramo
- Doc-komentari u live src koji spominju `Ref-Delta`/`seedCardMap` — istorijski važni.
- `cardCountByCategory` u testovima — to je SQL helper.

Tri preostala PR-a iz PR-E serije (E2/E3/E4/E5) su sva shipped — ovo je formalna E5 potvrda + memo update.

Reci `Implement plan` da izvršim.