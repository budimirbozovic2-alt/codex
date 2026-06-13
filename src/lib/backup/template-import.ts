/**
 * v2 template export → v7 ParsedBackup converter.
 * Templates carry HTML `content` per section; full backups require contentDoc.
 */
import { htmlToDoc } from "@/lib/editor-v4";
import { createSection, type Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";

export const TEMPLATE_EXPORT_VERSION = 2;

interface TemplateSection {
  title?: unknown;
  content?: unknown;
}

interface TemplateCard {
  id?: unknown;
  question?: unknown;
  sections?: unknown;
  categoryId?: unknown;
  subcategoryId?: unknown;
  chapterId?: unknown;
  type?: unknown;
  tags?: unknown;
  createdAt?: unknown;
}

export function isTemplateExport(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.type !== "template") return false;
  const version = typeof o.version === "number" && Number.isFinite(o.version)
    ? Math.floor(o.version)
    : 0;
  return version > 0 && version !== BACKUP_SCHEMA_VERSION;
}

function optionalId(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function templateSectionToSection(sec: TemplateSection) {
  const html = typeof sec.content === "string" ? sec.content : "<p></p>";
  const title = typeof sec.title === "string" ? sec.title : "";
  return createSection(title, htmlToDoc(html));
}

function templateCardToCard(tc: TemplateCard): Card | null {
  if (typeof tc.id !== "string" || typeof tc.question !== "string") return null;
  if (typeof tc.categoryId !== "string" || tc.categoryId.length === 0) return null;

  const sections = Array.isArray(tc.sections) && tc.sections.length > 0
    ? tc.sections.map((s) => templateSectionToSection(s as TemplateSection))
    : [createSection("Odgovor", htmlToDoc("<p></p>"))];

  const card: Card = {
    id: tc.id,
    question: tc.question,
    sections,
    categoryId: tc.categoryId,
    createdAt: typeof tc.createdAt === "number" ? tc.createdAt : Date.now(),
    readCount: 0,
    type: tc.type === "flash" ? "flash" : "essay",
  };

  const subcategoryId = optionalId(tc.subcategoryId);
  if (subcategoryId) card.subcategoryId = subcategoryId;
  const chapterId = optionalId(tc.chapterId);
  if (chapterId) card.chapterId = chapterId;
  if (Array.isArray(tc.tags)) {
    const tags = tc.tags.filter((t): t is string => typeof t === "string");
    if (tags.length > 0) card.tags = tags;
  }

  return card;
}

export function convertTemplateToParsedBackup(raw: unknown): ParsedBackup {
  if (!isTemplateExport(raw)) {
    throw new Error("Fajl nije template export (očekivano type: \"template\", verzija ≠ v7).");
  }

  const o = raw as Record<string, unknown>;
  const categories = Array.isArray(o.categories) ? o.categories as CategoryRecord[] : [];
  const rawCards = Array.isArray(o.cards) ? o.cards as TemplateCard[] : [];

  const cards: Card[] = [];
  for (const tc of rawCards) {
    const card = templateCardToCard(tc);
    if (card) cards.push(card);
  }

  const parsed: ParsedBackup = {
    version: BACKUP_SCHEMA_VERSION,
    type: "template",
    cards,
    categories,
    sources: [],
    mindMaps: [],
    knowledgeBaseArticles: [],
    settings: [],
    reviewLog: [],
    diary: [],
    calibrationLog: [],
    latencyLog: [],
    slippageLog: [],
    activityLog: [],
    disciplineLog: [],
    pomodoroLog: [],
    mnemonics: [],
    majorSystem: [],
    mnemonicTestLog: [],
  };

  const result = BackupSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      issue
        ? `Template nije validan nakon konverzije: ${issue.path.join(".") || "(root)"} — ${issue.message}`
        : "Template nije validan nakon konverzije.",
    );
  }

  return result.data;
}
