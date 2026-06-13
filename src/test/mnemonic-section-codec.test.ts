import { describe, expect, it } from "vitest";
import { htmlToDoc } from "@/lib/editor-v4";
import {
  getMnemonicSectionHtml,
  migrateMnemonicCard,
  normalizeMnemonicCardForWrite,
  normalizeSectionForWrite,
  normalizeSectionOnRead,
  seedSectionDoc,
} from "@/features/mnemonic/mnemonic-storage/mnemonic-section-codec";
import type { MnemonicCard, MnemonicSection } from "@/features/mnemonic/mnemonic-storage/types";

describe("mnemonic-section-codec", () => {
  it("seedSectionDoc prefers contentDoc over legacy HTML", () => {
    const doc = htmlToDoc("<p>canonical</p>");
    const section: MnemonicSection = {
      title: "T",
      content: "<p>legacy</p>",
      contentDoc: doc,
    };
    expect(seedSectionDoc(section)).toBe(doc);
  });

  it("seedSectionDoc synthesizes doc from legacy HTML when contentDoc missing", () => {
    const section = { title: "T", content: "<p>legacy only</p>" } as MnemonicSection;
    const doc = seedSectionDoc(section);
    expect(doc.version).toBe(4);
    expect(getMnemonicSectionHtml({ title: "T", contentDoc: doc })).toContain("legacy only");
  });

  it("normalizeSectionForWrite persists contentDoc only", () => {
    const doc = htmlToDoc("<p>saved</p>");
    const out = normalizeSectionForWrite({ title: "T", contentDoc: doc });
    expect(out).toEqual({ title: "T", contentDoc: doc });
    expect(out.content).toBeUndefined();
  });

  it("normalizeSectionOnRead strips legacy content field", () => {
    const legacy = { title: "T", content: "<p>old</p>" } as MnemonicSection;
    const out = normalizeSectionOnRead(legacy);
    expect(out.contentDoc.version).toBe(4);
    expect(out.content).toBeUndefined();
    expect(getMnemonicSectionHtml(out)).toContain("old");
  });

  it("migrateMnemonicCard flags legacy HTML rows for idle persist", () => {
    const card = {
      id: "m1",
      originalCardId: "c1",
      question: "Q",
      sections: [{ title: "T", content: "<p>legacy</p>" }],
      categoryId: "cat",
      hookType: "ostalo",
      hookMode: "video",
      mnemonicVideo: "",
      acronym: "",
      mnemonicStatus: "new",
      createdAt: 1,
      testCount: 0,
      successCount: 0,
      failCount: 0,
      lastTested: null,
    } as MnemonicCard;
    const { changed, record } = migrateMnemonicCard(card);
    expect(changed).toBe(true);
    expect(record.sections[0].content).toBeUndefined();
    expect(record.sections[0].contentDoc.version).toBe(4);
  });

  it("normalizeMnemonicCardForWrite is idempotent for v4 sections", () => {
    const doc = htmlToDoc("<p>ok</p>");
    const card = {
      id: "m1",
      originalCardId: "c1",
      question: "Q",
      sections: [{ title: "T", contentDoc: doc }],
      categoryId: "cat",
      hookType: "ostalo",
      hookMode: "video",
      mnemonicVideo: "",
      acronym: "",
      mnemonicStatus: "new",
      createdAt: 1,
      testCount: 0,
      successCount: 0,
      failCount: 0,
      lastTested: null,
    } satisfies MnemonicCard;
    const out = normalizeMnemonicCardForWrite(card);
    expect(out.sections[0]).toEqual({ title: "T", contentDoc: doc });
    expect(Object.hasOwn(out.sections[0], "content")).toBe(false);
  });
});
