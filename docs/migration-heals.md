# Migration heals (TD-ARCH-7)

Historical SQLite migrations **v8–v15** use `SELECT 1` placeholders. The real work runs in TypeScript via `runPostMigrationHeals()` in `post-migration-heals.ts`, only when **upgrading** an existing database (`fromVersion > 0`).

**Fresh installs** (`user_version = 0`) apply `clean-schema` via `migration-runner-v2.ts` and **skip all heals**.

## Heal steps (order matters)

| Step | Min version | When needed | What it does |
|------|-------------|-------------|--------------|
| `category-taxonomy-relational` | 6 | DB had categories with JSON `subcategories`/`chapters` in `payload` | Explodes taxonomy into `subcategories` + `chapters` tables |
| `card-sections-index` | 7 | Cards exist without section due rows | Backfills legacy `card_sections_index` from JSON; delegates to normalized heal if `card_sections` exists |
| `card-mastery-score` | 8 | Legacy DB missing `mastery_score` column or zero backfill | Adds column if needed; computes score from sections |
| `card-mastery-level` | 9 | Legacy DB missing `mastery_level` | Adds column; backfills 0–5 level from sections |
| `card-saga-links` | 10 | Legacy DB missing `parentId` / `isEndangered` | `ALTER TABLE` + indexes for essay saga links |
| `legacy-kv-scalars` | 11 | KV rows stored without `JSON.stringify` | Repairs scalar KV values |
| `card-taxonomy-references` | 12 | Cards with stale `subcategoryId` / `chapterId` | Clears orphaned taxonomy refs |
| `legacy-frequency-tags` | 13 | Cards with frequency in `tags[]` | Moves to `frequencyTag` column |
| `fsrs-last-reviewed` | 14 | FSRS sections missing `lastReviewed` | Backfills via `healCardFsrsSections` |
| `editor-v4-content` | 15 | Renderer available (`window`) | Migrates markdown-only content to Editor v4 JSON |
| `learn-progress-relational` | 16 | `sr-learn-progress` KV blob exists | Moves learn progress into `learn_progress` table |
| `card-sections-normalized` | 17 | Cards exist without `card_sections` rows | Backfills full FSRS section rows from card JSON |

## Open-path heal

When `user_version` is already at target, only **`editor-v4-content`** runs (idempotent, via `runEditorV4OpenHeal`) on each app open.

## Logging

Upgrade heals log as `[migration:heal] <step-name>` with per-step results. A summary line lists all steps that ran:

```
[migration:heal] complete { from, to, ran: [...] }
```

## Files

| File | Role |
|------|------|
| `migration-runner.ts` | Routes fresh vs upgrade; frozen `MIGRATIONS` history |
| `migration-runner-v2.ts` | `applyFreshSchema` for new databases |
| `post-migration-heals.ts` | `runPostMigrationHeals`, heal registry |
| `clean-schema-addon.sql` | DDL not in `schema.sql` (logs, taxonomy, learn_progress, card columns) |
