/**
 * Electron desktop guards — main-process SQLite + app:// protocol (Faza 5.4).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(p), "utf-8");

describe("Electron desktop guards (Faza 5.4)", () => {
  it("client.ts delegates to readyMachine; main-process SQLite only", () => {
    const clientSrc = read("src/lib/persistence/sqlite/client.ts");
    const readySrc = read("src/lib/persistence/sqlite/readyMachine.ts");
    const backendSrc = read("src/lib/persistence/sqlite/backend.ts");
    expect(clientSrc).not.toMatch(/installOpfsSAHPoolVfs/);
    expect(clientSrc).not.toMatch(/opfs-worker/);
    expect(clientSrc).toMatch(/ensureSqliteReady/);
    expect(clientSrc).toMatch(/getSqliteExecutor/);
    expect(readySrc).toMatch(/openMainProcessExecutor/);
    expect(readySrc).not.toMatch(/migrateOpfsToMainIfNeeded/);
    expect(readySrc).not.toMatch(/openOpfsExecutor/);
    expect(readySrc).not.toMatch(/worker-client/);
    expect(readySrc).toMatch(/FatalError/);
    expect(backendSrc).toMatch(/return "main"/);
  });

  it("OPFS migration stack removed", () => {
    const paths = [
      "src/lib/persistence/sqlite/migrate-opfs-to-main.ts",
      "src/lib/persistence/sqlite/opfs-worker.ts",
      "src/lib/persistence/sqlite/worker-client.ts",
      "src/lib/persistence/sqlite/sqlite-init.ts",
      "src/lib/persistence/sqlite/wasm-locator.ts",
    ];
    for (const p of paths) {
      expect(() => read(p)).toThrow();
    }
  });

  it("editor-v4 heal uses dynamic import (renderer only)", () => {
    const healsSrc = read("src/lib/persistence/sqlite/post-migration-heals.ts");
    expect(healsSrc).not.toMatch(
      /import\s+\{\s*migrateEditorV4Content\s*\}\s+from\s+["']\.\/editor-v4-schema-migration["']/,
    );
    expect(healsSrc).toMatch(/await import\(\s*["']\.\/editor-v4-schema-migration["']\s*\)/);
    expect(healsSrc).toMatch(/typeof window !== "undefined"/);
  });

  it("main.cjs protocol.handle uses CSP via buildHeaders", () => {
    const src = read("main.cjs");
    expect(src).not.toMatch(/ISOLATION_HEADERS/);
    expect(src).not.toMatch(/Cross-Origin-Embedder-Policy/);
    expect(src).toMatch(/protocol\.handle\('app'/);
    expect(src).toMatch(/Content-Security-Policy/);
    expect(src).toMatch(/buildHeaders/);
  });

  it("vite.config.ts has no sqlite-wasm plugins", () => {
    const src = read("vite.config.ts");
    expect(src).not.toMatch(/copySqliteWasmPlugin/);
    expect(src).not.toMatch(/serveSqliteWasmDevPlugin/);
    expect(src).not.toMatch(/sqlite-wasm/);
    expect(src).not.toMatch(/opfs-worker/);
  });

  it("electron dev window enables Ctrl+Shift+I DevTools toggle in dev mode", () => {
    const src = read("electron/window.cjs");
    expect(src).toMatch(/if \(isDev\)/);
    expect(src).toMatch(/toggleDevTools/);
  });

  it("_pure analytics modules avoid spaced-repetition barrel", () => {
    const workerSafe = ["src/lib/analytics/_pure/charts.ts"];
    for (const file of workerSafe) {
      const src = read(file);
      expect(src).not.toMatch(/@\/lib\/spaced-repetition/);
      expect(src).not.toMatch(/@\/lib\/editor-v4/);
    }
  });
});

describe("PR-H-OPFS-FIX-2: CSP + self-hosted fonts", () => {
  it("main.cjs PROD_CSP allows unsafe-eval but not wasm-unsafe-eval", () => {
    const src = read("main.cjs");
    const m = src.match(/PROD_CSP\s*=\s*"([^"]+)"/);
    expect(m).toBeTruthy();
    const csp = m![1];
    expect(csp).toMatch(/'unsafe-eval'/);
    expect(csp).not.toMatch(/wasm-unsafe-eval/);
  });

  it("main.cjs PROD_CSP does not allowlist Google Fonts origins", () => {
    const src = read("main.cjs");
    const m = src.match(/PROD_CSP\s*=\s*"([^"]+)"/);
    const csp = m![1];
    expect(csp).not.toMatch(/fonts\.googleapis\.com/);
  });

  it("src/index.css self-hosts Fraunces from /fonts/", () => {
    const src = read("src/index.css");
    expect(src).toMatch(/url\(['"]\/fonts\/fraunces-latin\.woff2['"]\)/);
  });
});

describe("verify-headers smoke entrypoint", () => {
  it("--verify-headers wired in main.cjs", () => {
    const src = read("main.cjs");
    expect(src).toMatch(/--verify-headers/);
    const mod = read("electron/verify-headers.cjs");
    expect(mod).toMatch(/net\.fetch\(/);
    expect(mod).toMatch(/content-security-policy/);
    expect(mod).not.toMatch(/sqlite3\.wasm/);
  });
});
