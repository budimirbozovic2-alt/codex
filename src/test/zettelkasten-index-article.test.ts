/**
 * Contract for `ensureIndexArticle`:
 *  1. Idempotent — returns the same row across repeated calls.
 *  2. Atomic under parallel calls — no duplicate Index per subject.
 *  3. Migration: an existing same-titled article is promoted (no new row).
 *  4. Subject scoping — Index in subject A is independent from subject B.
 *  5. Suggested links populate the body; absence yields a minimal onboarding text.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { kbTestDb as db } from "./helpers/kb-test-db";
import { ensureIndexArticle, newArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import { deriveMarkdown } from "@/lib/editor-v4/derived";

const md = (a: { contentDoc?: unknown; content?: string }) =>
  deriveMarkdown(a.contentDoc as never) || a.content || "";

const SUBJECT_A = "subj-A";
const SUBJECT_B = "subj-B";

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
});

describe("ensureIndexArticle", () => {
  it("creates a single Index when none exists, with isIndex=true", async () => {
    const idx = await ensureIndexArticle(SUBJECT_A, "Ustavno pravo", ["Načela", "Organi vlasti"]);
    expect(idx.isIndex).toBe(true);
    expect(idx.title).toBe("Ustavno pravo");
    expect(idx.subjectId).toBe(SUBJECT_A);
    expect(md(idx)).toContain("[[Načela]]");
    expect(md(idx)).toContain("[[Organi vlasti]]");

    const all = await db.knowledgeBaseArticles.where("subjectId").equals(SUBJECT_A).toArray();
    expect(all).toHaveLength(1);
  });

  it("is idempotent across repeated sequential calls", async () => {
    const a = await ensureIndexArticle(SUBJECT_A, "Krivično pravo", []);
    const b = await ensureIndexArticle(SUBJECT_A, "Krivično pravo", []);
    expect(a.id).toBe(b.id);
    const all = await db.knowledgeBaseArticles.where("subjectId").equals(SUBJECT_A).toArray();
    expect(all).toHaveLength(1);
  });

  it("under 10 parallel calls produces exactly one Index row", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => ensureIndexArticle(SUBJECT_A, "Upravno pravo", ["A", "B"])),
    );
    const uniqueIds = new Set(results.map(r => r.id));
    expect(uniqueIds.size).toBe(1);

    const all = await db.knowledgeBaseArticles.where("subjectId").equals(SUBJECT_A).toArray();
    expect(all).toHaveLength(1);
    expect(all[0].isIndex).toBe(true);
  });

  it("promotes an existing same-titled article instead of creating a duplicate", async () => {
    // Pre-existing article (e.g. user created on older app version) with matching name.
    const pre = newArticle(SUBJECT_A, "Radno pravo");
    pre.content = "Postojeći sadržaj";
    await db.knowledgeBaseArticles.put(pre);

    const idx = await ensureIndexArticle(SUBJECT_A, "Radno pravo", ["Ugovor o radu"]);

    expect(idx.id).toBe(pre.id); // same row
    expect(idx.isIndex).toBe(true);
    expect(md(idx)).toBe("Postojeći sadržaj"); // content preserved

    const all = await db.knowledgeBaseArticles.where("subjectId").equals(SUBJECT_A).toArray();
    expect(all).toHaveLength(1);
  });

  it("matches existing article case-insensitively for promotion", async () => {
    const pre = newArticle(SUBJECT_A, "  USTAVNO PRAVO  ");
    await db.knowledgeBaseArticles.put(pre);

    const idx = await ensureIndexArticle(SUBJECT_A, "Ustavno pravo", []);
    expect(idx.id).toBe(pre.id);
    expect(idx.isIndex).toBe(true);
  });

  it("scopes Index per subject — A and B are independent", async () => {
    const a = await ensureIndexArticle(SUBJECT_A, "Pravo A", []);
    const b = await ensureIndexArticle(SUBJECT_B, "Pravo B", []);
    expect(a.id).not.toBe(b.id);
    expect(a.subjectId).toBe(SUBJECT_A);
    expect(b.subjectId).toBe(SUBJECT_B);

    const all = await db.knowledgeBaseArticles.toArray();
    expect(all).toHaveLength(2);
  });

  it("falls back to minimal onboarding text when no suggested links provided", async () => {
    const idx = await ensureIndexArticle(SUBJECT_A, "Predmet bez podkat.", []);
    expect(md(idx)).toContain("Dobrodošli");
    expect(md(idx)).not.toContain("[[");
    expect(md(idx)).toContain("Počnite kucanjem prvog wiki-linka");
  });

  it("caps suggested links at 8 to avoid wall-of-links onboarding", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `Tema ${i}`);
    const idx = await ensureIndexArticle(SUBJECT_A, "Predmet", many);
    const linkMatches = md(idx).match(/\[\[/g) ?? [];
    expect(linkMatches.length).toBeLessThanOrEqual(8);
    expect(md(idx)).toContain("[[Tema 0]]");
    expect(md(idx)).toContain("[[Tema 7]]");
    expect(md(idx)).not.toContain("[[Tema 8]]");
  });
});
