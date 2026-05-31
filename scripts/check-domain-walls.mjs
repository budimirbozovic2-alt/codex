#!/usr/bin/env node
/**
 * Domain wall guard (CI).
 *
 * Mirrors ESLint walls W11–W14 with a fast, dependency-free grep so that
 * deep imports into `src/domains/*` cannot slip into the repo even if
 * someone disables ESLint locally, edits `eslint.config.js`, or relies on
 * a stale lint cache.
 *
 * Rules enforced:
 *   • W11/W12/W13: no `@/domains/<domain>/<deep>` imports OUTSIDE
 *     `src/domains/<same-domain>/**`, `src/test/**`, or sanctioned shims.
 *   • W14: no cross-domain deep imports between sibling domains.
 *
 * Fail-fast: exits non-zero with a grouped report. Wire into CI before
 * `eslint` to keep error output tight when the walls are the cause.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

const DOMAINS = ["cards", "planner", "mnemonic"];

// Files that may legitimately deep-import (matches eslint.config.js ignores).
const SHIM_ALLOWLIST = new Set([
  "src/lib/planner-storage.ts",
  "src/lib/analytics/blind-spots.ts",
]);

const DEEP_IMPORT_RE =
  /from\s+["']@\/domains\/(cards|planner|mnemonic)\/([^"']+)["']/g;

/** @type {{file:string,line:number,domain:string,rest:string,reason:string}[]} */
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      scan(full);
    }
  }
}

function scan(absPath) {
  const rel = relative(ROOT, absPath).split(sep).join("/");
  if (rel.startsWith("src/test/")) return;
  if (SHIM_ALLOWLIST.has(rel)) return;

  const text = readFileSync(absPath, "utf8");
  let m;
  DEEP_IMPORT_RE.lastIndex = 0;
  while ((m = DEEP_IMPORT_RE.exec(text)) !== null) {
    const [, domain, rest] = m;
    const ownDomainPrefix = `src/domains/${domain}/`;
    const inOwnDomain = rel.startsWith(ownDomainPrefix);
    const inAnyDomain = rel.startsWith("src/domains/");

    if (inOwnDomain) continue; // intra-domain composition is fine

    const wallId = inAnyDomain ? "W14" : `W1${1 + DOMAINS.indexOf(domain)}`;
    const reason = inAnyDomain
      ? `Cross-domain deep import (W14). Use \`@/domains/${domain}\` barrel.`
      : `Deep import into '${domain}' domain (${wallId}). Use \`@/domains/${domain}\` barrel.`;

    const line = text.slice(0, m.index).split("\n").length;
    violations.push({ file: rel, line, domain, rest, reason });
  }
}

walk(SRC);

if (violations.length === 0) {
  console.log("✓ Domain walls clean (W11–W14). 0 deep imports outside barrels.");
  process.exit(0);
}

console.error(`\n✗ Domain wall violations: ${violations.length}\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    @/domains/${v.domain}/${v.rest}`);
  console.error(`    → ${v.reason}\n`);
}
console.error("Fix: import from the domain barrel `@/domains/<name>` only.");
process.exit(1);
