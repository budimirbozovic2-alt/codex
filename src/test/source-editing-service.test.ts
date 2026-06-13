import { describe, it, expect } from "vitest";
import { buildAutoFormatSource } from "@/lib/services/sourceEditingService";
import { docToHtml } from "@/lib/editor-v4";
import { makeSource } from "./factories";

describe("buildAutoFormatSource", () => {
  it("updates contentDoc via htmlToDoc + buildSourceFromDoc", () => {
    const source = makeSource({
      html: "<p>Naziv članka</p><p>Član 1</p><p>Sadržaj člana.</p>",
    });
    const beforeHtml = docToHtml(source.contentDoc);

    const { count, source: formatted } = buildAutoFormatSource(source);
    expect(count).toBe(1);
    expect(formatted).not.toBeNull();

    const afterHtml = docToHtml(formatted!.contentDoc);
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("<strong>");
    expect(formatted!.contentDoc.version).toBe(4);
  });

  it("returns null source when no Član patterns match", () => {
    const source = makeSource({ html: "<p>Samo običan paragraf bez članova.</p>" });
    const result = buildAutoFormatSource(source);
    expect(result.count).toBe(0);
    expect(result.source).toBeNull();
  });
});
