/**
 * Test-only Dexie-shaped façade over the SQLite-primary knowledge-base repo.
 *
 * The production storage layer (`zettelkasten-storage`) now reads/writes via
 * `@/lib/db/queries/knowledge-base`, which the global vitest setup mocks
 * onto the in-memory `sqlite-harness`. This shim lets the existing
 * `db.knowledgeBaseArticles.{put,bulkPut,get,delete,clear,where,toArray}`
 * call patterns in tests keep working without rewriting every assertion.
 *
 * Only the subset of Dexie operations actually used by zettelkasten/
 * category-deletion tests is implemented.
 */
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import {
  putArticle,
  bulkPutArticles,
  getArticle,
  deleteArticle,
  listAllArticles,
  listArticlesBySubject,
} from "@/lib/db/queries/knowledge-base";
import { resetTestSqliteState } from "@/test/sqlite-harness";

interface WhereChain {
  equals(value: string): {
    count(): Promise<number>;
    toArray(): Promise<KnowledgeBaseArticle[]>;
    each(fn: (a: KnowledgeBaseArticle) => void): Promise<void>;
  };
}

export const kbTestDb = {
  knowledgeBaseArticles: {
    async put(a: KnowledgeBaseArticle): Promise<void> {
      await putArticle(a);
    },
    async bulkPut(rows: readonly KnowledgeBaseArticle[]): Promise<void> {
      await bulkPutArticles(rows);
    },
    async get(id: string): Promise<KnowledgeBaseArticle | undefined> {
      return getArticle(id);
    },
    async delete(id: string): Promise<void> {
      await deleteArticle(id);
    },
    async clear(): Promise<void> {
      resetTestSqliteState();
    },
    async toArray(): Promise<KnowledgeBaseArticle[]> {
      return listAllArticles();
    },
    where(col: string): WhereChain {
      if (col !== "subjectId") {
        throw new Error(`[kb-test-db] only where("subjectId") is supported, got ${col}`);
      }
      return {
        equals(value: string) {
          return {
            async count(): Promise<number> {
              return (await listArticlesBySubject(value)).length;
            },
            async toArray(): Promise<KnowledgeBaseArticle[]> {
              return listArticlesBySubject(value);
            },
            async each(fn: (a: KnowledgeBaseArticle) => void): Promise<void> {
              for (const a of await listArticlesBySubject(value)) fn(a);
            },
          };
        },
      };
    },
  },
};
