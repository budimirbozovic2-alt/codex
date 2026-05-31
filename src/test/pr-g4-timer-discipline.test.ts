// PR-G4 — Timer discipline regression guard.
//
// Verifies that no `src/**` file outside the sanctioned G7 allow-list
// (kept in sync with `eslint.config.js`) introduces a raw `setTimeout` /
// `setInterval` / `window.setTimeout` / `window.setInterval` call. ESLint
// already enforces this at lint-time; this static test is a belt-and-
// suspenders guard that runs in CI even if a developer disables the rule
// or adds a misplaced override block.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ── Allow-list (mirrors eslint.config.js G7 override) ────────────────────
const ALLOWLIST = new Set<string>([
  "src/lib/persist-queue.ts",
  "src/lib/event-bus.ts",
  "src/lib/zip-service.ts",
  "src/lib/electron-integration.ts",
  "src/lib/backup/yield-ui.ts",
  "src/lib/query/bridges.ts",
  "src/lib/repositories/reviewLogRepository.ts",
  "src/main.tsx",
  "src/hooks/useCardBootstrap.ts",
  "src/hooks/useNotificationScheduler.ts",
  "src/hooks/speed-reader/useSpeedReaderEngine.ts",
  "src/features/mnemonic/hooks/useTestEngine.ts",
  "src/features/docx-importer/docx-parser.ts",
  "src/store/usePomodoroStore.ts",
]);

const ALLOWLIST_DIR_PREFIXES = [
  "src/lib/scheduler/",
  "src/test/",
];

const SRC_ROOT = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function toPosix(rel: string): string {
  return rel.split(sep).join("/");
}

function isWhitelisted(relPath: string): boolean {
  if (ALLOWLIST.has(relPath)) return true;
  for (const prefix of ALLOWLIST_DIR_PREFIXES) {
    if (relPath.startsWith(prefix)) return true;
  }
  return false;
}

// Strip line comments and block comments before grepping. Crude but
// sufficient: the few false-positive shapes that survive (e.g. raw
// `setTimeout(` inside a string literal) are exceedingly rare in this
// codebase and would still warrant a review.
function stripCommentsAndStrings(src: string): string {
  // Remove /* ... */ block comments (non-greedy, multi-line).
  let s = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove // line comments.
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1: string) => p1);
  return s;
}

// Match `setTimeout(` / `setInterval(` ONLY when used as a free call or via
// `window.`. A leading `.` (e.g. `taskScheduler.setTimeout(`) is excluded
// via negative look-behind — those are exactly the calls we WANT.
const RAW_TIMER_RE = /(?<![.\w])(?:window\s*\.\s*)?(setTimeout|setInterval)\s*\(/;

describe("PR-G4 timer discipline", () => {
  it("no src/** file outside the G7 allow-list contains raw setTimeout/setInterval", () => {
    const files = walk(SRC_ROOT);
    const offenders: Array<{ file: string; lines: number[] }> = [];

    for (const full of files) {
      const rel = toPosix(relative(process.cwd(), full));
      if (isWhitelisted(rel)) continue;

      const raw = readFileSync(full, "utf8");
      const cleaned = stripCommentsAndStrings(raw);
      if (!RAW_TIMER_RE.test(cleaned)) continue;

      const hits: number[] = [];
      const cleanedLines = cleaned.split("\n");
      for (let i = 0; i < cleanedLines.length; i++) {
        if (RAW_TIMER_RE.test(cleanedLines[i])) hits.push(i + 1);
      }
      if (hits.length > 0) offenders.push({ file: rel, lines: hits });
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  • ${o.file}:${o.lines.join(",")}`)
        .join("\n");
      throw new Error(
        `Raw setTimeout/setInterval found outside G7 allow-list:\n${msg}\n\n` +
          `Migrate to taskScheduler from "@/lib/scheduler", or — if this file truly needs a raw timer ` +
          `(tight engine, pre-bootstrap infra, IPC race wrapper) — add it to BOTH the G7 override block ` +
          `in eslint.config.js AND the ALLOWLIST in this test, with a justification comment.`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("allow-list entries actually exist on disk (no rot)", () => {
    const missing: string[] = [];
    for (const rel of ALLOWLIST) {
      try {
        statSync(join(process.cwd(), rel));
      } catch {
        missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });
});
