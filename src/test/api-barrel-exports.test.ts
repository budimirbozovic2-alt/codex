/**
 * TD-7 — Static audit: every named `@/lib/{module}` import must resolve to
 * an export in that module's public `index.ts` barrel.
 *
 * Catches regressions like SourceContent importing `getDraft` before the
 * drafts barrel re-exported it (runtime `undefined`).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SRC_ROOT = resolve(__dirname, "..");
const LIB_ROOT = join(SRC_ROOT, "lib");

const BARREL_IMPORT_RE =
  /import\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+["']@\/lib\/([^/"']+)["']/g;

function listBarrelModules(): string[] {
  return readdirSync(LIB_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(LIB_ROOT, d.name, "index.ts")))
    .map((d) => d.name);
}

function resolveModuleFile(baseDir: string, rel: string): string | null {
  const candidates = [
    join(baseDir, `${rel}.ts`),
    join(baseDir, `${rel}.tsx`),
    join(baseDir, rel, "index.ts"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function parseNamedSpecifiers(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const withoutType = part.replace(/^type\s+/, "").trim();
      const asSplit = withoutType.split(/\s+as\s+/);
      return asSplit[asSplit.length - 1]!.trim();
    })
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function collectStandaloneExports(filePath: string): Set<string> {
  const src = readFileSync(filePath, "utf8");
  const names = new Set<string>();

  for (const match of src.matchAll(
    /export\s+(?:async\s+)?(?:type\s+)?(?:interface|enum|class|function|const)\s+(\w+)/g,
  )) {
    names.add(match[1]!);
  }
  for (const match of src.matchAll(/export\s+type\s+(\w+)/g)) {
    names.add(match[1]!);
  }

  return names;
}

function collectBarrelExports(indexPath: string, visited = new Set<string>()): Set<string> {
  if (visited.has(indexPath)) return new Set();
  visited.add(indexPath);

  const src = readFileSync(indexPath, "utf8");
  const names = new Set<string>();
  const baseDir = dirname(indexPath);

  for (const match of src.matchAll(/export\s+(?:type\s+)?\{([^{}]*)\}/g)) {
    for (const name of parseNamedSpecifiers(match[1]!)) {
      names.add(name);
    }
  }

  for (const match of src.matchAll(/export\s+\*\s+from\s+["'](\.[^"']+)["']/g)) {
    const target = resolveModuleFile(baseDir, match[1]!);
    if (!target) continue;
    for (const name of collectStandaloneExports(target)) names.add(name);
    if (target.endsWith("index.ts")) {
      for (const name of collectBarrelExports(target, visited)) names.add(name);
    }
  }

  return names;
}

/** External callers that must respect `@/lib/{module}` barrel contracts. */
const CONSUMER_ROOTS = [
  join(SRC_ROOT, "components"),
  join(SRC_ROOT, "hooks"),
  join(SRC_ROOT, "views"),
  join(SRC_ROOT, "pages"),
  join(SRC_ROOT, "features"),
  join(SRC_ROOT, "store"),
  join(SRC_ROOT, "domains"),
];

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function collectConsumerFiles(): string[] {
  return CONSUMER_ROOTS.flatMap((root) => walkSourceFiles(root));
}
function collectBarrelImports(): Map<string, Set<{ file: string; symbols: string[] }>> {
  const byModule = new Map<string, Set<{ file: string; symbols: string[] }>>();

  for (const file of collectConsumerFiles()) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(BARREL_IMPORT_RE)) {
      const moduleName = match[2]!;
      const symbols = parseNamedSpecifiers(match[1]!);
      if (symbols.length === 0) continue;

      const relFile = file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/");
      const bucket = byModule.get(moduleName) ?? new Set();
      bucket.add({ file: relFile, symbols });
      byModule.set(moduleName, bucket);
    }
  }

  return byModule;
}

describe("API barrel exports (@/lib/*)", () => {
  it("every named @/lib/{module} import is exported from that module index.ts", () => {
    const barrels = new Set(listBarrelModules());
    const imports = collectBarrelImports();
    const violations: string[] = [];

    for (const [moduleName, usages] of imports) {
      if (!barrels.has(moduleName)) continue;

      const indexPath = join(LIB_ROOT, moduleName, "index.ts");
      const exported = collectBarrelExports(indexPath);

      for (const usage of usages) {
        for (const symbol of usage.symbols) {
          if (!exported.has(symbol)) {
            violations.push(
              `${usage.file}: \`${symbol}\` imported from \`@/lib/${moduleName}\` but not exported by \`src/lib/${moduleName}/index.ts\``,
            );
          }
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("drafts barrel exports autosave symbols used by SourceContent", () => {
    const exported = collectBarrelExports(join(LIB_ROOT, "drafts", "index.ts"));
    expect(Array.from(exported)).toEqual(expect.arrayContaining(["getDraft", "deleteDraft", "putDraft"]));
  });
});
