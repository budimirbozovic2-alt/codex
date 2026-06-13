/**
 * Mnemonics repo decode/write — legacy HTML payloads → contentDoc SSOT.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  bulkPutMnemonics,
  getMnemonic,
  listAllMnemonics,
} from "@/lib/db/queries/mnemonics";
import { resetTestSqliteState } from "@/test/sqlite-harness";

function legacyMnemonicPayload() {
  return {
    id: "mn-legacy",
    originalCardId: "card-1",
    question: "Pitanje",
    sections: [{ title: "Isječak", content: "<p>legacy html</p>" }],
    categoryId: "subject-1",
    hookType: "ostalo",
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "new",
    createdAt: 100,
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

beforeEach(() => {
  resetTestSqliteState();
});

describe("mnemonics repo codec", () => {
  it("decode synthesizes contentDoc from legacy HTML payload at import boundary", async () => {
    await bulkPutMnemonics([legacyMnemonicPayload() as never]);
    const loaded = (await getMnemonic("mn-legacy"))!;
    expect(loaded.sections[0].contentDoc.version).toBe(4);
    expect(Object.hasOwn(loaded.sections[0], "content")).toBe(false);
  });

  it("write path persists contentDoc only (strips legacy content)", async () => {
    await bulkPutMnemonics([legacyMnemonicPayload() as never]);
    const rows = await listAllMnemonics();
    expect(rows).toHaveLength(1);
    expect(Object.hasOwn(rows[0].sections[0], "content")).toBe(false);
    expect(rows[0].sections[0].contentDoc.version).toBe(4);
  });
});
