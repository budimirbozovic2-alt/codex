import type { Card } from "@/lib/spaced-repetition";
import { isEndangeredEssay } from "@/lib/saga/endangered-display";
import { isFlashSatellite } from "@/lib/saga/card-saga-grouping";

export interface BackupIntegrityStats {
  cardCount: number;
  sagaLinkCount: number;
  endangeredCount: number;
  orphanParentIdCount: number;
}

export interface BackupExportMetadata extends BackupIntegrityStats {
  schemaVersion: number;
  exportedAt: number;
}

/** Integrity counters for backup diff and post-import verification. */
export function computeBackupIntegrityStats(
  cards: readonly Card[],
): BackupIntegrityStats {
  const ids = new Set(cards.map((c) => c.id));
  let sagaLinkCount = 0;
  let orphanParentIdCount = 0;
  let endangeredCount = 0;

  for (const card of cards) {
    if (isFlashSatellite(card) && card.parentId) {
      sagaLinkCount++;
      if (!ids.has(card.parentId)) orphanParentIdCount++;
    }
    if (isEndangeredEssay(card)) endangeredCount++;
  }

  return {
    cardCount: cards.length,
    sagaLinkCount,
    endangeredCount,
    orphanParentIdCount,
  };
}

export function buildExportMetadata(
  cards: readonly Card[],
  schemaVersion: number,
  exportedAt: number = Date.now(),
): BackupExportMetadata {
  return {
    schemaVersion,
    exportedAt,
    ...computeBackupIntegrityStats(cards),
  };
}

export function formatIntegritySummary(stats: BackupIntegrityStats): string {
  const parts = [
    `${stats.cardCount} kartica`,
    `${stats.sagaLinkCount} saga veza`,
    `${stats.endangeredCount} ugroženih`,
  ];
  if (stats.orphanParentIdCount > 0) {
    parts.push(`${stats.orphanParentIdCount} orphan parentId`);
  }
  return parts.join(" · ");
}

export function formatExportMetadataDiff(
  current: BackupExportMetadata,
  previous?: BackupExportMetadata | null,
): string | null {
  if (!previous) return null;
  const dCards = current.cardCount - previous.cardCount;
  const dSaga = current.sagaLinkCount - previous.sagaLinkCount;
  const dEnd = current.endangeredCount - previous.endangeredCount;
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  return `Δ od zadnjeg backupa: kartice ${sign(dCards)}, saga ${sign(dSaga)}, ugroženi ${sign(dEnd)}`;
}
