import { ReviewLogEntry } from "./storage";
import { db } from "./db";

// ─── Diary ───────────────────────────────────────────────
export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  dailyGoal: string;
  selfAnalysis: string;
  createdAt: number;
}

export function loadDiary(): DiaryEntry[] {
  // Sync fallback for legacy callers — prefer loadDiaryAsync
  try {
    const data = localStorage.getItem("sr-metacognitive-diary");
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function loadDiaryAsync(): Promise<DiaryEntry[]> {
  const entries = await db.diary.toArray();
  return entries.length > 0 ? entries : loadDiary();
}

export async function saveDiary(entries: DiaryEntry[]) {
  await db.diary.clear();
  if (entries.length > 0) await db.diary.bulkPut(entries);
}

export async function addDiaryEntry(entry: Omit<DiaryEntry, "id" | "createdAt">): Promise<DiaryEntry> {
  const full: DiaryEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const diary = await loadDiaryAsync();
  const idx = diary.findIndex(d => d.date === entry.date);
  if (idx >= 0) diary[idx] = full; else diary.push(full);
  await saveDiary(diary);
  return full;
}

// ─── Calibration (confidence before reveal) ──────────────
export interface CalibrationEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  confidence: number; // 1-5
  actualGrade: number; // 1-4
  category: string;
}

export async function loadCalibration(): Promise<CalibrationEntry[]> {
  return db.calibrationLog.toArray();
}

export async function addCalibrationEntry(entry: CalibrationEntry) {
  await db.calibrationLog.add(entry);
}

// ─── Recall Latency ──────────────────────────────────────
export interface LatencyEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  latencyMs: number;
  category: string;
}

export async function loadLatency(): Promise<LatencyEntry[]> {
  return db.latencyLog.toArray();
}

export async function addLatencyEntry(entry: LatencyEntry) {
  await db.latencyLog.add(entry);
}

// ─── Self-analysis reminder ─────────────────────────────
export async function getLastAnalysisDate(): Promise<string | null> {
  const row = await db.settings.get("lastAnalysisDate");
  return row ? row.value : null;
}

export async function setLastAnalysisDate(date: string) {
  await db.settings.put({ key: "lastAnalysisDate", value: date });
}

export async function isAnalysisNeededToday(reviewLog: ReviewLogEntry[]): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const last = await getLastAnalysisDate();
  if (last === today) return false;
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
  // Still sync for quick mount-time call — uses localStorage as fast cache,
  // IDB as persistent store
  const today = new Date().toISOString().slice(0, 10);
  const existing = localStorage.getItem("sr-app-entry-time");
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed.date === today) return;
    } catch {}
  }
  const entry = { date: today, time: Date.now() };
  localStorage.setItem("sr-app-entry-time", JSON.stringify(entry));
  db.settings.put({ key: "appEntry", value: entry }).catch(() => {});
}

export function recordFirstAction() {
  const entryRaw = localStorage.getItem("sr-app-entry-time");
  if (!entryRaw) return;
  try {
    const entry = JSON.parse(entryRaw);
    const today = new Date().toISOString().slice(0, 10);
    if (entry.date !== today || entry.actionRecorded) return;

    const slippageMs = Date.now() - entry.time;
    entry.actionRecorded = true;
    localStorage.setItem("sr-app-entry-time", JSON.stringify(entry));
    db.settings.put({ key: "appEntry", value: entry }).catch(() => {});

    const slippageEntry: SlippageEntry = { date: today, appEntryTime: entry.time, firstActionTime: Date.now(), slippageMs };
    db.slippageLog.add(slippageEntry).catch(() => {});
  } catch {}
}

export async function loadSlippageLog(): Promise<SlippageEntry[]> {
  return db.slippageLog.toArray();
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

export async function loadActivityLog(): Promise<ActivityEntry[]> {
  return db.activityLog.toArray();
}

export function addActivityEntry(entry: ActivityEntry) {
  // Fire-and-forget — used on unmount
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

export async function getTimeDistribution(days: number = 1): Promise<TimeDistribution> {
  const log = await loadActivityLog();
  const cutoff = Date.now() - days * 86400000;
  const recent = log.filter(e => e.timestamp >= cutoff);

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

export async function getWeeklyTimeDistribution(): Promise<{ date: string; review: number; learning: number; creative: number; analysis: number }[]> {
  const log = await loadActivityLog();
  const days: { date: string; review: number; learning: number; creative: number; analysis: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(dateStr).getTime();
    const dayEnd = dayStart + 86400000;
    const dayEntries = log.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);

    const buckets = { review: 0, learning: 0, creative: 0, analysis: 0 };
    dayEntries.forEach(e => { buckets[getReservoir(e.type)] += Math.round(e.durationMs / 60000); });
    days.push({ date: dateStr.slice(5), ...buckets });
  }
  return days;
}

export async function getDeepWorkStats(days: number = 7) {
  const log = await loadActivityLog();
  const cutoff = Date.now() - days * 86400000;
  const recent = log.filter(e => e.timestamp >= cutoff);

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

// ─── Learning Velocity (for Predictive Analytics) ────────

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
