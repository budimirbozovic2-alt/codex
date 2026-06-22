/**
 * Pre-Zod heal pass for legacy v7 full backups.
 *
 * Older exports (pre–Editor v4 migration) stored section bodies as HTML `content`
 * and sources as `htmlContent`. Current BackupSchema requires `contentDoc`.
 * This module upgrades those payloads in-place on a shallow clone so the
 * normal import path (BackupSchema → migrateBackup → applyImportAtomically)
 * stays unchanged.
 */
import { htmlToDoc } from "@/lib/editor-v4";
import type { EditorDoc } from "@/lib/editor-v4/types";

export interface HealBackupReport {
  sectionsHealed: number;
  sourcesHealed: number;
  categoriesHealed: number;
  knowledgeBaseHealed: number;
  mnemonicsHealed: number;
  satelliteRowsCleaned: number;
}

const EMPTY_HEAL_REPORT: HealBackupReport = {
  sectionsHealed: 0,
  sourcesHealed: 0,
  categoriesHealed: 0,
  knowledgeBaseHealed: 0,
  mnemonicsHealed: 0,
  satelliteRowsCleaned: 0,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isValidContentDoc(v: unknown): v is EditorDoc {
  const doc = v as { version?: number; content?: unknown };
  return doc?.version === 4 && doc.content != null;
}

function healHtmlToContentDoc(
  row: Record<string, unknown>,
  htmlKeys: string[],
): boolean {
  if (isValidContentDoc(row.contentDoc)) return false;
  let html = "";
  for (const key of htmlKeys) {
    const val = row[key];
    if (typeof val === "string" && val.length > 0) {
      html = val;
      break;
    }
  }
  if (!html.includes("<")) {
    html = `<p>${html.replace(/</g, "&lt;").replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
  }
  row.contentDoc = htmlToDoc(html || "<p></p>");
  for (const key of htmlKeys) {
    if (key in row) delete row[key];
  }
  return true;
}

function healSection(sec: unknown): boolean {
  if (!isRecord(sec)) return false;
  return healHtmlToContentDoc(sec, ["content"]);
}

function healMnemonicSection(sec: unknown): boolean {
  if (!isRecord(sec)) return false;
  return healHtmlToContentDoc(sec, ["content"]);
}

function healSource(src: unknown): boolean {
  if (!isRecord(src)) return false;
  return healHtmlToContentDoc(src, ["htmlContent", "content"]);
}

function healKnowledgeBaseArticle(article: unknown): boolean {
  if (!isRecord(article)) return false;
  return healHtmlToContentDoc(article, ["content"]);
}

function healMnemonic(m: unknown): boolean {
  if (!isRecord(m)) return false;
  let healed = false;
  if ("category" in m) {
    delete m.category;
    healed = true;
  }
  if ("subcategory" in m) {
    delete m.subcategory;
    healed = true;
  }
  if (Array.isArray(m.sections)) {
    m.sections = m.sections.map((sec) => {
      if (!isRecord(sec)) return sec;
      const next = { ...sec };
      if (healMnemonicSection(next)) healed = true;
      return next;
    });
  }
  return healed;
}

function healDiaryEntry(row: unknown): boolean {
  if (!isRecord(row)) return false;
  if (typeof row.id === "string" && row.id.length > 0) return false;
  row.id = crypto.randomUUID();
  return true;
}

function healReviewLogRow(row: unknown): boolean {
  if (!isRecord(row)) return false;
  if (!("id" in row)) return false;
  delete row.id;
  return true;
}

function healCategory(cat: unknown): boolean {
  if (!isRecord(cat)) return false;
  let healed = false;
  const structure = cat.structure;
  if (
    isRecord(structure) &&
    Array.isArray(structure.subcategories) &&
    (!Array.isArray(cat.subcategories) || (cat.subcategories as unknown[]).length === 0)
  ) {
    cat.subcategories = structure.subcategories;
    delete cat.structure;
    healed = true;
  }
  return healed;
}

/** Strip legacy SQLite row ids that fail strict satellite-log schemas. */
function cleanSatelliteRow(row: unknown): boolean {
  if (!isRecord(row)) return false;
  if (!("id" in row)) return false;
  delete row.id;
  return true;
}

function healSatelliteLogs(root: Record<string, unknown>, report: HealBackupReport): void {
  const logKeys = [
    "slippageLog",
    "activityLog",
    "pomodoroLog",
    "disciplineLog",
    "calibrationLog",
    "latencyLog",
    "mnemonicTestLog",
  ] as const;
  for (const key of logKeys) {
    const arr = root[key];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (cleanSatelliteRow(row)) report.satelliteRowsCleaned++;
    }
  }

  if (Array.isArray(root.reviewLog)) {
    root.reviewLog = root.reviewLog.map((row) => {
      if (!isRecord(row)) return row;
      const next = { ...row };
      if (healReviewLogRow(next)) report.satelliteRowsCleaned++;
      return next;
    });
  }

  if (Array.isArray(root.diary)) {
    root.diary = root.diary.map((row) => {
      if (!isRecord(row)) return row;
      const next = { ...row };
      if (healDiaryEntry(next)) report.satelliteRowsCleaned++;
      return next;
    });
  }
}

/**
 * Returns true when the payload likely needs HTML → contentDoc conversion.
 */
export function needsBackupHeal(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  const cards = raw.cards;
  if (!Array.isArray(cards)) return false;
  for (const card of cards) {
    if (!isRecord(card)) continue;
    const sections = card.sections;
    if (!Array.isArray(sections)) continue;
    for (const sec of sections) {
      if (!isRecord(sec)) continue;
      if (!isValidContentDoc(sec.contentDoc) && typeof sec.content === "string") {
        return true;
      }
    }
  }
  const sources = raw.sources;
  if (Array.isArray(sources)) {
    for (const src of sources) {
      if (!isRecord(src)) continue;
      if (
        !isValidContentDoc(src.contentDoc) &&
        (typeof src.htmlContent === "string" || typeof src.content === "string")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns a healed copy of the raw backup JSON (top-level shallow clone).
 * Safe to call on already-modern backups — returns unchanged report zeros.
 */
export function healBackupRaw(raw: unknown): { raw: unknown; report: HealBackupReport } {
  if (!isRecord(raw)) {
    return { raw, report: { ...EMPTY_HEAL_REPORT } };
  }

  const out: Record<string, unknown> = { ...raw };
  const report: HealBackupReport = { ...EMPTY_HEAL_REPORT };

  if (Array.isArray(raw.cards)) {
    out.cards = raw.cards.map((card) => {
      if (!isRecord(card)) return card;
      const nextCard = { ...card };
      if (Array.isArray(card.sections)) {
        nextCard.sections = card.sections.map((sec) => {
          if (!isRecord(sec)) return sec;
          const nextSec = { ...sec };
          if (healSection(nextSec)) report.sectionsHealed++;
          return nextSec;
        });
      }
      return nextCard;
    });
  }

  if (Array.isArray(raw.sources)) {
    out.sources = raw.sources.map((src) => {
      if (!isRecord(src)) return src;
      const nextSrc = { ...src };
      if (healSource(nextSrc)) report.sourcesHealed++;
      return nextSrc;
    });
  }

  if (Array.isArray(raw.categories)) {
    out.categories = raw.categories.map((cat) => {
      if (!isRecord(cat)) return cat;
      const nextCat = { ...cat };
      if (healCategory(nextCat)) report.categoriesHealed++;
      return nextCat;
    });
  }

  if (Array.isArray(raw.knowledgeBaseArticles)) {
    out.knowledgeBaseArticles = raw.knowledgeBaseArticles.map((article) => {
      if (!isRecord(article)) return article;
      const next = { ...article };
      if (healKnowledgeBaseArticle(next)) report.knowledgeBaseHealed++;
      return next;
    });
  }

  if (Array.isArray(raw.mnemonics)) {
    out.mnemonics = raw.mnemonics.map((m) => {
      if (!isRecord(m)) return m;
      const next = { ...m };
      if (healMnemonic(next)) report.mnemonicsHealed++;
      return next;
    });
  }

  healSatelliteLogs(out, report);

  return { raw: out, report };
}
