// Phase C: Dexie shell removed. Domain types live in `@/lib/db-types`,
// error utilities in `@/lib/db-error`, runtime queries in `@/lib/db/queries`,
// and the IDB→SQLite migration in `@/lib/persistence/sqlite/migrate-from-idb`.
// This barrel only re-exports seed helpers.
export * from "./db-seed";
