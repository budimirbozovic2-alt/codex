import { describe, it, expect } from "vitest";
import {
  normalizeQuestionTitle,
  normalizeWizardEdits,
  sourceKindToCardSourceType,
} from "@/lib/source-reader/prepare-wizard-modules";

describe("prepare-wizard-modules", () => {
  it("strips <p> wrappers from question titles", () => {
    expect(normalizeQuestionTitle("<p>čl. 59 Pojam</p>")).toBe("čl. 59 Pojam");
  });

  it("normalizes wizard edit questions on commit", () => {
    const out = normalizeWizardEdits([
      { question: "<p>Modul A</p>", tags: [], skipped: false },
    ]);
    expect(out[0].question).toBe("Modul A");
  });

  it("maps sourceKind to card sourceType", () => {
    expect(sourceKindToCardSourceType("propis")).toBe("zakon");
    expect(sourceKindToCardSourceType("skripta")).toBe("skripta");
    expect(sourceKindToCardSourceType(undefined)).toBeUndefined();
  });
});
