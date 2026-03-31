import { Card, getCardRetrievability, ErrorLogEntry, getErrorStatus } from "./spaced-repetition";
import { ReviewLogEntry } from "./storage";
import { LatencyEntry, loadLatency, loadSlippageLog, loadCalibration, CalibrationEntry, loadDiary, DiaryEntry } from "./metacognitive-storage";
import { loadDisciplineLog, DisciplineEntry, loadPlanner, calcVelocity, calcEstimatedFinish, getPlannerStatus } from "./planner-storage";
import { loadMnemonicCards, MnemonicCard, saveMnemonicCards } from "./mnemonic-storage";
import { differenceInDays } from "date-fns";

// ═══════════════════════════════════════════════════════════
// 1. Interference Index — find confusable card pairs
// ═══════════════════════════════════════════════════════════

export interface InterferencePair {
  cardA: { id: string; question: string; category: string };
  cardB: { id: string; question: string; category: string };
  sharedErrors: string[];
  score: number; // 0-100
}

/** 
 * Detect cards that share similar error patterns (interference).
 * Optimized: groups cards by category first, then uses error-text hash map
 * to find overlaps in O(n * e) instead of O(n² * e²).
 */
export function calcInterferencePairs(cards: Card[], limit = 10): InterferencePair[] {
  // Step 1: Group cards by category (only compare within same category)
  const byCategory = new Map<string, Card[]>();
  cards.forEach(c => {
    const activeErrors = (c.errorLog || []).filter(e => getErrorStatus(e) !== "mastered");
    if (activeErrors.length === 0) return;
    const list = byCategory.get(c.categoryId) || [];
    list.push(c);
    byCategory.set(c.categoryId, list);
  });

  // Step 2: For each category group, build error-prefix → cardId[] map
  const pairScores = new Map<string, { a: Card; b: Card; shared: string[]; score: number }>();

  byCategory.forEach((catCards) => {
    if (catCards.length < 2) return;

    // Build card error data once
    const cardErrors = catCards.map(c => {
      const errors = (c.errorLog || [])
        .filter(e => getErrorStatus(e) !== "mastered")
        .map(e => e.text.toLowerCase().trim().slice(0, 80))
        .filter(t => t.length >= 5);
      const prefixes = errors.map(e => e.slice(0, 15));
      const words = new Set(c.question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      return { card: c, errors, prefixes: new Set(prefixes), words };
    });

    // Build prefix → card indices map for O(1) lookup
    const prefixToIndices = new Map<string, number[]>();
    cardErrors.forEach((ce, idx) => {
      ce.prefixes.forEach(prefix => {
        const list = prefixToIndices.get(prefix) || [];
        list.push(idx);
        prefixToIndices.set(prefix, list);
      });
    });

    // Find pairs via shared prefixes (avoids O(n²) full scan)
    const checkedPairs = new Set<string>();
    
    cardErrors.forEach((ceA, idxA) => {
      // Collect candidate card indices that share at least one prefix
      const candidateIndices = new Set<number>();
      ceA.prefixes.forEach(prefix => {
        (prefixToIndices.get(prefix) || []).forEach(idx => {
          if (idx > idxA) candidateIndices.add(idx);
        });
      });

      candidateIndices.forEach(idxB => {
        const pairKey = `${idxA}:${idxB}`;
        if (checkedPairs.has(pairKey)) return;
        checkedPairs.add(pairKey);

        const ceB = cardErrors[idxB];

        // Find shared errors via prefix matching
        const shared: string[] = [];
        ceA.errors.forEach(eA => {
          const prefixA = eA.slice(0, 15);
          if (ceB.prefixes.has(prefixA)) {
            // Verify full match or containment
            const match = ceB.errors.find(eB => 
              eA === eB || eB.includes(prefixA) || eA.includes(eB.slice(0, 15))
            );
            if (match) shared.push(eA);
          }
        });

        if (shared.length === 0) return;

        // Question similarity via word overlap
        let commonWords = 0;
        ceA.words.forEach(w => { if (ceB.words.has(w)) commonWords++; });
        const questionSimilarity = ceA.words.size > 0 ? commonWords / ceA.words.size : 0;

        const score = Math.min(100, Math.round((shared.length * 30) + (questionSimilarity * 70)));
        if (score < 20) return;

        const key = [ceA.card.id, ceB.card.id].sort().join(":");
        const existing = pairScores.get(key);
        if (!existing || score > existing.score) {
          pairScores.set(key, { a: ceA.card, b: ceB.card, shared, score });
        }
      });
    });
  });

  return Array.from(pairScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(p => ({
      cardA: { id: p.a.id, question: p.a.question, category: p.a.categoryId },
      cardB: { id: p.b.id, question: p.b.question, category: p.b.categoryId },
      sharedErrors: p.shared.slice(0, 3),
      score: p.score,
    }));
}

// ═══════════════════════════════════════════════════════════
// 2. Memory Stability Score — predict forgetting per category
// ═══════════════════════════════════════════════════════════

export interface CategoryStabilityInfo {
  category: string;
  avgStability: number;      // days
  avgRetrievability: number; // 0-1
  criticalSections: number;  // sections that will drop below 85% by exam
  totalSections: number;
}

export function calcCategoryStability(
  cards: Card[],
  categories: string[],
  examDateStr: string | null
): CategoryStabilityInfo[] {
  const parsedExamDate = examDateStr ? new Date(examDateStr) : null;
  const examDate = parsedExamDate && !isNaN(parsedExamDate.getTime()) ? parsedExamDate : null;
  const daysToExam = examDate ? Math.max(0, differenceInDays(examDate, new Date())) : null;

  return categories.map(cat => {
    const catCards = cards.filter(c => c.categoryId === cat);
    let totalStability = 0;
    let totalRetrievability = 0;
    let criticalCount = 0;
    let sectionCount = 0;

    catCards.forEach(c => {
      c.sections.forEach(s => {
        if (!s.lastReviewed) return;
        sectionCount++;
        totalStability += s.stability;

        const elapsed = (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000);
        const R = s.stability > 0 ? Math.exp(-elapsed / s.stability) : 0;
        totalRetrievability += R;

        // Will this section drop below 85% by exam?
        if (daysToExam !== null && s.stability > 0) {
          const totalElapsed = elapsed + daysToExam;
          const futureR = Math.exp(-totalElapsed / s.stability);
          if (futureR < 0.85) criticalCount++;
        }
      });
    });

    return {
      category: cat,
      avgStability: sectionCount > 0 ? totalStability / sectionCount : 0,
      avgRetrievability: sectionCount > 0 ? totalRetrievability / sectionCount : 0,
      criticalSections: criticalCount,
      totalSections: sectionCount,
    };
  }).filter(c => c.totalSections > 0);
}

// ═══════════════════════════════════════════════════════════
// 3. Stress-Performance Index — compare fast vs normal responses
// ═══════════════════════════════════════════════════════════

export interface StressPerformance {
  normalAvgGrade: number;
  stressAvgGrade: number;
  stressResistance: number; // 0-100, higher = more resistant
  normalCount: number;
  stressCount: number;
}

/** 
 * Proxy for stress: responses with latency < 50% of personal average.
 * Compare accuracy in "stressed" (fast-forced) vs normal conditions.
 */
export function calcStressPerformance(reviewLog: ReviewLogEntry[]): StressPerformance | null {
  const latencyLog = loadLatency();
  if (latencyLog.length < 10) return null;

  const avgLatency = latencyLog.reduce((s, e) => s + e.latencyMs, 0) / latencyLog.length;
  const stressThreshold = avgLatency * 0.5; // fast = under 50% of average

  // Map latency entries to their grades
  const latencyMap = new Map<string, number>();
  latencyLog.forEach(e => {
    latencyMap.set(`${e.cardId}:${e.sectionId}:${e.timestamp}`, e.latencyMs);
  });

  // Find review entries that have matching latency data
  let normalGrades: number[] = [];
  let stressGrades: number[] = [];

  reviewLog.forEach(r => {
    // Find closest latency entry (within 30 seconds)
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

  // Resistance: 100 = no drop, 0 = huge drop
  const maxDrop = 3; // max possible grade drop
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

// ═══════════════════════════════════════════════════════════
// 4. Friction Analysis — subject transition time
// ═══════════════════════════════════════════════════════════

export interface FrictionInsight {
  fromCategory: string;
  toCategory: string;
  avgTransitionMinutes: number;
  count: number;
  isSlow: boolean; // > 10 min
}

export function calcFrictionAnalysis(reviewLog: ReviewLogEntry[], limit = 10): {
  transitions: FrictionInsight[];
  suggestion: string | null;
} {
  if (reviewLog.length < 10) return { transitions: [], suggestion: null };

  // Sort by timestamp
  const sorted = [...reviewLog].sort((a, b) => a.timestamp - b.timestamp);

  // Track category transitions
  const transitionMap = new Map<string, { totalMs: number; count: number }>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.category === curr.category) continue;

    const gap = curr.timestamp - prev.timestamp;
    // Only count reasonable gaps (1 second to 60 minutes)
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

// ═══════════════════════════════════════════════════════════
// 5. Recovery Rate — lazy→diligent bounce-back speed
// ═══════════════════════════════════════════════════════════

export interface RecoveryStats {
  avgRecoveryDays: number;
  recoveryCount: number;
  fastRecoveries: number; // recovered next day
  slowRecoveries: number; // took 3+ days
  recoveryIndex: number;  // 0-100
}

export function calcRecoveryRate(): RecoveryStats | null {
  const log = loadDisciplineLog();
  if (log.length < 5) return null;

  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const recoveries: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].status !== "lazy") continue;

    // Find next "diligent" day after this lazy day
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].status === "diligent") {
        const lazyDate = new Date(sorted[i].date);
        const diligentDate = new Date(sorted[j].date);
        const days = differenceInDays(diligentDate, lazyDate);
        if (days > 0 && days <= 30) {
          recoveries.push(days);
        }
        break;
      }
    }
  }

  if (recoveries.length === 0) return null;

  const avg = recoveries.reduce((s, d) => s + d, 0) / recoveries.length;
  const fast = recoveries.filter(d => d <= 1).length;
  const slow = recoveries.filter(d => d >= 3).length;

  // Index: 100 = always recovers next day, 0 = never recovers
  const index = Math.round(Math.max(0, Math.min(100, (1 - (avg - 1) / 6) * 100)));

  return {
    avgRecoveryDays: Math.round(avg * 10) / 10,
    recoveryCount: recoveries.length,
    fastRecoveries: fast,
    slowRecoveries: slow,
    recoveryIndex: index,
  };
}

// ═══════════════════════════════════════════════════════════
// 6. Energy-Material Matcher — mood → module recommendation
// ═══════════════════════════════════════════════════════════

export type EnergyRecommendation = {
  type: "easy" | "normal";
  message: string;
  suggestMnemonics: boolean;
};

export function calcEnergyRecommendation(): EnergyRecommendation | null {
  const diary = loadDiary();
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = diary.find(d => d.date === today);
  if (!todayEntry) return null;

  const text = (todayEntry.selfAnalysis + " " + todayEntry.dailyGoal).toLowerCase();
  const fatigueWords = ["umor", "umoran", "umorna", "iscrpljen", "frustracija", "frustriran", "loše", "teško", "demotiv", "spava", "glava", "bolest", "bezvoljn", "stres"];
  const isFatigued = fatigueWords.some(w => text.includes(w));

  if (!isFatigued) return null;

  return {
    type: "easy",
    message: "Na osnovu tvog dnevnika: izbjegavaj teško novo gradivo. Fokusiraj se na ponavljanje poznatog ili mnemotehničke drilove.",
    suggestMnemonics: true,
  };
}

// ═══════════════════════════════════════════════════════════
// 7. Hook Quality Auditor — latency vs mnemonic hooks
// ═══════════════════════════════════════════════════════════

export interface WeakHook {
  mnemonicCardId: string;
  originalCardId: string;
  question: string;
  avgLatencyMs: number;
  category: string;
}

export async function calcWeakHooks(): Promise<WeakHook[]> {
  const mnemonicCards = await loadMnemonicCards();
  const latencyLog = loadLatency();
  if (mnemonicCards.length === 0 || latencyLog.length === 0) return [];

  const THRESHOLD = 3000; // 3 seconds
  const weakHooks: WeakHook[] = [];

  // For each mnemonic card that has a hook (status = "ready" or "in-workshop" with content)
  mnemonicCards.forEach(mc => {
    if (mc.mnemonicStatus === "new" && !mc.mnemonicVideo && !mc.acronym) return;

    // Find latency entries for the original card
    const cardLatencies = latencyLog.filter(l => l.cardId === mc.originalCardId);
    if (cardLatencies.length < 2) return;

    // Take last 5 entries
    const recent = cardLatencies.slice(-5);
    const avgLatency = recent.reduce((s, l) => s + l.latencyMs, 0) / recent.length;

    if (avgLatency > THRESHOLD) {
      weakHooks.push({
        mnemonicCardId: mc.id,
        originalCardId: mc.originalCardId,
        question: mc.question,
        avgLatencyMs: Math.round(avgLatency),
        category: mc.categoryId,
      });

      // Auto-tag "Slaba kuka"
      if (!mc.tags?.includes("slaba-kuka")) {
        mc.tags = [...(mc.tags || []), "slaba-kuka"];
      }
    }
  });

  // Save updated tags
  if (weakHooks.length > 0) {
    await saveMnemonicCards(mnemonicCards);
  }

  return weakHooks;
}

// ═══════════════════════════════════════════════════════════
// 8. Strategic Reality Check — discipline vs prediction
// ═══════════════════════════════════════════════════════════

export interface StrategicAlert {
  type: "ambitious" | "on-track" | "none";
  message: string;
  diligentDays: number;
  totalDays: number;
  daysLate: number;
}

export function calcStrategicRealityCheck(
  cards: Card[],
  reviewLog: ReviewLogEntry[]
): StrategicAlert | null {
  const planner = loadPlanner();
  if (!planner.finalGoalDate) return null;

  const log = loadDisciplineLog();
  if (log.length < 5) return null;

  // Count recent discipline (last 14 days)
  const recent = log.slice(-14);
  const diligentDays = recent.filter(e => e.status === "diligent").length;
  const diligentPct = diligentDays / recent.length;

  // Get projection
  const totalSections = cards.reduce((s, c) => s + c.sections.length, 0);
  const learnedSections = cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0);
  const velocity = calcVelocity(reviewLog, 7);
  const remaining = totalSections - learnedSections;
  const estimated = calcEstimatedFinish(remaining, velocity);
  const status = getPlannerStatus(estimated, planner.finalGoalDate);

  // Diligent but still late = plan too ambitious
  if (diligentPct >= 0.6 && status.status !== "green" && status.daysLate > 3) {
    return {
      type: "ambitious",
      message: `Plan je previše ambiciozan za tvoj trenutni tempo. Vrijedan si ${diligentDays} od ${recent.length} dana, ali projekcija kasni ${status.daysLate} dana. Razmisli o reviziji cilja.`,
      diligentDays,
      totalDays: recent.length,
      daysLate: status.daysLate,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// 9. Blind Spot Detector — high confidence + bad grade
// ═══════════════════════════════════════════════════════════

export interface BlindSpot {
  cardId: string;
  sectionId: string;
  question: string;
  category: string;
  confidence: number;
  actualGrade: number;
  occurrences: number;
}

export function calcBlindSpots(cards: Card[]): BlindSpot[] {
  const calibration = loadCalibration();
  if (calibration.length < 5) return [];

  // Find entries where confidence was high (4-5) but grade was low (1-2)
  const blindMap = new Map<string, { entries: CalibrationEntry[]; card?: Card }>();

  calibration.forEach(e => {
    if (e.confidence >= 4 && e.actualGrade <= 2) {
      const key = `${e.cardId}:${e.sectionId}`;
      const existing = blindMap.get(key) || { entries: [] };
      existing.entries.push(e);
      blindMap.set(key, existing);
    }
  });

  // Match with cards
  const cardMap = new Map(cards.map(c => [c.id, c]));

  const spots: BlindSpot[] = [];
  blindMap.forEach((data, key) => {
    const [cardId, sectionId] = key.split(":");
    const card = cardMap.get(cardId);
    if (!card) return;

    const latest = data.entries[data.entries.length - 1];
    spots.push({
      cardId,
      sectionId,
      question: card.question,
      category: card.categoryId,
      confidence: latest.confidence,
      actualGrade: latest.actualGrade,
      occurrences: data.entries.length,
    });
  });

  return spots.sort((a, b) => b.occurrences - a.occurrences).slice(0, 15);
}

