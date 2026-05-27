/**
 * Public API barrel for `@/lib/db/queries`.
 *
 * Hooks consume this barrel directly (see ESLint `no-restricted-imports`
 * override for `src/hooks/**`). UI components remain blocked — they must
 * route through a hook.
 *
 * Walled per architecture memory: deep imports into sibling files are
 * forbidden, the barrel is the single seam.
 */
export { cardsBySource } from "./cards";

// Re-export legacy query helpers that still live in `src/lib/db-queries.ts`
// so hooks have a single, sanctioned entry-point and never reach `@/lib/db`.
export {
  idbLoadCardsByChapter,
  idbLoadSettings,
  idbSaveSettings,
} from "@/lib/db-queries";
