import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  headingIdForIndex,
  resolveHeadingElement,
  syncHeadingDomIds,
} from "@/lib/source-reader/heading-navigation";

describe("heading-navigation", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    root.innerHTML = `
      <h2>Prvi</h2>
      <p>tekst</p>
      <h3>Drugi</h3>
      <h1>Treći</h1>
    `;
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("syncHeadingDomIds assigns sequential src-heading ids", () => {
    syncHeadingDomIds(root);
    const headings = root.querySelectorAll("h1, h2, h3, h4");
    expect(headings[0].id).toBe(headingIdForIndex(0));
    expect(headings[1].id).toBe(headingIdForIndex(1));
    expect(headings[2].id).toBe(headingIdForIndex(2));
  });

  it("resolveHeadingElement finds heading by index id", () => {
    syncHeadingDomIds(root);
    const el = resolveHeadingElement(root, headingIdForIndex(1));
    expect(el?.textContent).toBe("Drugi");
  });

  it("resolveHeadingElement falls back to index when id attribute is missing", () => {
    const el = resolveHeadingElement(root, headingIdForIndex(2));
    expect(el?.textContent).toBe("Treći");
  });
});
