# Build plan — Opcije B + C

## Cilj
Vratiti funkcionalnost u web preview-u (lovable.app) **bez** mijenjanja Pure Desktop semantike, i istovremeno otvrdnuti writere tako da nikad više ne dođe do tihog gubitka podataka kad executor nije dostupan.

---

## Korak 1 — In-memory SQLite executor (Opcija B, srž)

**Cilj**: jedan accessor za executor koji u `!isElectron() && DEV` vraća radni in-memory executor, da svih 9 query modula automatski profitira bez izmjena.

**Novi fajl**: `src/lib/persistence/sqlite/dev-fallback.ts`
- Eksportuje `getDevFallbackExecutor(): Promise<SqlExecutor>` (singleton).
- Implementacija: koristi `@sqlite.org/sqlite-wasm` **bez OPFS-SAH-pool** (otvara `:memory:` DB u istom workeru). Wasm modul je ionako već u bundle-u za Electron; u browseru radi isto, samo nije durable.
- Pokreće isti `runMigrations` da DDL bude identičan produkciji.
- Loguje jednom: „[sqlite] DEV in-memory fallback aktivan — podaci nestaju na refresh".

**Izmjena**: `src/lib/persistence/sqlite/client.ts`
- Dodati pomoćnu funkciju `resolveExecutor()` koju koriste i query moduli i adapter:
  ```ts
  export async function resolveExecutor(): Promise<SqlExecutor | null> {
    if (isElectron()) return getOpfsSqliteExecutor();
    if (!import.meta.env.PROD) {
      const { getDevFallbackExecutor } = await import("./dev-fallback");
      return getDevFallbackExecutor();
    }
    return null;
  }
  ```

**Izmjena**: 9 query modula u `src/lib/db/queries/*.ts` + `categoryRepository`
- Zamijeniti lokalne `tryGetExecutor` funkcije pozivom na `resolveExecutor()`.
- `requireExecutor` ostaje, ali sada samo logira u PROD non-Electron (gdje već `assertDesktop` baca).

**Izmjena**: `src/lib/persistence/adapter-factory.ts`
- `noopAdapter` ostaje za PROD non-Electron (nedostižno zbog `assertDesktop`).
- U DEV non-Electron vraćati novi `devSqliteAdapter` koji koristi isti `resolveExecutor`.

## Korak 2 — Otvrdnjivanje `categoryRepository.commit` (Opcija C/1)

**Izmjena**: `src/lib/repositories/categoryRepository.ts`
- Ako `replaceAllCategories` ne može potvrditi (executor null), **NE** raditi `setCategoryStoreRecords(next)` izvedeno iz `listAllCategories()` (`[]`).
- Konkretno: razdvojiti put — `listAllCategories` vraća `null` umjesto `[]` kad nema executora; u tom slučaju zadržati optimistic snapshot i samo logirati upozorenje.
- Test: dodati `category-repository-no-executor.test.ts` koji simulira null executor i provjerava da RAM mirror ne biva pregažen.

## Korak 3 — Otvrdnjivanje `persist-queue` retry-ja (Opcija C/2)

**Izmjena**: `src/lib/persist-queue.ts`
- Razlikovati tipove grešaka iz adaptera:
  - `NO_EXECUTOR` (nova klasa greške koju baca `resolveExecutor` kad ne uspije i u DEV-u) → NE retryati, samo jednom logirati, isprazniti queue (tretirati kao no-op). Eliminiše ~1.5 s latenciju koju trenutno trpe `addCard`/`gradeSection`.
  - Stvarne SQL greške → postojeća petlja sa exponential backoff-om.
- `noopAdapter.bulkApply` zadržava postojeću semantiku ali se više neće koristiti u DEV-u (Korak 1 obezbjeđuje pravi adapter).

## Korak 4 — Eksplicitni `WriteResult` za izvore i mind-mapove (Opcija C/3)

**Izmjena**: `src/lib/sources-storage.ts` i `src/lib/mind-maps-storage.ts` (analogno)
- `saveSource` i `saveMindMap` vraćaju `Promise<WriteResult<void>>` umjesto `Promise<void>`.
- Postojeći pozivaoci (`useSourceMutations`, `SourcesTab`, itd.) — provjeravaju rezultat i prikazuju pravu poruku (toast.error sa „Snimanje nije uspjelo" kad `ok === false`).
- Time se i u edge slučajevima izbjegava lažni success toast.

## Korak 5 — Verifikacija

1. `tsc --noEmit` (automatski preko buildera).
2. `npm run lint:walls` + `npm run lint`.
3. `vitest run` — fokus na: `category-repository.test.ts`, `persist-queue-c3c4.test.ts`, novi `category-repository-no-executor.test.ts`, postojeći `executor-telemetry.test.ts`.
4. Smoke u preview-u: dodati 3 kategorije → sve ostaju vidljive nakon dodavanja sljedeće; dodati izvor → odmah se pojavi u SourcesTab; dodati karticu → mutacija završava < 200 ms.
5. Provjera runtime errora `StatusIconsRow.tsx` — ako je još uvijek prisutan, hard reload Vite cache-a.

## Korak 6 — Memory update

- Update `mem://architecture/storage-and-persistence-v6` (ili novi v7-fallback): napomena da `resolveExecutor` daje DEV in-memory fallback; pravilo „SQLite-only" ostaje samo za PROD.
- Update Core memorije: linija o `tryGetExecutor` → `resolveExecutor`.

---

## Procjena obima

- **Novi fajlovi**: 2 (`dev-fallback.ts`, `category-repository-no-executor.test.ts`).
- **Izmjene**: ~12 fajlova (9 query modula + `client.ts` + `categoryRepository.ts` + `adapter-factory.ts` + `persist-queue.ts` + `sources-storage.ts` + `mind-maps-storage.ts`).
- Mergeable u jednoj rundi; svaki korak zasebno testabilan.

Potvrdi pa prelazim u build.