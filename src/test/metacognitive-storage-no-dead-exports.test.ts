import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Static grep/AST guard: svaki `export` iz `src/domains/metacognition/metacognitive-storage.ts`
 * mora imati BAR JEDNOG potrošača izvan samog modula.
 *
 * Cilj: rano uočiti mrtve reference (npr. legacy API-je koji su preživjeli
 * uklanjanje "Procjena sigurnosti"), prije nego se pojave kao runtime mistery.
 *
 * Kombinujemo s ESLint pravilima u `eslint.config.js` (no-unused-vars,
 * no-unreachable) koja love unutrašnji dead code — ovaj test lovi
 * EXTERNALNO neiskorištene exporte koje TS/ESLint ne mogu vidjeti.
 */

const MODULE_PATH = "src/domains/metacognition/metacognitive-storage.ts";
const SRC_ROOT = resolve(__dirname, "..");

// Eksplicitno dozvoljeni "rezervni" exporti — zadržani kao stabilan public API
// iako trenutno nemaju aktivnog pozivaoca. Mora biti opravdano u JSDoc-u modula.
const RESERVED_EXPORTS = new Set<string>([
  // `addCalibrationEntry` zadržan za buduće surface-e (vidi JSDoc u modulu).
  "addCalibrationEntry",
]);

function extractExportNames(source: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:interface|type|enum|class)\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) names.add(m[1]);
  }
  // export { a, b as c }
  const reBlock = /export\s*\{([^}]+)\}/g;
  let mb: RegExpExecArray | null;
  while ((mb = reBlock.exec(source)) !== null) {
    mb[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((piece) => {
        const alias = piece.split(/\s+as\s+/i).pop()!.trim();
        if (alias) names.add(alias);
      });
  }
  return [...names];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("metacognitive-storage: no dead exports", () => {
  const moduleSource = readFileSync(resolve(SRC_ROOT, "..", MODULE_PATH), "utf8");
  const exports = extractExportNames(moduleSource);

  const allFiles = walk(SRC_ROOT).filter(
    (f) => !f.endsWith("metacognitive-storage.ts") && !f.includes("/test/metacognitive-storage-no-dead-exports"),
  );
  const corpus = allFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  it("ekstraktuje barem jedan export iz modula (sanity)", () => {
    expect(exports.length).toBeGreaterThan(0);
  });

  for (const name of exports) {
    it(`export "${name}" ima konsumenta ili je eksplicitno rezervisan`, () => {
      if (RESERVED_EXPORTS.has(name)) return;
      const re = new RegExp(`\\b${name}\\b`);
      expect(re.test(corpus), `Export "${name}" iz ${MODULE_PATH} nema konsumenta. Ukloni ga ili dodaj u RESERVED_EXPORTS uz JSDoc obrazloženje.`).toBe(true);
    });
  }
});
