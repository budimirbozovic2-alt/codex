/**
 * Relational category taxonomy codecs — subcategories + chapters live in
 * dedicated tables; `categories.payload` carries only `examinerProfile`.
 */
import type { SqlExecutor } from "./executor";
import type {
  CategoryRecord,
  ChapterNode,
  ExaminerProfile,
  SubcategoryNode,
} from "@/lib/db-types";

export const SUBCATEGORY_INSERT_SQL =
  "INSERT OR REPLACE INTO subcategories (id, categoryId, name, sortOrder) VALUES (?, ?, ?, ?)";

export const CHAPTER_INSERT_SQL =
  "INSERT OR REPLACE INTO chapters (id, subcategoryId, name, sortOrder) VALUES (?, ?, ?, ?)";

export function encodeCategoryPayload(
  c: Pick<CategoryRecord, "examinerProfile">,
): string {
  if (!c.examinerProfile) return "{}";
  return JSON.stringify({ examinerProfile: c.examinerProfile });
}

export function decodeCategoryPayload(payload: string): {
  examinerProfile?: ExaminerProfile;
} {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.examinerProfile && typeof parsed === "object") {
      return { examinerProfile: parsed.examinerProfile as ExaminerProfile };
    }
    // Legacy: full CategoryRecord was stored in payload.
    if (Array.isArray(parsed.subcategories)) {
      return { examinerProfile: parsed.examinerProfile as ExaminerProfile | undefined };
    }
    return {};
  } catch {
    return {};
  }
}

/** Parse legacy or slim payload into subcategories (for one-time migration). */
export function decodeLegacySubcategories(payload: string): SubcategoryNode[] {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (!Array.isArray(parsed.subcategories)) return [];
    return (parsed.subcategories as SubcategoryNode[]).map((sub, i) => ({
      id: sub.id,
      name: sub.name,
      sortOrder: sub.sortOrder ?? i,
      chapters: (sub.chapters ?? []).map((ch, j) =>
        typeof ch === "object" && ch
          ? {
              id: (ch as ChapterNode).id,
              name: (ch as ChapterNode).name,
              sortOrder: (ch as ChapterNode).sortOrder ?? j,
            }
          : { id: String(ch), name: String(ch), sortOrder: j },
      ),
    }));
  } catch {
    return [];
  }
}

interface CategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  color: string | null;
  payload: string;
}

interface SubcategoryRow {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
}

interface ChapterRow {
  id: string;
  subcategoryId: string;
  name: string;
  sortOrder: number;
}

export function assembleCategoryRecords(
  catRows: readonly CategoryRow[],
  subRows: readonly SubcategoryRow[],
  chapterRows: readonly ChapterRow[],
): CategoryRecord[] {
  const chaptersBySub = new Map<string, ChapterNode[]>();
  for (const ch of chapterRows) {
    const list = chaptersBySub.get(ch.subcategoryId) ?? [];
    list.push({ id: ch.id, name: ch.name, sortOrder: ch.sortOrder });
    chaptersBySub.set(ch.subcategoryId, list);
  }

  const subsByCat = new Map<string, SubcategoryNode[]>();
  for (const sub of subRows) {
    const list = subsByCat.get(sub.categoryId) ?? [];
    list.push({
      id: sub.id,
      name: sub.name,
      sortOrder: sub.sortOrder,
      chapters: chaptersBySub.get(sub.id) ?? [],
    });
    subsByCat.set(sub.categoryId, list);
  }

  return catRows.map((row) => {
    const extras = decodeCategoryPayload(row.payload);
    return {
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      color: row.color ?? undefined,
      subcategories: subsByCat.get(row.id) ?? [],
      examinerProfile: extras.examinerProfile,
    };
  });
}

export async function loadAllCategoryRows(
  exec: SqlExecutor,
): Promise<CategoryRecord[]> {
  const [catRows, subRows, chapterRows] = await Promise.all([
    exec.all<CategoryRow>(
      "SELECT id, name, sortOrder, color, payload FROM categories ORDER BY sortOrder ASC, name ASC",
    ),
    exec.all<SubcategoryRow>(
      "SELECT id, categoryId, name, sortOrder FROM subcategories ORDER BY sortOrder ASC, name ASC",
    ),
    exec.all<ChapterRow>(
      "SELECT id, subcategoryId, name, sortOrder FROM chapters ORDER BY sortOrder ASC, name ASC",
    ),
  ]);
  return assembleCategoryRecords(catRows, subRows, chapterRows);
}

export async function persistCategoryTaxonomy(
  tx: SqlExecutor,
  records: readonly CategoryRecord[],
): Promise<void> {
  for (const cat of records) {
    for (const sub of cat.subcategories ?? []) {
      await tx.run(SUBCATEGORY_INSERT_SQL, [
        sub.id,
        cat.id,
        sub.name,
        sub.sortOrder ?? 0,
      ]);
      for (const ch of sub.chapters ?? []) {
        if (typeof ch !== "object" || !ch?.id) continue;
        await tx.run(CHAPTER_INSERT_SQL, [
          ch.id,
          sub.id,
          ch.name,
          ch.sortOrder ?? 0,
        ]);
      }
    }
  }
}

/** Replace taxonomy for one category (upsert path). */
export async function replaceCategoryTaxonomy(
  tx: SqlExecutor,
  categoryId: string,
  subcategories: readonly SubcategoryNode[],
): Promise<void> {
  const subs = await tx.all<{ id: string }>(
    "SELECT id FROM subcategories WHERE categoryId = ?",
    [categoryId],
  );
  for (const sub of subs) {
    await tx.run("DELETE FROM chapters WHERE subcategoryId = ?", [sub.id]);
  }
  await tx.run("DELETE FROM subcategories WHERE categoryId = ?", [categoryId]);
  await persistCategoryTaxonomy(tx, [{ id: categoryId, name: "", sortOrder: 0, subcategories: [...subcategories] }]);
}
