/**
 * Stable hash utilities for TanStack query keys.
 *
 * Object identity (cards, reviewLog arrays) ne smije ulaziti u queryKey jer
 * uzrokuje refetch na svaki re-render parent komponente. Ovi hashevi su
 * O(1)-ish — uzimaju samo length + zadnju vremensku oznaku.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db";

export function hashReviewLog(log: ReviewLogEntry[]): string {
  if (log.length === 0) return "empty";
  const last = log[log.length - 1];
  return `${log.length}:${last?.timestamp ?? 0}`;
}

export function hashCards(cards: Card[]): string {
  if (cards.length === 0) return "empty";
  // Capture struktura (broj kartica + ukupan broj sekcija + maksimalni
  // lastReviewed) — dovoljno granularno da invalidira na svaki bitan write
  // bez per-render fluktuacija.
  let sections = 0;
  let maxLast = 0;
  for (const c of cards) {
    sections += c.sections.length;
    for (const s of c.sections) {
      if (s.lastReviewed && s.lastReviewed > maxLast) maxLast = s.lastReviewed;
    }
  }
  return `${cards.length}:${sections}:${maxLast}`;
}

export function hashCategories(records: CategoryRecord[]): string {
  if (records.length === 0) return "empty";
  // ID-set hash; promjena reda ili dodavanje/uklanjanje invalidira.
  return records.map((r) => r.id).sort().join("|");
}

export function hashPlannerConfig(cfg: { dailyAvailableMinutes: number; finalGoalDate?: string; bufferPercent: number }): string {
  return `${cfg.dailyAvailableMinutes}:${cfg.finalGoalDate ?? ""}:${cfg.bufferPercent}`;
}
