import { ReviewLogEntry } from "./storage";
import { db } from "./db";

import { logger } from "@/lib/logger";
// ═══════════════════════════════════════════════════════════
// IN-MEMORY CACHE — populated from IDB at boot, no localStorage
// ═══════════════════════════════════════════════════════════
let _diaryCache: DiaryEntry[] = [];
let _calibrationCache: CalibrationEntry[] = [];
let _latencyCache: LatencyEntry[] = [];
let _slippageCache: SlippageEntry[] = [];
let _activityCache: ActivityEntry[] = [];
let _lastAnalysisDate: string | null = null;
let _appEntry: { date: string; time: number; actionRecorded?: boolean } | null = null;
let _cacheReady = false;

/**
 * Initialize all metacognitive caches from IndexedDB.
 * Called once at boot after ensureDbOpen succeeds.
 */
export async function initMetacognitiveCache(): Promise<void> {
  try {
    const cutoff90 = Date.now() - 90 * 86400000;
    const cutoffDate = new Date(cutoff90).toISOString().slice(0, 10);
    const [diary, calibration, latency, slippage, activity, analysisRow, appEntryRow] = await Promise.all([
      db.diary.toArray(),
      db.calibrationLog.where("timestamp").above(cutoff90).toArray(),
      db.latencyLog.where("timestamp").above(cutoff90).toArray(),
      db.slippageLog.where("date").above(cutoffDate).toArray(),
      db.activityLog.where("timestamp").above(cutoff90).toArray(),
      db.settings.get("lastAnalysisDate"),
      db.settings.get("appEntry"),
    ]);
    _diaryCache = diary;
    _calibrationCache = calibration;
    _latencyCache = latency;
    _slippageCache = slippage;
    _activityCache = activity;
    _lastAnalysisDate = (analysisRow?.value as string) ?? null;
    _appEntry = (appEntryRow?.value as typeof _appEntry) ?? null;
    _cacheReady = true;
  } catch (err) {
    logger.warn("[metacognitive] cache init failed, using empty defaults", err);
    _cacheReady = true;
  }
}

// ─── Diary ───────────────────────────────────────────────

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  dailyGoal: string;
  selfAnalysis: string;
  createdAt: number;
}

// NOTE: `loadDiary` / `saveDiary` su uklonjeni 2026-05 — nisu imali pozivaoca.
// `DiaryEntry` interfejs i `_diaryCache` su zadržani jer ih `db-schema.ts`
// koristi za tipiziranje `db.diary` tabele i očuvanje istorijskih zapisa.


// ─── Calibration (confidence before reveal) ──────────────
//
// STATUS: READ-ONLY / LEGACY (od uklanjanja "Procjena sigurnosti A–E" iz Konsolidacije).
//
// Konsolidacija (ReviewCard) više NE generiše nove `CalibrationEntry` zapise.
// Postojeći podaci u IndexedDB (`db.calibrationLog`) ostaju netaknuti i koriste se za:
//   - `CalibrationTab` (Statistika → Kalibracija) — istorijski grafici
//   - `analytics/blind-spots.ts` (`calcBlindSpots`) — detekcija slijepih tačaka iz prošlih sesija
//   - Backup/Export/Import i Health Monitor — integritet baze
//
// Public API koji ostaje podržan:
//   - `loadCalibration()`           — čita keš
//   - `addCalibrationEntry(entry)`  — i dalje izložen (npr. za buduće surface-e koji bi
//                                      htjeli ručno snimiti samoprocjenu); trenutno NEMA aktivnog pozivaoca
//   - `getCalibrationStats(entries)` — agregacija za prikaz
//
// (Ranije uklonjeni bulk/per-card calibration helperi su namjerno izostavljeni
// iz dokumentacije da ne posluže kao "podsjetnik" za reintrodukciju.)

/**
 * Zapis o kalibraciji samoprocjene (confidence) vs. stvarne ocjene (actualGrade).
 * Generiše se istorijski; novi zapisi se trenutno NE kreiraju iz Konsolidacije.
 */
export interface CalibrationEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  /** Samoprocjena sigurnosti prije otkrivanja odgovora (1–5). */
  confidence: number;
  /** FSRS ocjena nakon otkrivanja (1–4). */
  actualGrade: number;
  category: string;
}

/**
 * Vraća sve kalibracione zapise iz in-memory keša (poslednjih 90 dana).
 * Read-only API — bezbjedno za prikaz statistika.
 */
export function loadCalibration(): CalibrationEntry[] {
  return _calibrationCache;
}


/**
 * Dodaje novi kalibracioni zapis u keš i IndexedDB.
 *
 * NAPOMENA: Trenutno NEMA aktivnog pozivaoca u aplikaciji (UI "Procjena sigurnosti A–E"
 * je uklonjen iz Konsolidacije). Funkcija je zadržana kao stabilan public API
 * za eventualne buduće surface-e (npr. ručno označavanje sigurnosti u Learn sesiji).
 */
export function addCalibrationEntry(entry: CalibrationEntry) {
  _calibrationCache = [..._calibrationCache, entry];
  if (_calibrationCache.length > 2000) _calibrationCache = _calibrationCache.slice(-2000);
  db.calibrationLog.add(entry).catch((e) => logger.warn("[silent]", e));
}

// ─── Recall Latency ──────────────────────────────────────

export interface LatencyEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  latencyMs: number;
  category: string;
}

export function loadLatency(): LatencyEntry[] {
  return _latencyCache;
}

// `saveLatency` uklonjen 2026-05 — bulk overwrite nije imao pozivaoca.
// Zapisi se dodaju isključivo preko `addLatencyEntry`.

export function addLatencyEntry(entry: LatencyEntry) {
  _latencyCache = [..._latencyCache, entry];
  if (_latencyCache.length > 2000) _latencyCache = _latencyCache.slice(-2000);
  db.latencyLog.add(entry).catch((e) => logger.warn("[silent]", e));
}

// ─── Self-analysis reminder ─────────────────────────────
//
// `getLastAnalysisDate`, `setLastAnalysisDate`, `isAnalysisNeededToday`,
// i `getTodayReviewStats` su uklonjeni 2026-05 — ostali su bez pozivaoca
// nakon redizajna Dashboard-a. `_lastAnalysisDate` keš i ključ
// `settings.lastAnalysisDate` u IDB se i dalje hidriraju u `initMetacognitiveCache`
// radi forward-compat (ako budući widget zatreba podsjetnik).

export function getCalibrationStats(entries: CalibrationEntry[]) {
  if (entries.length === 0) return { overconfident: 0, underconfident: 0, calibrated: 0, total: 0, avgDelta: 0 };
  let over = 0, under = 0, calibrated = 0, totalDelta = 0;
  entries.forEach(e => {
    const normalized = (e.confidence / 5) * 4;
    const delta = normalized - e.actualGrade;
    totalDelta += delta;
    if (delta > 0.5) over++;
    else if (delta < -0.5) under++;
    else calibrated++;
  });
  return { overconfident: over, underconfident: under, calibrated, total: entries.length, avgDelta: totalDelta / entries.length };
}

export function getLatencyStats(entries: LatencyEntry[]) {
  if (entries.length === 0) return { avg: 0, automated: 0, notAutomated: 0, total: 0 };
  const avgMs = entries.reduce((s, e) => s + e.latencyMs, 0) / entries.length;
  const automated = entries.filter(e => e.latencyMs <= 3000).length;
  return { avg: avgMs, automated, notAutomated: entries.length - automated, total: entries.length };
}

// ─── Slippage Tracking ──────────────────────────────────

export interface SlippageEntry {
  date: string;
  appEntryTime: number;
  firstActionTime: number | null;
  slippageMs: number | null;
}

export function recordAppEntry() {
  const today = new Date().toISOString().slice(0, 10);
  if (_appEntry && _appEntry.date === today) return;
  _appEntry = { date: today, time: Date.now() };
  db.settings.put({ key: "appEntry", value: _appEntry }).catch((e) => logger.warn("[silent]", e));
}

export function recordFirstAction() {
  if (!_appEntry) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (_appEntry.date !== today || _appEntry.actionRecorded) return;

    const slippageMs = Date.now() - _appEntry.time;
    _appEntry = { ..._appEntry, actionRecorded: true };
    db.settings.put({ key: "appEntry", value: _appEntry }).catch((e) => logger.warn("[silent]", e));

    const slippageEntry: SlippageEntry = { date: today, appEntryTime: _appEntry.time, firstActionTime: Date.now(), slippageMs };
    _slippageCache = [..._slippageCache, slippageEntry];
    db.slippageLog.add(slippageEntry).catch((e) => logger.warn("[silent]", e));
  } catch (err) {
    logger.warn("[metacognitive] recordFirstAction failed", err);
  }
}

export function loadSlippageLog(): SlippageEntry[] {
  return _slippageCache;
}

// ─── Activity Time Tracking ─────────────────────────────

export type ActivityType = "review" | "learn-active" | "mnemonic-test" | "mnemonic-workshop" | "admin" | "analysis";

export interface ActivityEntry {
  timestamp: number;
  type: ActivityType;
  durationMs: number;
  category?: string;
}

// `TimeReservoir`, `getReservoir` i `TimeDistribution` su INTERNI tipovi/helpers
// (de-eksportovani 2026-05) — koriste se samo unutar agregacionih funkcija ovog modula.
type TimeReservoir = "review" | "learning" | "creative" | "analysis";

function getReservoir(type: ActivityType): TimeReservoir {
  switch (type) {
    case "review":
    case "mnemonic-test":
      return "review";
    case "learn-active":
      return "learning";
    case "admin":
    case "mnemonic-workshop":
      return "creative";
    case "analysis":
      return "analysis";
  }
}

export const RESERVOIR_LABELS: Record<TimeReservoir, string> = {
  review: "Ponavljanje",
  learning: "Učenje",
  creative: "Kreativ/Admin",
  analysis: "Analiza",
};

export const RESERVOIR_COLORS: Record<TimeReservoir, string> = {
  review: "hsl(var(--primary))",
  learning: "hsl(var(--success))",
  creative: "hsl(var(--warning))",
  analysis: "hsl(var(--muted-foreground))",
};

// `loadActivityLog` uklonjen 2026-05 — nije imao pozivaoca.

export function addActivityEntry(entry: ActivityEntry) {
  _activityCache = [..._activityCache, entry];
  if (_activityCache.length > 2000) _activityCache = _activityCache.slice(-2000);
  db.activityLog.add(entry).catch((e) => logger.warn("[silent]", e));
}

interface TimeDistribution {
  review: number;
  learning: number;
  creative: number;
  analysis: number;
  totalMs: number;
  cognitiveMs: number;
  logisticMs: number;
  cognitivePct: number;
}

export function getTimeDistribution(days: number = 1): TimeDistribution {
  const cutoff = Date.now() - days * 86400000;
  const recent = _activityCache.filter(e => e.timestamp >= cutoff);

  const buckets: Record<TimeReservoir, number> = { review: 0, learning: 0, creative: 0, analysis: 0 };
  recent.forEach(e => { buckets[getReservoir(e.type)] += e.durationMs; });

  const cognitiveMs = buckets.review + buckets.learning;
  const logisticMs = buckets.creative + buckets.analysis;
  const totalMs = cognitiveMs + logisticMs;

  return {
    ...buckets, totalMs, cognitiveMs, logisticMs,
    cognitivePct: totalMs > 0 ? Math.round((cognitiveMs / totalMs) * 100) : 0,
  };
}

export function getWeeklyTimeDistribution(): { date: string; review: number; learning: number; creative: number; analysis: number }[] {
  const days: { date: string; review: number; learning: number; creative: number; analysis: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(dateStr).getTime();
    const dayEnd = dayStart + 86400000;
    const dayEntries = _activityCache.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);

    const buckets = { review: 0, learning: 0, creative: 0, analysis: 0 };
    dayEntries.forEach(e => { buckets[getReservoir(e.type)] += Math.round(e.durationMs / 60000); });
    days.push({ date: dateStr.slice(5), ...buckets });
  }
  return days;
}

export function getDeepWorkStats(days: number = 7) {
  const cutoff = Date.now() - days * 86400000;
  const recent = _activityCache.filter(e => e.timestamp >= cutoff);

  const deepWorkMs = recent
    .filter(e => e.type === "review" || e.type === "learn-active" || e.type === "mnemonic-test")
    .reduce((s, e) => s + e.durationMs, 0);
  const shallowWorkMs = recent
    .filter(e => e.type === "admin" || e.type === "analysis" || e.type === "mnemonic-workshop")
    .reduce((s, e) => s + e.durationMs, 0);
  const totalMs = deepWorkMs + shallowWorkMs;

  return {
    deepWorkMs, shallowWorkMs, totalMs,
    deepWorkPercent: totalMs > 0 ? Math.round((deepWorkMs / totalMs) * 100) : 0,
    shallowWorkPercent: totalMs > 0 ? Math.round((shallowWorkMs / totalMs) * 100) : 0,
  };
}

// ─── Learning Velocity ────────────────────────────────

export function getLearningVelocity(reviewLog: ReviewLogEntry[], categories: string[]) {
  const now = Date.now();
  const windowDays = 14;
  const cutoff = now - windowDays * 86400000;
  const recentReviews = reviewLog.filter(e => e.timestamp >= cutoff);

  const byCat: Record<string, { mastered: Set<string>; total: number; firstDate: number; lastDate: number }> = {};
  categories.forEach(cat => { byCat[cat] = { mastered: new Set(), total: 0, firstDate: now, lastDate: 0 }; });

  recentReviews.forEach(e => {
    if (!byCat[e.category]) byCat[e.category] = { mastered: new Set(), total: 0, firstDate: now, lastDate: 0 };
    byCat[e.category].total++;
    if (e.grade >= 3) byCat[e.category].mastered.add(e.sectionId);
    if (e.timestamp < byCat[e.category].firstDate) byCat[e.category].firstDate = e.timestamp;
    if (e.timestamp > byCat[e.category].lastDate) byCat[e.category].lastDate = e.timestamp;
  });

  return Object.entries(byCat).map(([cat, data]) => {
    const activeDays = Math.max(1, (data.lastDate - data.firstDate) / 86400000);
    const velocity = data.mastered.size / activeDays;
    return { category: cat, velocity, masteredCount: data.mastered.size, totalReviews: data.total, activeDays: Math.round(activeDays) };
  });
}
