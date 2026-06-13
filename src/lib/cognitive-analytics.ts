/**
 * Thin backward-compat shim. All real analytics live in `@/lib/analytics/*`.
 * Only `calcWeakHooks` still has an external consumer; everything else was
 * pruned (knip flagged unused re-exports). If a new caller appears, prefer
 * importing directly from `@/lib/analytics/<topic>` instead of expanding
 * this barrel.
 */
export { calcWeakHooks } from "@/domains/mnemonic";
