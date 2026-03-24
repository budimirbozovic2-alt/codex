import { ReviewLogEntry } from "./storage";
import { db } from "./db";

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
    const [diary, calibration, latency, slippage, activity, analysisRow, appEntryRow] = await Promise.all([
      db.diary.toArray(),
      db.calibrationLog.toArray(),
      db.latencyLog.toArray(),
      db.slippageLog.toArray(),
      db.activityLog.toArray(),
      db.settings.get("lastAnalysisDate"),
      db.settings.get("appEntry"),
    ]);
    _diaryCache = diary;
    // Trim caches to last 90 days to prevent unbounded memory growth
    const cutoff90 = Date.now() - 90 * 86400000;
    _calibrationCache = calibration.filter(e => e.timestamp >= cutoff90);
    _latencyCache = latency.filter(e => e.timestamp >= cutoff90);
    _slippageCache = slippage;
    _activityCache = activity.filter(e => e.timestamp >= cutoff90);
    _lastAnalysisDate = analysisRow?.value ?? null;
    _appEntry = appEntryRow?.value ?? null;
    _cacheReady = true;
  } catch (err) {
    console.warn("[metacognitive] cache init failed, using empty defaults", err);
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

export function loadDiary(): DiaryEntry[] {
  return _diaryCache;
}

export function saveDiary(entries: DiaryEntry[]) {
  _diaryCache = entries;
  if (entries.length > 0) {
    db.diary.bulkPut(entries).catch(() => {});
  }
}

export function addDiaryEntry(entry: Omit<DiaryEntry, "id" | "createdAt">): DiaryEntry {
  const full: DiaryEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const diary = [..._diaryCache];
  const idx = diary.findIndex(d => d.date === entry.date);
  if (idx >= 0) diary[idx] = full; else diary.push(full);
  saveDiary(diary);
  return full;
}

// ─── Calibration (confidence before reveal) ──────────────

export interface CalibrationEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  confidence: number;
  actualGrade: number;
  category: string;
}

export function loadCalibration(): CalibrationEntry[] {
  return _calibrationCache;
}

export function saveCalibration(entries: CalibrationEntry[]) {
  _calibrationCache = entries;
  if (entries.length > 0) {
    db.calibrationLog.bulkPut(entries).catch(() => {});
  }
}

export function addCalibrationEntry(entry: CalibrationEntry) {
  _calibrationCache = [..._calibrationCache, entry];
  db.calibrationLog.add(entry).catch(() => {});
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

export function saveLatency(entries: LatencyEntry[]) {
  _latencyCache = entries;
  if (entries.length > 0) {
    db.latencyLog.bulkPut(entries).catch(() => {});
  }
}

export function addLatencyEntry(entry: LatencyEntry) {
  _latencyCache = [..._latencyCache, entry];
  db.latencyLog.add(entry).catch(() => {});
}

// ─── Self-analysis reminder ─────────────────────────────

export function getLastAnalysisDate(): string | null {
  return _lastAnalysisDate;
}

export function setLastAnalysisDate(date: string) {
  _lastAnalysisDate = date;
  db.settings.put({ key: "lastAnalysisDate", value: date }).catch(() => {});
}

export function isAnalysisNeededToday(reviewLog: ReviewLogEntry[]): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (_lastAnalysisDate === today) return false;
  const todayStart = new Date(today).getTime();
  return reviewLog.some(e => e.timestamp >= todayStart);
}

// ─── Aggregation helpers ─────────────────────────────────

export function getTodayReviewStats(reviewLog: ReviewLogEntry[]) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(todayStr).getTime();
  const todayEntries = reviewLog.filter(e => e.timestamp >= todayStart);
  const successes = todayEntries.filter(e => e.grade === 4);
  const lapses = todayEntries.filter(e => e.grade <= 2);
  return { successes, lapses, total: todayEntries.length };
}

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
  db.settings.put({ key: "appEntry", value: _appEntry }).catch(() => {});
}

export function recordFirstAction() {
  if (!_appEntry) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (_appEntry.date !== today || _appEntry.actionRecorded) return;

    const slippageMs = Date.now() - _appEntry.time;
    _appEntry = { ..._appEntry, actionRecorded: true };
    db.settings.put({ key: "appEntry", value: _appEntry }).catch(() => {});

    const slippageEntry: SlippageEntry = { date: today, appEntryTime: _appEntry.time, firstActionTime: Date.now(), slippageMs };
    _slippageCache = [..._slippageCache, slippageEntry];
    db.slippageLog.add(slippageEntry).catch(() => {});
  } catch {}
}

export function loadSlippageLog(): SlippageEntry[] {
  return _slippageCache;
}

// ─── Activity Time Tracking ─────────────────────────────

export type ActivityType = "review" | "learn-active" | "learn-free" | "learn-chain" | "mnemonic-test" | "mnemonic-workshop" | "admin" | "analysis";

export interface ActivityEntry {
  timestamp: number;
  type: ActivityType;
  durationMs: number;
  category?: string;
}

export type TimeReservoir = "review" | "learning" | "creative" | "analysis";

export function getReservoir(type: ActivityType): TimeReservoir {
  switch (type) {
    case "review":
    case "mnemonic-test":
      return "review";
    case "learn-active":
    case "learn-free":
    case "learn-chain":
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

export function loadActivityLog(): ActivityEntry[] {
  return _activityCache;
}

export function addActivityEntry(entry: ActivityEntry) {
  _activityCache = [..._activityCache, entry];
  db.activityLog.add(entry).catch(() => {});
}

export interface TimeDistribution {
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
    .filter(e => e.type === "review" || e.type === "learn-active" || e.type === "learn-chain" || e.type === "mnemonic-test")
    .reduce((s, e) => s + e.durationMs, 0);
  const shallowWorkMs = recent
    .filter(e => e.type === "learn-free" || e.type === "admin" || e.type === "analysis" || e.type === "mnemonic-workshop")
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
