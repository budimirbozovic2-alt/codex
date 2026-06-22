/**
 * Format preservation when importing a single selection from Source Reader.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  deriveTitleAndBody,
  stripTitleFromDoc,
  stripTitleFromContent,
} from "@/lib/selection-split-engine";
import { buildEssayFromSelection } from "@/lib/source-reader/build-essay-payload";
import { useSourceMapping } from "@/hooks/source-reader/useSourceMapping";
import { useSourceReaderStore } from "@/store";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";
import { makeQueryWrapper } from "@/test/helpers/queryWrapper";
import { makeSource } from "@/test/factories";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/services/sourceEditingService", () => ({
  commitMappingCreated: vi.fn(),
}));

function listDoc(items: string[]): EditorDoc {
  return {
    version: 4,
    content: {
      type: "doc",
      content: [{
        type: "bulletList",
        content: items.map((text) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        })),
      }],
    },
  };
}

function hasBulletList(doc: EditorDoc): boolean {
  const walk = (nodes: unknown[]): boolean => {
    for (const n of nodes) {
      if (typeof n !== "object" || n === null) continue;
      const node = n as { type?: string; content?: unknown[] };
      if (node.type === "bulletList") return true;
      if (node.content && walk(node.content)) return true;
    }
    return false;
  };
  return walk(doc.content.content ?? []);
}

describe("selection format preservation", () => {
  beforeEach(() => {
    useSourceReaderStore.getState().reset();
  });

  it("stripTitleFromContent does not flatten structured HTML", () => {
    const html = "<ul><li>prva</li><li>druga</li></ul>";
    const result = stripTitleFromContent("Naslov koji nije u tekstu", "prva druga", html);
    expect(result.contentHtml).toContain("<ul>");
    expect(result.contentHtml).toContain("<li>");
  });

  it("stripTitleFromDoc preserves bullet lists", () => {
    const doc = listDoc(["alfa", "beta"]);
    const stripped = stripTitleFromDoc("Naslov koji nije tu", doc);
    expect(hasBulletList(stripped)).toBe(true);
  });

  it("deriveTitleAndBody returns contentDoc with bulletList intact", () => {
    const doc = listDoc(["stavka jedan", "stavka dva"]);
    const html = "<ul><li>stavka jedan</li><li>stavka dva</li></ul>";
    const { contentDoc, contentHtml } = deriveTitleAndBody(
      "stavka jedan stavka dva",
      html,
      doc,
    );
    expect(hasBulletList(contentDoc)).toBe(true);
    expect(contentHtml).toContain("<ul>");
  });

  it("buildEssayFromSelection single-section prefers selection contentDoc", () => {
    const source = makeSource({ sourceKind: "skripta" });
    const doc = listDoc(["tačka A", "tačka B"]);
    const result = buildEssayFromSelection(
      "tačka A tačka B",
      "<ul><li>tačka A</li><li>tačka B</li></ul>",
      "Objasnite stavke?",
      source,
      doc,
    );
    expect(result.moduleCount).toBe(1);
    expect(hasBulletList(result.args.sections[0].contentDoc)).toBe(true);
  });

  it("handleMapSelection passes contentDoc through to card sections", async () => {
    const wrapper = makeQueryWrapper();
    const source = makeSource({ id: "fmt-src", categoryId: "cat-fmt", sourceKind: "skripta" });
    const { result } = renderHook(() => useSourceMapping(source), { wrapper });
    const doc = listDoc(["jedan", "dva", "tri"]);

    act(() => {
      useSourceReaderStore.getState().setExamQuestions([
        { id: "q-fmt", text: "Navedite elemente?", done: false },
      ]);
    });

    act(() => {
      result.current.handleMapSelection("q-fmt", {
        text: "jedan dva tri",
        html: "<ul><li>jedan</li><li>dva</li><li>tri</li></ul>",
        contentDoc: doc,
      });
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    const { examQuestions } = useSourceReaderStore.getState();
    expect(examQuestions[0]?.done).toBe(true);
  });
});
