import { ReviewLogEntry } from "../storage";
import { loadLatency } from "../metacognitive-storage";

export interface StressPerformance {
  normalAvgGrade: number;
  stressAvgGrade: number;
  stressResistance: number;
  normalCount: number;
  stressCount: number;
}

export function calcStressPerformance(reviewLog: ReviewLogEntry[]): StressPerformance | null {
  const latencyLog = loadLatency();
  if (latencyLog.length < 10) return null;

  const avgLatency = latencyLog.reduce((s, e) => s + e.latencyMs, 0) / latencyLog.length;
  const stressThreshold = avgLatency * 0.5;

  let normalGrades: number[] = [];
  let stressGrades: number[] = [];

  reviewLog.forEach(r => {
    const matching = latencyLog.find(l =>
      l.cardId === r.cardId && l.sectionId === r.sectionId &&
      Math.abs(l.timestamp - r.timestamp) < 30000
    );
    if (!matching) return;

    if (matching.latencyMs < stressThreshold) {
      stressGrades.push(r.grade);
    } else {
      normalGrades.push(r.grade);
    }
  });

  if (normalGrades.length < 5 || stressGrades.length < 3) return null;

  const normalAvg = normalGrades.reduce((s, g) => s + g, 0) / normalGrades.length;
  const stressAvg = stressGrades.reduce((s, g) => s + g, 0) / stressGrades.length;

  const maxDrop = 3;
  const actualDrop = Math.max(0, normalAvg - stressAvg);
  const resistance = Math.round(Math.max(0, (1 - actualDrop / maxDrop) * 100));

  return {
    normalAvgGrade: Math.round(normalAvg * 10) / 10,
    stressAvgGrade: Math.round(stressAvg * 10) / 10,
    stressResistance: resistance,
    normalCount: normalGrades.length,
    stressCount: stressGrades.length,
  };
}

export interface FrictionInsight {
  fromCategory: string;
  toCategory: string;
  avgTransitionMinutes: number;
  count: number;
  isSlow: boolean;
}

export function calcFrictionAnalysis(reviewLog: ReviewLogEntry[], limit = 10): {
  transitions: FrictionInsight[];
  suggestion: string | null;
} {
  if (reviewLog.length < 10) return { transitions: [], suggestion: null };

  const sorted = [...reviewLog].sort((a, b) => a.timestamp - b.timestamp);
  const transitionMap = new Map<string, { totalMs: number; count: number }>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.category === curr.category) continue;

    const gap = curr.timestamp - prev.timestamp;
    if (gap < 1000 || gap > 60 * 60 * 1000) continue;

    const key = `${prev.category} → ${curr.category}`;
    const existing = transitionMap.get(key) || { totalMs: 0, count: 0 };
    existing.totalMs += gap;
    existing.count++;
    transitionMap.set(key, existing);
  }

  const transitions: FrictionInsight[] = Array.from(transitionMap.entries())
    .map(([key, data]) => {
      const [from, to] = key.split(" → ");
      const avgMin = (data.totalMs / data.count) / 60000;
      return {
        fromCategory: from,
        toCategory: to,
        avgTransitionMinutes: Math.round(avgMin * 10) / 10,
        count: data.count,
        isSlow: avgMin > 10,
      };
    })
    .sort((a, b) => b.avgTransitionMinutes - a.avgTransitionMinutes)
    .slice(0, limit);

  const slowCount = transitions.filter(t => t.isSlow).length;
  const suggestion = slowCount > 0
    ? `${slowCount} tranzicija između predmeta traje >10 min. Grupiši srodne predmete u blokove za efikasniji tok učenja.`
    : null;

  return { transitions, suggestion };
}
