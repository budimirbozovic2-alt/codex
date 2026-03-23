import { describe, it, expect } from "vitest";
import { detectArticles } from "@/lib/auto-split-engine";

const PRAVILNIK_NO_TITLES = `
<p>Član 1</p>
<p>Ovaj pravilnik uređuje postupak i način vršenja nadzora nad primjenom zakona.</p>
<p>Član 2</p>
<p>Inspekcijski nadzor vrši se u skladu sa odredbama ovog pravilnika i drugih propisa.</p>
<p>Član 3</p>
<p>Izrazi koji se koriste u ovom pravilniku imaju sljedeće značenje u skladu sa zakonom.</p>
<p>Član 4</p>
<p>Nadležni organ dužan je da obavijesti stranku o pokretanju postupka inspekcijskog nadzora u roku od tri dana.</p>
<p>Član 5</p>
<p>Kratko.</p>
`;

const ZAKON_WITH_TITLES = `
<p>Pojam podnesaka</p>
<p>Član 59</p>
<p>Podnesci su zahtjevi, prijedlozi, prijave i druga saopštenja kojima se stranke obraćaju organima.</p>
<p>Forma podnesaka</p>
<p>Član 60</p>
<p>Podnesci se podnose pisano ili usmeno na zapisnik.</p>
`;

describe("Auto-Split Engine", () => {
  describe("Mode B: Pravilnik bez naslova", () => {
    it("detektuje sve članove", () => {
      const articles = detectArticles(PRAVILNIK_NO_TITLES);
      expect(articles.length).toBe(5);
      expect(articles.map(a => a.articleNum)).toEqual(["1","2","3","4","5"]);
    });

    it("auto-naslov uzima prvih 6 riječi", () => {
      const articles = detectArticles(PRAVILNIK_NO_TITLES);
      
      // Član 1: "Ovaj pravilnik uređuje postupak i način vršenja..." → first 6 words
      expect(articles[0].autoTitle).toBe(true);
      expect(articles[0].title).toBe("Ovaj pravilnik uređuje postupak i način...");
      
      // Član 2
      expect(articles[1].autoTitle).toBe(true);
      expect(articles[1].title).toBe("Inspekcijski nadzor vrši se u skladu...");
      
      // Član 4: longer sentence
      expect(articles[3].autoTitle).toBe(true);
      expect(articles[3].title).toBe("Nadležni organ dužan je da obavijesti...");
    });

    it("essayName koristi auto-naslov", () => {
      const articles = detectArticles(PRAVILNIK_NO_TITLES);
      expect(articles[0].essayName).toBe("Čl. 1 Ovaj pravilnik uređuje postupak i način...");
    });

    it("kratak tekst ≤6 riječi nema trailing '...'", () => {
      const articles = detectArticles(PRAVILNIK_NO_TITLES);
      // Član 5: "Kratko." — only 1 word
      expect(articles[4].autoTitle).toBe(true);
      expect(articles[4].title).toBe("Kratko.");
      expect(articles[4].title).not.toContain("...");
    });
  });

  describe("Mode A: Zakon sa naslovima", () => {
    it("detektuje naslov iznad člana", () => {
      const articles = detectArticles(ZAKON_WITH_TITLES);
      expect(articles.length).toBe(2);
      expect(articles[0].title).toBe("Pojam podnesaka");
      expect(articles[0].autoTitle).toBe(false);
      expect(articles[1].title).toBe("Forma podnesaka");
      expect(articles[1].autoTitle).toBe(false);
    });

    it("essayName koristi originalni naslov", () => {
      const articles = detectArticles(ZAKON_WITH_TITLES);
      expect(articles[0].essayName).toBe("Čl. 59 Pojam podnesaka");
    });
  });

  describe("Content extraction", () => {
    it("plainSnippet sadrži tekst člana", () => {
      const articles = detectArticles(PRAVILNIK_NO_TITLES);
      expect(articles[0].plainSnippet).toContain("Član 1");
      expect(articles[0].plainSnippet).toContain("postupak i način vršenja nadzora");
    });

    it("contentHtml sadrži HTML", () => {
      const articles = detectArticles(PRAVILNIK_NO_TITLES);
      expect(articles[0].contentHtml).toContain("<p>");
    });
  });
});
