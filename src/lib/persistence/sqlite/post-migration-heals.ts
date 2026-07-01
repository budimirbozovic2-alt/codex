/**
 * Post-migration data heals (TD-ARCH-7).
 *
 * Historical SQL migrations v8–v15 use `SELECT 1` placeholders; the real work
 * lives here. Heals run only when upgrading an existing DB (fromVersion > 0),
 * and only for version thresholds crossed in the upgrade window.
 *
 * See `docs/migration-heals.md` for per-step documentation.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";
import { migrateCategoryTaxonomyToRelational } from "./category-taxonomy-migration";
import { migrateCardSectionsIndex } from "./card-sections-index-migration";
import { migrateCardSectionsNormalized } from "./card-sections-migration";
import { migrateCardMasteryScores } from "./card-mastery-score-migration";
import { migrateCardMasteryLevels } from "./card-mastery-level-migration";
import { migrateCardSagaLinks } from "./card-saga-links-migration";
import {
  migrateLegacyKvScalars,
  migrateCardTaxonomyReferences,
  migrateLegacyFrequencyTags,
  migrateFsrsLastReviewed,
} from "./boot-heal-migration";
import { migrateLearnProgressToRelational } from "./learn-progress-migration";

export interface PostMigrationHealContext {
  fromVersion: number;
  toVersion: number;
}

export interface PostMigrationHealStepReport {
  name: string;
  minVersion: number;
  skipped: boolean;
  result?: unknown;
  error?: string;
}

export interface PostMigrationHealReport {
  fromVersion: number;
  toVersion: number;
  steps: PostMigrationHealStepReport[];
}

type HealRunner = (exec: SqlExecutor) => Promise<unknown>;

interface HealDefinition {
  name: string;
  minVersion: number;
  requiresWindow?: boolean;
  run: HealRunner;
}

const HEAL_DEFINITIONS: readonly HealDefinition[] = [
  {
    name: "category-taxonomy-relational",
    minVersion: 6,
    run: migrateCategoryTaxonomyToRelational,
  },
  {
    name: "card-sections-index",
    minVersion: 7,
    run: migrateCardSectionsIndex,
  },
  {
    name: "card-mastery-score",
    minVersion: 8,
    run: migrateCardMasteryScores,
  },
  {
    name: "card-mastery-level",
    minVersion: 9,
    run: migrateCardMasteryLevels,
  },
  {
    name: "card-saga-links",
    minVersion: 10,
    run: migrateCardSagaLinks,
  },
  {
    name: "legacy-kv-scalars",
    minVersion: 11,
    run: migrateLegacyKvScalars,
  },
  {
    name: "card-taxonomy-references",
    minVersion: 12,
    run: migrateCardTaxonomyReferences,
  },
  {
    name: "legacy-frequency-tags",
    minVersion: 13,
    run: migrateLegacyFrequencyTags,
  },
  {
    name: "fsrs-last-reviewed",
    minVersion: 14,
    run: migrateFsrsLastReviewed,
  },
  {
    name: "editor-v4-content",
    minVersion: 15,
    requiresWindow: true,
    run: async (exec) => {
      const { migrateEditorV4Content } = await import(
        "./editor-v4-schema-migration"
      );
      return migrateEditorV4Content(exec);
    },
  },
  {
    name: "learn-progress-relational",
    minVersion: 16,
    run: migrateLearnProgressToRelational,
  },
  {
    name: "card-sections-normalized",
    minVersion: 17,
    run: migrateCardSectionsNormalized,
  },
];

/** Which heals apply for a given upgrade window (pure — testable). */
export function getHealDefinitionsForUpgrade(
  ctx: PostMigrationHealContext,
): readonly HealDefinition[] {
  if (ctx.fromVersion <= 0) return [];
  return HEAL_DEFINITIONS.filter(
    (h) =>
      ctx.fromVersion < h.minVersion
      && ctx.toVersion >= h.minVersion
      && (!h.requiresWindow || typeof window !== "undefined"),
  );
}

/** Run data heals after incremental SQL migrations on an existing database. */
export async function runPostMigrationHeals(
  exec: SqlExecutor,
  ctx: PostMigrationHealContext,
): Promise<PostMigrationHealReport> {
  const steps: PostMigrationHealStepReport[] = [];
  const applicable = getHealDefinitionsForUpgrade(ctx);

  for (const heal of applicable) {
    try {
      const result = await heal.run(exec);
      steps.push({ name: heal.name, minVersion: heal.minVersion, skipped: false, result });
      logger.info(`[migration:heal] ${heal.name}`, result);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      steps.push({
        name: heal.name,
        minVersion: heal.minVersion,
        skipped: false,
        error,
      });
      logger.error(`[migration:heal] ${heal.name} failed`, err);
      throw err;
    }
  }

  const report: PostMigrationHealReport = {
    fromVersion: ctx.fromVersion,
    toVersion: ctx.toVersion,
    steps,
  };

  if (steps.length > 0) {
    logger.info("[migration:heal] complete", {
      from: ctx.fromVersion,
      to: ctx.toVersion,
      ran: steps.map((s) => s.name),
    });
  }

  return report;
}

/** Idempotent editor-v4 heal on every open when DB is already at target version. */
export async function runEditorV4OpenHeal(exec: SqlExecutor): Promise<void> {
  if (typeof window === "undefined") return;
  const { migrateEditorV4Content } = await import(
    "./editor-v4-schema-migration"
  );
  await migrateEditorV4Content(exec);
}
