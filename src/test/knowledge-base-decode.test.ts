/**
 * KB repo decode backfill — legacy markdown-only payloads gain contentDoc on read.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { kbTestDb as db } from "./helpers/kb-test-db";
import { kbArticleFromMarkdown, legacyKbArticlePayload } from "./helpers/kb-article-fixture";
import { getArticle } from "@/lib/db/queries/knowledge-base";
import { newArticle, saveArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { deriveMarkdown } from "@/lib/editor-v4/derived";

const SUBJECT = "subject-kb-decode";

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
});

describe("knowledge-base decode backfill", () => {
  it("migrateArticle on read synthesizes contentDoc from legacy markdown payload", async () => {
    const article = legacyKbArticlePayload(
      SUBJECT,
      "Legacy",
      "# Naslov\n\nTekst sa [[Drugi članak]] linkom.",
    );
    await saveArticle(article);

    const loaded = (await getArticle(article.id))!;
    expect(loaded.contentDoc.version).toBe(4);
    expect(loaded.contentDoc.content?.type).toBe("doc");
    expect(deriveMarkdown(loaded.contentDoc)).toContain("Drugi članak");
  });

  it("v4 contentDoc rows are returned unchanged (idempotent decode)", async () => {
    const article = newArticle(SUBJECT, "Modern");
    await saveArticle(article);

    const loaded = (await getArticle(article.id))!;
    expect(loaded.contentDoc).toEqual(article.contentDoc);
  });
});
