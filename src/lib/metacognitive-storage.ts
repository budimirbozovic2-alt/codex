import { ReviewLogEntry, loadReviewLog } from "./storage";

// ─── Diary ───────────────────────────────────────────────
const DIARY_KEY = "sr-metacognitive-diary";

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  dailyGoal: string;
  selfAnalysis: string;
  createdAt: number;
}

export function loadDiary(): DiaryEntry[] {
  try {
    const data = localStorage.getItem(DIARY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveDiary(entries: DiaryEntry[]) {
  localStorage.setItem(DIARY_KEY, JSON.stringify(entries));
}

export function addDiaryEntry(entry: Omit<DiaryEntry, "id" | "createdAt">): DiaryEntry {
  const full: DiaryEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const diary = loadDiary();
  // Replace if same date exists
  const idx = diary.findIndex(d => d.date === entry.date);
  if (idx >= 0) diary[idx] = full; else diary.push(full);
  saveDiary(diary);
  return full;
}

// ─── Calibration (confidence before reveal) ──────────────
const CALIBRATION_KEY = "sr-calibration-log";

export interface CalibrationEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  confidence: number; // 1-5
  actualGrade: number; // 1-4
  category: string;
}

export function loadCalibration(): CalibrationEntry[] {
  try {
    const data = localStorage.getItem(CALIBRATION_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveCalibration(entries: CalibrationEntry[]) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(entries));
}

export function addCalibrationEntry(entry: CalibrationEntry) {
  const log = loadCalibration();
  log.push(entry);
  saveCalibration(log);
}

// ─── Recall Latency ──────────────────────────────────────
const LATENCY_KEY = "sr-recall-latency";

export interface LatencyEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  latencyMs: number;
  category: string;
}

export function loadLatency(): LatencyEntry[] {
  try {
    const data = localStorage.getItem(LATENCY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveLatency(entries: LatencyEntry[]) {
  localStorage.setItem(LATENCY_KEY, JSON.stringify(entries));
}

export function addLatencyEntry(entry: LatencyEntry) {
  const log = loadLatency();
  log.push(entry);
  saveLatency(log);
}

// ─── Self-analysis reminder ─────────────────────────────
const LAST_ANALYSIS_KEY = "sr-last-analysis-date";

export function getLastAnalysisDate(): string | null {
  return localStorage.getItem(LAST_ANALYSIS_KEY);
}

export function setLastAnalysisDate(date: string) {
  localStorage.setItem(LAST_ANALYSIS_KEY, date);
}

export function isAnalysisNeededToday(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const last = getLastAnalysisDate();
  if (last === today) return false;
  // Check if user reviewed anything today
  const log = loadReviewLog();
  const todayStart = new Date(today).getTime();
  return log.some(e => e.timestamp >= todayStart);
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

  let over = 0, under = 0, calibrated = 0;
  let totalDelta = 0;

  entries.forEach(e => {
    // Map confidence 1-5 to comparable scale with grade 1-4
    const normalized = (e.confidence / 5) * 4;
    const delta = normalized - e.actualGrade;
    totalDelta += delta;
    if (delta > 0.5) over++;
    else if (delta < -0.5) under++;
    else calibrated++;
  });

  return {
    overconfident: over,
    underconfident: under,
    calibrated,
    total: entries.length,
    avgDelta: totalDelta / entries.length,
  };
}

export function getLatencyStats(entries: LatencyEntry[]) {
  if (entries.length === 0) return { avg: 0, automated: 0, notAutomated: 0, total: 0 };

  const avgMs = entries.reduce((s, e) => s + e.latencyMs, 0) / entries.length;
  const automated = entries.filter(e => e.latencyMs <= 3000).length;

  return {
    avg: avgMs,
    automated,
    notAutomated: entries.length - automated,
    total: entries.length,
  };
}

// ─── Slippage Tracking ──────────────────────────────────
const SLIPPAGE_KEY = "sr-slippage-log";
const APP_ENTRY_KEY = "sr-app-entry-time";

export interface SlippageEntry {
  date: string; // YYYY-MM-DD
  appEntryTime: number; // timestamp
  firstActionTime: number | null; // timestamp
  slippageMs: number | null;
}

export function recordAppEntry() {
  const today = new Date().toISOString().slice(0, 10);
  const existing = localStorage.getItem(APP_ENTRY_KEY);
  // Only record first entry of the day
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed.date === today) return;
    } catch {}
  }
  localStorage.setItem(APP_ENTRY_KEY, JSON.stringify({ date: today, time: Date.now() }));
}

export function recordFirstAction() {
  const entryRaw = localStorage.getItem(APP_ENTRY_KEY);
  if (!entryRaw) return;
  try {
    const entry = JSON.parse(entryRaw);
    const today = new Date().toISOString().slice(0, 10);
    if (entry.date !== today) return;
    if (entry.actionRecorded) return;

    const slippageMs = Date.now() - entry.time;
    entry.actionRecorded = true;
    localStorage.setItem(APP_ENTRY_KEY, JSON.stringify(entry));

    // Save to log
    const log = loadSlippageLog();
    log.push({ date: today, appEntryTime: entry.time, firstActionTime: Date.now(), slippageMs });
    localStorage.setItem(SLIPPAGE_KEY, JSON.stringify(log));
  } catch {}
}

export function loadSlippageLog(): SlippageEntry[] {
  try {
    const data = localStorage.getItem(SLIPPAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

// ─── Activity Time Tracking ─────────────────────────────
const ACTIVITY_KEY = "sr-activity-log";

export interface ActivityEntry {
  timestamp: number;
  type: "review" | "learn-active" | "learn-free" | "learn-chain";
  durationMs: number;
  category?: string;
}

export function loadActivityLog(): ActivityEntry[] {
  try {
    const data = localStorage.getItem(ACTIVITY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function addActivityEntry(entry: ActivityEntry) {
  const log = loadActivityLog();
  log.push(entry);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
}

export function getDeepWorkStats(days: number = 7) {
  const log = loadActivityLog();
  const cutoff = Date.now() - days * 86400000;
  const recent = log.filter(e => e.timestamp >= cutoff);

  const deepWorkMs = recent
    .filter(e => e.type === "review" || e.type === "learn-active" || e.type === "learn-chain")
    .reduce((s, e) => s + e.durationMs, 0);
  const shallowWorkMs = recent
    .filter(e => e.type === "learn-free")
    .reduce((s, e) => s + e.durationMs, 0);
  const totalMs = deepWorkMs + shallowWorkMs;

  return {
    deepWorkMs,
    shallowWorkMs,
    totalMs,
    deepWorkPercent: totalMs > 0 ? Math.round((deepWorkMs / totalMs) * 100) : 0,
    shallowWorkPercent: totalMs > 0 ? Math.round((shallowWorkMs / totalMs) * 100) : 0,
  };
}

// ─── Learning Velocity (for Predictive Analytics) ────────

export function getLearningVelocity(reviewLog: ReviewLogEntry[], categories: string[]) {
  // Calculate sections mastered per day per category over last 14 days
  const now = Date.now();
  const windowDays = 14;
  const cutoff = now - windowDays * 86400000;
  const recentReviews = reviewLog.filter(e => e.timestamp >= cutoff);

  // Count unique section masteries (grade >= 3) per category
  const byCat: Record<string, { mastered: Set<string>; total: number; firstDate: number; lastDate: number }> = {};

  categories.forEach(cat => {
    byCat[cat] = { mastered: new Set(), total: 0, firstDate: now, lastDate: 0 };
  });

  recentReviews.forEach(e => {
    if (!byCat[e.category]) byCat[e.category] = { mastered: new Set(), total: 0, firstDate: now, lastDate: 0 };
    byCat[e.category].total++;
    if (e.grade >= 3) byCat[e.category].mastered.add(e.sectionId);
    if (e.timestamp < byCat[e.category].firstDate) byCat[e.category].firstDate = e.timestamp;
    if (e.timestamp > byCat[e.category].lastDate) byCat[e.category].lastDate = e.timestamp;
  });

  return Object.entries(byCat).map(([cat, data]) => {
    const activeDays = Math.max(1, (data.lastDate - data.firstDate) / 86400000);
    const velocity = data.mastered.size / activeDays; // sections per day
    return { category: cat, velocity, masteredCount: data.mastered.size, totalReviews: data.total, activeDays: Math.round(activeDays) };
  });
}
