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
import type { MnemonicCard } from "@/features/mnemonic/mnemonic-storage/types";

function legacyMnemonicPayload(): MnemonicCard {
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
  } as MnemonicCard;
}

beforeEach(() => {
  resetTestSqliteState();
});

describe("mnemonics repo codec", () => {
  it("decode synthesizes contentDoc from legacy HTML payload", async () => {
    await bulkPutMnemonics([legacyMnemonicPayload()]);
    const loaded = (await getMnemonic("mn-legacy"))!;
    expect(loaded.sections[0].contentDoc.version).toBe(4);
    expect(loaded.sections[0].content).toBeUndefined();
  });

  it("write path persists contentDoc only (strips legacy content)", async () => {
    await bulkPutMnemonics([legacyMnemonicPayload()]);
    const rows = await listAllMnemonics();
    expect(rows).toHaveLength(1);
    expect(rows[0].sections[0].content).toBeUndefined();
    expect(rows[0].sections[0].contentDoc.version).toBe(4);
  });
});
