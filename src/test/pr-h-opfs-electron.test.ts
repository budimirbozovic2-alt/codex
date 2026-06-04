/**
 * PR-H-OPFS + PR-H-OPFS-FIX guards — keep COOP/COEP wired up in Electron + dev
 * AND ensure the headers are injected inside `protocol.handle` (not just
 * `onHeadersReceived`, which bypasses custom protocols). Regressing any of
 * these would silently downgrade the desktop build to in-memory SQLite.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(p), "utf-8");

describe("PR-H-OPFS: Electron cross-origin isolation", () => {
  it("main.cjs sets COOP + COEP + CORP headers", () => {
    const src = read("main.cjs");
    expect(src).toMatch(/Cross-Origin-Opener-Policy/);
    expect(src).toMatch(/Cross-Origin-Embedder-Policy/);
    expect(src).toMatch(/Cross-Origin-Resource-Policy/);
    expect(src).toMatch(/same-origin/);
    expect(src).toMatch(/require-corp/);
  });

  it("main.cjs CSP allows worker-src for sqlite OPFS proxy", () => {
    const src = read("main.cjs");
    expect(src).toMatch(/worker-src[^"]*'self'/);
  });

  it("vite.config.ts dev server sends COOP + COEP", () => {
    const src = read("vite.config.ts");
    expect(src).toMatch(/Cross-Origin-Opener-Policy/);
    expect(src).toMatch(/Cross-Origin-Embedder-Policy/);
  });

  it("client.ts falls back to in-memory executor instead of throwing OPFS_UNAVAILABLE", () => {
    const src = read("src/lib/persistence/sqlite/client.ts");
    expect(src).not.toMatch(/throw new Error\(["']OPFS_UNAVAILABLE/);
    expect(src).toMatch(/getDevFallbackExecutor/);
    expect(src).toMatch(/crossOriginIsolated/);
    expect(src).toMatch(/hasSharedArrayBuffer/);
  });
});

describe("PR-H-OPFS-FIX: app:// protocol must carry isolation + MIME headers", () => {
  it("main.cjs serves .wasm as application/wasm (C-2)", () => {
    const src = read("main.cjs");
    expect(src).toMatch(/['"]\.wasm['"]\s*:\s*['"]application\/wasm['"]/);
  });

  it("main.cjs centralizes ISOLATION_HEADERS and injects them into protocol.handle Responses (C-1)", () => {
    const src = read("main.cjs");
    // Constant exists.
    expect(src).toMatch(/ISOLATION_HEADERS\s*=\s*\{/);
    // The protocol.handle('app', …) block exists.
    const handleIdx = src.indexOf("protocol.handle('app'");
    expect(handleIdx).toBeGreaterThan(-1);
    // ISOLATION_HEADERS (directly or via buildHeaders) reaches Response constructors.
    // We check that within the protocol handle block there is at least one Response
    // whose headers include either ISOLATION_HEADERS or buildHeaders.
    const handleBlock = src.slice(handleIdx, handleIdx + 4000);
    expect(handleBlock).toMatch(/buildHeaders|ISOLATION_HEADERS/);
    // buildHeaders helper itself includes the spread / Cross-Origin header.
    expect(src).toMatch(/buildHeaders\s*=\s*\([^)]*\)\s*=>\s*\(\{[\s\S]*?ISOLATION_HEADERS/);
  });

  it("wasm-locator.ts dev branch does NOT return literal './sqlite/' (H-4)", () => {
    const src = read("src/lib/persistence/sqlite/wasm-locator.ts");
    // Dev branch must use absolute /sqlite/ (served by Vite middleware) to
    // avoid 404s for the OPFS proxy + worker1 in Electron DEV.
    expect(src).toMatch(/return\s+["']\/sqlite\/["']/);
  });

  it("vite.config.ts wires the dev /sqlite middleware (H-4)", () => {
    const src = read("vite.config.ts");
    expect(src).toMatch(/serveSqliteWasmDevPlugin/);
    expect(src).toMatch(/middlewares\.use\(["']\/sqlite["']/);
  });

  it("client.ts emits db-degraded event for both fallback paths (UX safety net)", () => {
    const src = read("src/lib/persistence/sqlite/client.ts");
    expect(src).toMatch(/db-degraded/);
    expect(src).toMatch(/emitDegraded\(["']opfs-api-missing["']/);
    expect(src).toMatch(/emitDegraded\(["']opfs-runtime-error["']/);
  });

  it("DbDegradedWatcher is mounted in App.tsx", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/DbDegradedWatcher/);
    const watcher = read("src/components/DbDegradedWatcher.tsx");
    expect(watcher).toMatch(/addEventListener\(["']db-degraded["']/);
    expect(watcher).toMatch(/toast\.error/);
  });
});
