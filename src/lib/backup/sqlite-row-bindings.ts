/**
 * Backup-import row-bindings — PR-9 A1c-4 prep.
 *
 * Pure encode helpers + INSERT SQL strings for every SQLite table the
 * Row encoders shared by the backup-import pipeline writes.
 * shape (same columns, same JSON payload semantics), so a restore lands rows
 * that are byte-identical to what a live SQLite export would produce.
 *
 * Cards reuse the canonical `bindCardInsert` + `CARD_INSERT_SQL` from
 * `persistence/sqlite/row-codecs.ts` — single writer for the cards row shape.
 *
 * Zero `any`. All binders take their domain type and return a positional
 * `SqlBindValue[]` aligned with the `?` placeholders in the matching SQL.
 */
import type { SqlBindValue } from "@/lib/persistence/sqlite/executor";
import type {
  CategoryRecord,
  MindMapDoc,
  KnowledgeBaseArticle,
  Source,
} from "@/lib/db-types";
import type { MnemonicCard } from "@/domains/mnemonic";
import { encodeCategoryPayload } from "@/lib/persistence/sqlite/category-codecs";

// ─── INSERT SQL constants ────────────────────────────────────────────────

export const CATEGORY_INSERT_SQL =
  "INSERT OR REPLACE INTO categories (id, name, sortOrder, color, payload) VALUES (?, ?, ?, ?, ?)";

export const SOURCE_INSERT_SQL =
  "INSERT OR REPLACE INTO sources (id, categoryId, title, version, createdAt, sourceKind, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";

export const MINDMAP_INSERT_SQL =
  "INSERT OR REPLACE INTO mindMaps (id, categoryId, title, updatedAt, payload) VALUES (?, ?, ?, ?, ?)";

export const MNEMONIC_INSERT_SQL =
  "INSERT OR REPLACE INTO mnemonics (id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";

export const KB_ARTICLE_INSERT_SQL =
  "INSERT OR REPLACE INTO knowledgeBaseArticles (id, subjectId, title, updatedAt, isIndex, payload) VALUES (?, ?, ?, ?, ?, ?)";

export const MAJOR_SYSTEM_INSERT_SQL =
  "INSERT OR REPLACE INTO majorSystem (id, peg) VALUES (?, ?)";

export const KV_INSERT_SQL =
  "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)";

// ─── Bindings ────────────────────────────────────────────────────────────

export function bindCategory(c: CategoryRecord): SqlBindValue[] {
  return [
    c.id,
    c.name,
    c.sortOrder ?? 0,
    (c as { color?: string }).color ?? null,
    encodeCategoryPayload(c),
  ];
}

export function bindSource(s: Source): SqlBindValue[] {
  return [
    s.id,
    s.categoryId,
    s.title,
    (s as { version?: number }).version ?? 1,
    (s as { createdAt?: number }).createdAt ?? Date.now(),
    (s as { sourceKind?: string }).sourceKind ?? null,
    JSON.stringify(s),
  ];
}

export function bindMindMap(m: MindMapDoc): SqlBindValue[] {
  return [
    m.id,
    (m as { categoryId?: string }).categoryId ?? "",
    m.title,
    (m as { updatedAt?: number }).updatedAt ?? Date.now(),
    JSON.stringify(m),
  ];
}

export function bindMnemonic(m: MnemonicCard): SqlBindValue[] {
  return [
    m.id,
    m.categoryId,
    (m as { subcategoryId?: string }).subcategoryId ?? null,
    (m as { mnemonicStatus?: string }).mnemonicStatus ?? null,
    (m as { hookType?: string }).hookType ?? null,
    (m as { createdAt?: number }).createdAt ?? Date.now(),
    JSON.stringify(m),
  ];
}

export function bindKbArticle(a: KnowledgeBaseArticle): SqlBindValue[] {
  return [
    a.id,
    a.subjectId,
    a.title,
    (a as { updatedAt?: number }).updatedAt ?? Date.now(),
    (a as { isIndex?: boolean }).isIndex ? 1 : 0,
    JSON.stringify(a),
  ];
}

export function bindMajorSystemPeg(p: { id: number; peg?: string }): SqlBindValue[] {
  return [Number(p.id), String(p.peg ?? "")];
}

export function bindKv(entry: { key: string; value: unknown }): SqlBindValue[] {
  const raw = entry.value;
  const value = typeof raw === "string" ? raw : JSON.stringify(raw);
  return [String(entry.key), value];
}
