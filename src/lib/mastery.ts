import { Card, SectionState } from "@/lib/spaced-repetition";

export interface MasteryLevel {
  level: number;
  label: string;
  color: string;
}

export const MASTERY_LEVELS: MasteryLevel[] = [
  { level: 0, label: "Novo", color: "hsl(var(--mastery-new))" },
  { level: 1, label: "Kritično", color: "hsl(var(--mastery-critical))" },
  { level: 2, label: "Teško", color: "hsl(var(--mastery-hard))" },
  { level: 3, label: "Nesigurno", color: "hsl(var(--mastery-uncertain))" },
  { level: 4, label: "Stabilno", color: "hsl(var(--mastery-stable))" },
  { level: 5, label: "Savladano", color: "hsl(var(--mastery-mastered))" },
];

const _masteryCache = new Map<string, { level: number; updatedAt: number }>();

export function getCardMasteryLevel(card: Card): number {
  if (!card.sections || card.sections.length === 0) return 0;

  const cardUpdated = card.updatedAt ?? 0;
  const cached = _masteryCache.get(card.id);
  if (cached && cached.updatedAt === cardUpdated && cardUpdated !== 0) return cached.level;

  const errorCount = card.errorLog?.reduce((sum, e) => sum + e.count, 0) || 0;
  const allNew = card.sections.every((s) => s.state === SectionState.New);
  if (allNew) { _masteryCache.set(card.id, { level: 0, updatedAt: cardUpdated }); return 0; }

  const avgStability = card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length;

  let level: number;
  if (errorCount > 3 || avgStability < 3) level = 1;
  else if (errorCount > 0 && avgStability < 7) level = 2;
  else {
    const avgDifficulty = card.sections.reduce((sum, s) => sum + s.difficulty, 0) / card.sections.length;
    if (avgStability < 15 || avgDifficulty >= 6) level = 3;
    else if (avgStability <= 30) level = 4;
    else level = 5;
  }
  _masteryCache.set(card.id, { level, updatedAt: cardUpdated });
  return level;
}

export function getMasteryColor(level: number): string {
  return MASTERY_LEVELS[level]?.color || MASTERY_LEVELS[0].color;
}
