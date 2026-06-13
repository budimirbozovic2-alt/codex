/**
 * Public API façade for the `mnemonic` domain.
 *
 * Cross-domain rule: importers OUTSIDE `src/features/mnemonic/**` and
 * `src/domains/mnemonic/**` must use `@/domains/mnemonic` (or, for UI
 * embedding, `@/features/mnemonic` barrel). Deep imports are blocked.
 */
export { calcWeakHooks } from "./analytics/weak-hooks";
