/**
 * Boot-time scan of the Dexie `drafts` table:
 *   1. Delete rows older than `STALE_MS` (7 days) — nobody will resume those.
 *   2. Surface a single informational toast for any remaining rows so the
 *      user knows recoverable work exists and where to find it.
 *
 * Per-feature inline restore (banner inside ZettelkastenView / SourceReader)
 * remains the responsibility of those views — this scan is just the
 * "you have unfinished business" nudge that runs once per app session.
 */
import { db } from "@/lib/db-schema";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

let scanRan = false;

export async function recoverDraftsOnBoot(): Promise<void> {
  if (scanRan) return;
  scanRan = true;

  let rows;
  try {
    rows = await db.drafts.toArray();
  } catch (err) {
    logger.warn("[draft-recovery] scan failed", err);
    return;
  }
  if (rows.length === 0) return;

  const now = Date.now();
  const stale = rows.filter(r => now - r.updatedAt > STALE_MS);
  if (stale.length > 0) {
    try {
      await db.drafts.bulkDelete(stale.map(r => r.key));
    } catch (err) {
      logger.warn("[draft-recovery] stale cleanup failed", err);
    }
  }

  const fresh = rows.filter(r => now - r.updatedAt <= STALE_MS);
  if (fresh.length === 0) return;

  // Group counts by source for a readable summary.
  const bySource: Record<string, number> = {};
  for (const r of fresh) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  const summary = Object.entries(bySource)
    .map(([s, n]) => `${describeSource(s)}: ${n}`)
    .join(" · ");

  toast("Pronađene nesačuvane izmjene", {
    description: `${summary}. Otvori odgovarajuću stavku da nastaviš.`,
    duration: 8000,
  });
}

function describeSource(source: string): string {
  switch (source) {
    case "zettelkasten-article": return "članci";
    case "source-html":          return "izvori";
    case "card-form":            return "kartice";
    default:                     return source;
  }
}
