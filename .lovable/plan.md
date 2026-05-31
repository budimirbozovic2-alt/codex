## PR-E3b — Drain 45 lint errors, flip `--max-warnings=0`

Goal: clear every remaining ESLint error so CI can be tightened from `--max-warnings=80` → `0` without losing the previous warning-clean baseline.

### Error inventory (45 total)

| Bucket | Count | Files |
|---|---|---|
| `no-empty` (empty `catch {}` / block) | 22 | ErrorBoundary, LearnSession, MainLayout, ZenMode, sidebar.tsx, ambient-audio, app-settings (×6), boot-trace (×3), useSourceReaderStore (×2) |
| `no-useless-escape` (regex) | 12 | ExamSidebar, ZettelPreview, content-utils, smart-paste, zettelkasten-aliases, zettelkasten-wiki-link |
| `no-restricted-imports` (Public API wall) | 4 | useMnemonicMutations (×3), useKnowledgeBaseArticles |
| `no-empty-object-type` | 3 | sidebar.tsx:189, textarea.tsx:5, usePlannerMutations.ts:27 |
| `prefer-const` | 2 | ambient-audio:117, import-transaction:72 |
| `no-require-imports` | 2 | tailwind.config.ts:204 |
| `no-unused-expressions` | 1 | StructureManagerDialog.tsx:61 |
| `no-empty` (1 left over) | 1 | MnemonicSectionEditor area (already covered above) |

### Fixes by bucket

**Bucket 1 — `no-empty` (22 sites)**
Every offender is a swallow-on-purpose `catch {}` around best-effort I/O (localStorage, taskScheduler, audio decode, BroadcastChannel). Add an explicit `/* noop: best-effort */` body so intent is documented and the rule passes. No behavior change.

**Bucket 2 — `no-useless-escape` (12 sites)**
All are inside regex character classes where the escape is redundant (e.g. `[\.\)]` → `[.)]`, `[\[\]]` → `[[\]]` keeping the closing bracket escape only). Rewrite the literals; behavior identical because the rule only flags escapes whose removal doesn't change semantics.

**Bucket 3 — Public API wall (4 sites)**
`@/lib/db/queries/index.ts` already re-exports `bulkPutMnemonics`, `addTestLogEntry`, `knowledge-base`, and `bulkPutPegs as bulkPutMajorSystemPegs`. Rewrite three import lines:

- `src/hooks/mnemonic/useMnemonicMutations.ts:15-17` → single `import { bulkPutMnemonics, deleteMnemonic, bulkPutMajorSystemPegs, addTestLogEntry } from "@/lib/db/queries"` (local alias rename for `bulkPutPegs` call sites).
- `src/hooks/zettelkasten/useKnowledgeBaseArticles.ts:19` → import the relevant knowledge-base helpers from the `@/lib/db/queries` barrel.

**Bucket 4 — `no-empty-object-type` (3 sites)**
- `usePlannerMutations.ts:27` `interface DailyMappedCtx {}` → `type DailyMappedCtx = Record<string, never>;` (used purely as a marker context type for `useMutation`).
- `components/ui/sidebar.tsx:189` and `components/ui/textarea.tsx:5` are shadcn primitives that extend HTML element prop types via empty interface. Convert to `type Foo = React.ComponentProps<...>` (consistent with other shadcn primitives in the project).

**Bucket 5 — `prefer-const` (2 sites)**
Mechanical `let` → `const` for `sample` (`lib/ambient-audio.ts:117`) and `freshCategories` (`lib/backup/import-transaction.ts:72`).

**Bucket 6 — `no-require-imports` (tailwind.config.ts:204)**
Tailwind plugins are CJS, but `tsx`-loaded `tailwind.config.ts` accepts ESM default imports. Switch to:
```ts
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";
// ...
plugins: [tailwindcssAnimate, typography],
```
Fallback if either plugin lacks a default export: add a narrow `eslint.config.js` override allowing `no-require-imports` for `tailwind.config.ts` only (config files commonly need CJS interop).

**Bucket 7 — `no-unused-expressions` (StructureManagerDialog.tsx:61)**
Current: `next.has(id) ? next.delete(id) : next.add(id);` — ternary used as a statement. Rewrite as `if (next.has(id)) next.delete(id); else next.add(id);`. Identical behavior.

### CI tightening (final step)

`package.json` → `scripts.lint`: `--max-warnings=80` → `--max-warnings=0`. Smoke-run `bun run lint` to confirm clean exit, then run the full vitest suite to make sure none of the regex rewrites or shadcn type swaps broke a consumer.

### Verification

1. `bunx eslint .` → `0 problems`
2. `bunx vitest run` → 604/604 pass (target retention test, sidebar/textarea usages, mnemonic mutations e2e, planner mutations).
3. `bunx tsc --noEmit` → clean (strictNullChecks still on from PR-E1).

### Out of scope

- The 26 + 21 `react-refresh` / `exhaustive-deps` warnings drained in PR-E3a stay drained.
- No new ESLint rules added in this PR; only error count goes to zero.

### Memory updates

None — this is hygiene only; the lint baseline change is captured by the `--max-warnings=0` flip in `package.json` itself.
