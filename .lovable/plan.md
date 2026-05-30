# Phase C — Teardown `src/lib/legacy/idb-dexie.ts`

Cilj: ukloniti zadnji Dexie modul iz repoa. Migracija ostaje funkcionalna za korisnike koji još nisu prešli na SQLite, ali bez ijednog Dexie importa.

## Pristup

Migracija se prepisuje da čita IDB **raw** (preko native `IDBDatabase` cursora) umjesto kroz Dexie shell. Raw IDB ne zahtijeva schema deklaraciju za read-only kursor stream — open bez verzije vraća DB u njegovoj postojećoj verziji, što je sve što treba za jednokratni read-and-copy. Recovery panele takođe prevodimo na raw `indexedDB.deleteDatabase("MemoriaDB")`.

---

## Korak 1 — Raw IDB reader helper

Novi fajl `src/lib/persistence/sqlite/idb-raw-reader.ts`:

- `openLegacyIdb(): Promise<IDBDatabase | null>` — `indexedDB.open("MemoriaDB")` bez verzije; vraća `null` ako baza ne postoji (fresh install) ili ako enumeracija nije dostupna.
- `streamStore<T>(db, storeName, onPage, pageSize=500): Promise<number>` — otvara read-only transakciju, kursor stream sa internim paging buffer-om, poziva `onPage(rows)`; vraća total count.
- `countStore(db, storeName): Promise<number>` — `IDBObjectStore.count()`.
- `getKv(db, storeName, key): Promise<unknown>` — za `settings` "tabelu" (key-value lookup za PR-9 planner KV).
- `listAllRows<T>(db, storeName): Promise<T[]>` — za male tabele (`disciplineLog`, `drafts`).

Svi helperi su strogo tipovani (generics, bez `any`); error handling preko `Promise<reject>` na `tx.onerror`/`req.onerror`.

## Korak 2 — `migrate-from-idb.ts` bez Dexie

Prepisati `src/lib/persistence/sqlite/migrate-from-idb.ts`:

- Ukloniti `import { db } from "@/lib/legacy/idb-dexie"` i `import type { Table } from "dexie"`.
- `migrateFromIdb(exec)`:
  - `const idb = await openLegacyIdb()`. Ako je `null` → samo upiši `migrated-from-idb-v1` flag i vrati `{ alreadyComplete: true, counts: zero }`.
  - Za svaki tabelu (categories → sources → cards → mindMaps → mnemonics → knowledgeBaseArticles → majorSystem → mnemonicTestLog), zamijeniti `streamTable(table, …)` sa `streamStore(idb, "<storeName>", …)`. `toRow` i SQL ostaju isti — tipovi rowova su već strukturalni (`CategoryRecord`, `Source`, `Card` …), čitamo ih iz `db-types`.
  - Per-table row-count provjera ostaje (poređenje `streamStore` total vs `SELECT COUNT(*) FROM <table>`).
  - Na samom kraju zatvoriti IDB konekciju (`idb.close()`).
- `migratePr9ReadPathFromIdb(exec)`:
  - `openLegacyIdb()` → `null`-guard isto.
  - Planner KV: `getKv(idb, "settings", "plannerConfig" | …)`.
  - Discipline log: `listAllRows(idb, "disciplineLog")`.
  - Drafts: `listAllRows(idb, "drafts")`.

`MIGRATION_FLAG_KEY`, `PR9_READPATH_FLAG_KEY`, `MigrationAbort`, `hasMigrationFlagSync` ostaju nepromijenjeni.

## Korak 3 — Recovery panele na raw IDB

**`src/contexts/boot/BootRecoveryGate.tsx`** — `resetDb()`:

```ts
async function resetDb() {
  if (!window.confirm("…")) return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("MemoriaDB");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  reloadWindow();
}
```

Trenutni kod briše bazu pod nazivom `"codex"` (pre-existing bug — pravi naziv je `MemoriaDB`). Fix ide uz ovu izmjenu.

**`src/components/DatabaseRecoveryPanel.tsx`** — `handleReset`: ista raw varijanta, bez `await import("@/lib/legacy/idb-dexie")` i bez `db.delete()`.

## Korak 4 — `bootDb.ts` bez Dexie fallbacka

Pošto Dexie shell nestaje, fallback grana iza `isLegacyDexieBypassed()` ne smije više pokušavati otvarati IDB schema-validation putanjom. Nova logika:

```ts
if (await isLegacyDexieBypassed()) {
  // brzi put nepromijenjen
  …
  return { ok: true };
}

// Non-bypassed boot: SQLite migracija će se izvršiti u runSchema (Step 4).
// Boot se nastavlja bez otvaranja Dexie-ja. Ako ne-Electron PROD, već imamo
// assertDesktop branded download CTA (vidi memory: dexie-deprecation-a1c).
markBootStep("cards:db-open-done", "no-legacy");
transition({ type: "OPEN_OK" });
scheduleLogPrune();
return { ok: true };
```

`getDbErrorState` i `setDbErrorState` se i dalje koriste iz `@/lib/db-error` (taj modul je već Dexie-free — vidi komentar u idb-dexie.ts:18-22).

`runSchema.ts` Step 4 ostaje netaknut — sada poziva novi raw-IDB-only `migrateFromIdb`. Step 1 (`migrateFromLocalStorage`) i Step 2 (mnemonics LS→IDB) treba provjeriti — ako i oni pišu u Dexie, takođe ih treba prevesti ili dokazati da rade isključivo na localStorage targetu (mnemonic migracija piše u IDB MemoriaDB → treba je takođe prevesti na raw IDB writes, ili je ostaviti dok ne potvrdimo da je svi korisnici prošli). **Verifikacija prije implementacije**: pročitati `migrateFromLocalStorage` i `migrateMnemonicsFromLocalStorageToIDB` da utvrdimo da li i oni importuju iz `idb-dexie`. Ako da, dodaje se podkorak C4b da i njih prevedemo na raw IDB writes — inače plan ne uspijeva.

## Korak 5 — Re-exports iz `idb-dexie.ts`

`idb-dexie.ts` re-eksportuje `db-types` i `db-error` simbole za backwards compat. Verifikovati `rg "@/lib/legacy/idb-dexie" src` da niko ne uvozi te tipove kroz legacy path. Ako neko uvozi → preusmjeriti na `@/lib/db-types` / `@/lib/db-error` direktno.

## Korak 6 — Brisanje i čišćenje

1. Obrisati `src/lib/legacy/idb-dexie.ts`.
2. Ako je `src/lib/legacy/` prazan → obrisati i taj folder.
3. `bun remove dexie`.
4. `eslint.config.js`: ukloniti W7 (`dexie`/`dexie-react-hooks` ban + `legacy/idb-dexie` group ban) i W8 (`db.<table>` ban) — postaju bezbjedonosno bezpredmetni bez Dexie.
5. `src/test/migrate-from-idb.test.ts`: zamijeniti `vi.mock("@/lib/legacy/idb-dexie", …)` sa mock-om novog raw IDB reader-a (`vi.mock("@/lib/persistence/sqlite/idb-raw-reader", …)`). Test feature parity: page-stream, row-count rollback, idempotency.
6. Update komentara: `src/lib/db.ts:3` i `src/hooks/card-bootstrap/bootDb.ts:13-15` više ne referiraju lazy Dexie shell.

## Korak 7 — Memory update

- `mem://index.md` Core / Dexie line: prepisati u "Dexie potpuno uklonjen. IDB→SQLite migracija čita raw IDB cursorom. Recovery briše bazu direktno preko indexedDB.deleteDatabase('MemoriaDB')."
- Novi memory file `mem://architecture/dexie-removal-final` opisuje raw-IDB reader pattern.
- Označiti `mem://architecture/dexie-deprecation-a1c` kao superseded.

## Verifikacija

- `bun run lint` — bez W7/W8 padova.
- `tsc --noEmit`.
- `bun run deadcode` — bez novih unused exports.
- `vitest run src/test/migrate-from-idb.test.ts` — sve scenarije prolaze.
- Smoke u Electron build-u:
  1. Fresh install (no IDB) → migrate skip + flag set + ready.
  2. Pre-seeded MemoriaDB sa par rekorda → migration copies, flag set, podaci čitljivi iz SQLite.
  3. Recovery panel "Resetuj bazu" → IDB stvarno obrisan (DevTools verify).

## Tehnički detalji (za nas)

- Raw `indexedDB.open(name)` bez verzije: ako baza ne postoji, `onupgradeneeded` se okida sa `oldVersion=0` i mi je odmah abort-ujemo + `deleteDatabase` cleanup. Standardni pattern je: prvo `indexedDB.databases()` filter za `MemoriaDB`, pa tek open ako postoji.
- Kursor read API: `store.openCursor()` → `cursor.continue()` u paging chunks; svaki `onsuccess` push-a row dok `cursor === null`.
- Veličina paga: zadržati 500 (isti memory budžet kao Dexie put).

## Rizik

Srednji. Ključna pretpostavka: svi korisnici koji još rade na IDB imaju kompatibilnu schemu (≥ v18 ili v22). Pošto raw cursor stream čita whatever je u IDB-u, schema mismatchi koje je Dexie ranije reportovao kao `VersionError` više se ne dešavaju — IDB se otvara as-is i kopira što ima. To zapravo eliminiše "Resetuj bazu na schema mismatch" UX, ali zauzvrat garantuje da migracija prođe bez Dexie-ja.

Trebam li krenuti sa Korakom 1 ili prvo provjeriti zavisnosti `migrateFromLocalStorage` / mnemonics LS→IDB migracije (Korak 4 verifikacija) i izvjestiti prije implementacije?
