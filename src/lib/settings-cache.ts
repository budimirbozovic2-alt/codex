/**
 * @deprecated Import from `@/lib/query/prefs-cache-coordinator` instead.
 * Thin re-export shim — localStorage mirror removed.
 */
export {
  readPref as readCached,
  writePref as writeCached,
  getPrefFromCache,
  seedPref,
  initPrefsQueryCache,
  resetPrefsQueryCache,
} from "@/lib/query/prefs-cache-coordinator";

/** @deprecated Test seam — use `resetPrefsQueryCache`. */
export { resetPrefsQueryCache as __resetSettingsCache } from "@/lib/query/prefs-cache-coordinator";
