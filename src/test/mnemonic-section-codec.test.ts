import { describe, expect, it } from "vitest";
import { htmlToDoc } from "@/lib/editor-v4";
import {
  decodeLegacySection,
  migrateMnemonicCard,
  normalizeMnemonicCardForWrite,
  normalizeMnemonicCardOnImport,
  normalizeSectionForWrite,
  normalizeSectionOnRead,
} from "@/domains/mnemonic";
import type { MnemonicCard, MnemonicSection } from "@/domains/mnemonic";

describe("mnemonic-section-codec", () => {
  it("decodeLegacySection prefers contentDoc over legacy HTML", () => {
    const doc = htmlToDoc("<p>canonical</p>");
    const section = decodeLegacySection({
      title: "T",
      content: "<p>legacy</p>",
      contentDoc: doc,
    });
    expect(section).toEqual({ title: "T", contentDoc: doc });
  });

  it("decodeLegacySection synthesizes doc from legacy HTML at import boundary", () => {
    const section = decodeLegacySection({ title: "T", content: "<p>legacy only</p>" });
    expect(section.contentDoc.version).toBe(4);
    expect(Object.hasOwn(section, "content")).toBe(false);
  });

  it("normalizeSectionForWrite persists contentDoc only", () => {
    const doc = htmlToDoc("<p>saved</p>");
    const out = normalizeSectionForWrite({ title: "T", contentDoc: doc });
    expect(out).toEqual({ title: "T", contentDoc: doc });
    expect(Object.hasOwn(out, "content")).toBe(false);
  });

  it("normalizeSectionOnRead ensures valid contentDoc", () => {
    const doc = htmlToDoc("<p>ok</p>");
    const out = normalizeSectionOnRead({ title: "T", contentDoc: doc });
    expect(out).toEqual({ title: "T", contentDoc: doc });
  });

  it("normalizeMnemonicCardOnImport converts legacy section payloads", () => {
    const record = normalizeMnemonicCardOnImport({
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
    });
    expect(record.sections[0].contentDoc.version).toBe(4);
    expect(Object.hasOwn(record.sections[0], "content")).toBe(false);
  });

  it("migrateMnemonicCard flags invalid contentDoc rows for idle persist", () => {
    const card = {
      id: "m1",
      originalCardId: "c1",
      question: "Q",
      sections: [{ title: "T", contentDoc: { version: 3, content: { type: "doc", content: [] } } }],
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
    } as unknown as MnemonicCard;
    const { changed, record } = migrateMnemonicCard(card);
    expect(changed).toBe(true);
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
