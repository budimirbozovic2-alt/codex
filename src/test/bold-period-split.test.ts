import { describe, expect, it } from "vitest";
import {
  countBoldPeriodModuleMarkers,
  extractBoldPeriodModuleStart,
  isBoldPeriodTitleText,
  suggestBoldPeriodSectionSplit,
} from "@/lib/docx/bold-period-split";
import { splitIntoCards } from "@/lib/docx/splitIntoSections";

describe("bold-period split", () => {
  it("recognizes short bold titles ending with a period", () => {
    expect(isBoldPeriodTitleText("Obligacioni odnos.")).toBe(true);
    expect(isBoldPeriodTitleText("Predmet.")).toBe(true);
    expect(
      isBoldPeriodTitleText(
        "Ovo je preduga rečenica koja definitivno nije naslov modula jer ima previše riječi u sebi.",
      ),
    ).toBe(false);
    expect(isBoldPeriodTitleText("Bez tačke")).toBe(false);
  });

  it("extracts title-only and inline-body module starts", () => {
    const doc = new DOMParser().parseFromString(
      `<p><strong>Modul A.</strong></p>`,
      "text/html",
    );
    expect(extractBoldPeriodModuleStart(doc.body.firstElementChild!)).toEqual({
      title: "Modul A",
      bodyHtml: "",
    });

    const inline = new DOMParser().parseFromString(
      `<p><strong>Modul B.</strong> Tekst odmah iza naslova.</p>`,
      "text/html",
    );
    const extracted = extractBoldPeriodModuleStart(inline.body.firstElementChild!);
    expect(extracted?.title).toBe("Modul B");
    expect(extracted?.bodyHtml).toContain("Tekst odmah iza naslova.");
  });

  it("counts markers and suggests auto split from two or more modules", () => {
    const html = `
      <p><strong>Prvi.</strong></p>
      <p>Sadržaj.</p>
      <p><strong>Drugi.</strong> Inline.</p>
    `;
    expect(countBoldPeriodModuleMarkers(html)).toBe(2);
    expect(suggestBoldPeriodSectionSplit(html)).toBe(true);
    expect(suggestBoldPeriodSectionSplit(`<p><strong>Samo jedan.</strong></p>`)).toBe(false);
  });

  it("splits essay cards into sections by bold-period markers", () => {
    const html = `
      <h1>Pitanje 1</h1>
      <p><strong>Modul A.</strong></p>
      <p>Sadržaj modula A.</p>
      <p><strong>Modul B.</strong> Inline sadržaj modula B.</p>
      <p>Još teksta za B.</p>
    `;

    const cards = splitIntoCards(
      html,
      { mode: "heading", heading: "h1", delimiter: "" },
      { mode: "bold-period", heading: "h2", delimiter: "" },
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.question).toBe("Pitanje 1");
    expect(cards[0]?.sections.map((s) => s.title)).toEqual(["Modul A", "Modul B"]);
  });
});
