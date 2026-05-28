// A1c Phase 3: `@/lib/db` no longer re-exports the Dexie shell. Callers
// that still need the legacy IDB surface must import from
// `@/lib/legacy/idb-dexie` explicitly (lazy-loaded behind the migration
// flag — see `bootDb.ts`). Domain types live in `@/lib/db-types`,
// error utilities in `@/lib/db-error`, and seed helpers below.
export * from "./db-seed";
