// PR-G7 — Tooling guardrails regression test (RC-7).
//
// Belt-and-suspenders static guard ensuring the strict TypeScript + ESLint
// posture cannot silently regress between releases. Each `expect` here is
// a single previously-fixed root cause:
//
//   • RC-7a: vitest leaks — mocks bleeding across tests masking regressions.
//     Guard: vitest.config.ts must keep `clearMocks` + `restoreMocks` on.
//   • RC-7b: type-erosion — `any` creeping back in app code.
//     Guard: eslint.config.js must keep `no-explicit-any` = "error" globally.
//   • RC-7c: dead-code drift — unused imports/vars accumulating.
//     Guard: eslint.config.js must keep `no-unused-vars` = "error" globally.
//   • RC-7d: null-safety — `strictNullChecks` must remain enabled.
//   • RC-7e: dangerouslySetInnerHTML — W7 XSS guard still wired.
//
// All checks are file-content static checks (cheap, deterministic, run in
// CI). They intentionally do NOT spawn ESLint/tsc; the dedicated CI job
// covers full lint+typecheck. This file is purely a regression net so a
// well-meaning developer cannot accidentally downgrade severity.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

describe("PR-G7 — Tooling guardrails", () => {
  it("RC-7a: vitest enforces mock isolation between tests", () => {
    const cfg = read("vitest.config.ts");
    // clearMocks: clears call history; restoreMocks: restores original impls.
    // Both are required so a leaked vi.spyOn() from one test cannot mask a
    // regression in the next.
    expect(/clearMocks:\s*true/.test(cfg)).toBe(true);
    expect(/restoreMocks:\s*true/.test(cfg)).toBe(true);
  });

  it("RC-7b: ESLint forbids `any` as an error (not warning)", () => {
    const cfg = read("eslint.config.js");
    // Match the global rule line: must be "error", not "warn" / "off".
    expect(/"@typescript-eslint\/no-explicit-any":\s*"error"/.test(cfg)).toBe(true);
    // Negative guard — no global downgrade slipped in.
    expect(/"@typescript-eslint\/no-explicit-any":\s*"warn"/.test(cfg)).toBe(false);
  });

  it("RC-7c: ESLint forbids unused vars/imports/args as an error", () => {
    const cfg = read("eslint.config.js");
    // Global rule registered as an array tuple starting with "error".
    expect(/"@typescript-eslint\/no-unused-vars":\s*\[\s*"error"/.test(cfg)).toBe(true);
    expect(/"@typescript-eslint\/no-unused-vars":\s*\[\s*"warn"/.test(cfg)).toBe(false);
  });

  it("RC-7d: TypeScript keeps strict + strictNullChecks on (app + test)", () => {
    for (const path of ["tsconfig.app.json", "tsconfig.test.json", "tsconfig.json"]) {
      const cfg = JSON.parse(read(path));
      const co = cfg.compilerOptions ?? {};
      expect(co.strict, `${path} strict`).toBe(true);
      expect(co.strictNullChecks, `${path} strictNullChecks`).toBe(true);
    }
  });

  it("RC-7e: W7 dangerouslySetInnerHTML guard is still wired in ESLint", () => {
    const cfg = read("eslint.config.js");
    // The W7 block forbids JSX attribute + createElement-prop variants.
    expect(/JSXAttribute\[name\.name='dangerouslySetInnerHTML'\]/.test(cfg)).toBe(true);
    expect(/W7_DANGEROUS_HTML/.test(cfg)).toBe(true);
  });

  it("RC-7f: G7 raw-timer ban is still present in shared base", () => {
    const cfg = read("eslint.config.js");
    // BASE_RESTRICTED_SYNTAX must keep both selectors so any new override
    // block that spreads BASE retains the guard.
    expect(/callee\.name='setTimeout'/.test(cfg)).toBe(true);
    expect(/callee\.name='setInterval'/.test(cfg)).toBe(true);
    expect(/BASE_RESTRICTED_SYNTAX/.test(cfg)).toBe(true);
  });
});
