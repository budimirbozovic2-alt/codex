/**

 * Static scan — core UX flow files must not expose English user-facing strings.

 */

import { describe, it, expect } from "vitest";

import { readFileSync } from "node:fs";

import { resolve } from "node:path";

import {

  CORE_LOCALE_FILES,

  formatLocaleViolations,

  scanLocaleFile,

  scanLocaleSource,

} from "./helpers/locale-scan";



describe("locale core flow", () => {

  it.each(CORE_LOCALE_FILES)("%s has no English user-facing copy", (relPath) => {

    const abs = resolve(__dirname, relPath);

    const violations = scanLocaleFile(abs);

    expect(violations, formatLocaleViolations(relPath, violations)).toEqual([]);

  });



  it("detects template-literal EN copy the old blocklist missed", () => {

    const fixture = readFileSync(

      resolve(__dirname, "fixtures/locale-violation-fixture.ts"),

      "utf8",

    );

    const violations = scanLocaleSource(fixture);

    expect(violations.some((v) => v.match === "Discard changes")).toBe(true);

  });



  it("does not flag Tailwind className lines", () => {

    const sample = `

      <div className="flex items-center text-muted-foreground Dashboard Settings">

        <span className="text-sm">Učitavanje</span>

      </div>

    `;

    expect(scanLocaleSource(sample)).toEqual([]);

  });



  it("passes on clean synthetic fixture", () => {

    const fixture = readFileSync(

      resolve(__dirname, "fixtures/locale-clean-fixture.ts"),

      "utf8",

    );

    expect(scanLocaleSource(fixture)).toEqual([]);

  });

});

