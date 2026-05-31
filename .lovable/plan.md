## PR-E4 — Status: već je shipped

Provjerio sam stanje na disku i u importima. **Velika čistka iz PR-E4 je već izvršena** — sva fizička brisanja su urađena u prethodnim PR-E rundama:

### Verifikacija (sve potvrđeno)

| Stavka | Status |
|---|---|
| `src/store/useCardMapStore.ts` | ❌ ne postoji (obrisano) |
| `src/store/useCardsBySource.ts` | ❌ ne postoji (obrisano) |
| `src/domains/cards/cardMapWrites.ts` | ❌ ne postoji (obrisano) |
| `src/domains/cards/index.ts` | ✅ prazan barrel (`export {}`) — zadržan radi ESLint W11 wall-a |
| `src/store/index.ts` | ✅ čist — eksportuje samo TanStack selektore, category store, source reader, brand helpers |
| `src/store/useCardSelectors.ts` | ✅ čisti re-export barrel iz `@/hooks/card/useCardsQuery` |
| Live identifikator `cardMapWrites.*` u kodu | 0 call-sites (rg potvrđuje) |
| ESLint guard `Identifier[name='cardMapWrites']` | ✅ aktivan u `BASE_RESTRICTED_SYNTAX` (PR-E3) |

Zustand `cardMap` **fizički ne postoji** — TanStack Query je već jedini in-memory store za kartice.

### Šta je realno ostalo (sitni mrtvi tragovi u komentarima i jedan deprecated naziv)

`rg "cardMapWrites|cardMapStore|setCardMapState|replaceCardMap"` pokazuje 9 referenci — sve su **doc-komentari ili istorijski markeri**. Tri od njih su činjenično netačne (referenciraju brisane API-je kao da su živi):

1. **`src/lib/backup/import-types.ts:18`** — `/** Final cardId → Card map snapshot, ready for setCardMapState. */`
   `setCardMapState` ne postoji. Treba: `ready for announceCardsReplaced (post-tx invalidate)`.

2. **`src/lib/db/queries/cards-writes.ts:60`** — `with the deprecated replaceCardMap`
   `replaceCardMap` ne postoji. Treba ukloniti spomen ili preformulisati u "(legacy `CardMap` signature parity)".

3. **`src/hooks/cards/useCardState.ts:24-26`** — komentar tvrdi da `cardMapStore` "stays as the internal write-side cache for `cardMapWrites` sync lookups". Oba modula su obrisana. Treba: TanStack `['cards','all']` invalidiran kroz `onCardsChanged` bridge — jedini izvor.

4. **Istorijski OK** (zadrži, opisuju ŠTA je deprecated): `useCardsQuery.ts:6`, `useCardMutations.ts:16`, `db/queries/index.ts:35`, `heal-card-taxonomy.ts:33`, `healthService.ts:192`, `domains/cards/index.ts:4`, `cards-mirror-and-rollback.test.tsx:4`. Ovi eksplicitno govore "X was deleted in PR-E" i korisni su future readerima.

---

## Plan — finalni cleanup + memory promovisanje statusa

### 1. Ispraviti 3 stale komentara (faktografski netačni)

- `import-types.ts:18` → opisati `nextMap` u terminima `announceCardsReplaced`.
- `cards-writes.ts:60` → ukloniti spomen `replaceCardMap`, samo "signature parity sa legacy `CardMap` tipom".
- `useCardState.ts:24-26` → preformulisati: "TanStack `['cards','all']` je jedini izvor; invalidiran kroz `onCardsChanged` bridge nakon SQLite pisanja. Legacy `cardMapStore` obrisan u PR-E4."

### 2. Verifikacija da nije ostao niti jedan import koji bi pukao

- `rg "from .@/store/useCardMapStore" src` → mora biti 0.
- `rg "from .@/domains/cards/cardMapWrites" src` → mora biti 0.
- `bunx tsc -p tsconfig.app.json --noEmit` → zeleno.
- `bun run lint` → zeleno (ESLint guard već postoji iz PR-E3).
- `bunx vitest run src/test/cards-mirror-and-rollback.test.tsx src/test/import-transaction-split.test.ts` → svi prolaze.

### 3. Memorija

- Update `mem://architecture/cards-tanstack-ssot` jednom rečenicom: "PR-E4 Great Purge confirmed shipped — useCardMapStore.ts, useCardsBySource.ts, cardMapWrites.ts physically gone; rg živih referenci = 0; ESLint W (PR-E3 guard) blokira regresiju."
- Core memoriju (mem://index.md) ne diramo — već kaže "DELETED (PR-E)".

### 4. Šta NE treba dirati

- `src/domains/cards/index.ts` (`export {}`) — namjerno prazan da W11 wall ostane živ za buduće potrebe. Ne brišemo.
- `src/store/useCardSelectors.ts` — iako je samo re-export, drži se odvojeno radi konzistencije sa `useCategorySelectors`. Inlinovanje nije scope PR-E4.
- ESLint W11 wall — ostaje.

### Tehnički detalji

Promjene su isključivo komentari + memo. Nema runtime promjena, nema deps, nema TS strukturnih promjena. 3 fajla edituju, 1 memo fajl ažurira.

Reci `Implement plan` da izvršim.