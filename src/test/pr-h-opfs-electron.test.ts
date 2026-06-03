/**
 * PR-H-OPFS guards — keep COOP/COEP wired up in Electron + dev so OPFS-SAH
 * pool VFS keeps initializing. Regressing any of these would silently
 * downgrade the desktop build to in-memory SQLite.
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
    // No hard throw for missing OPFS — always falls back via dev-fallback.
    expect(src).not.toMatch(/throw new Error\(["']OPFS_UNAVAILABLE/);
    expect(src).toMatch(/getDevFallbackExecutor/);
    // Diagnostic surface present.
    expect(src).toMatch(/crossOriginIsolated/);
    expect(src).toMatch(/hasSharedArrayBuffer/);
  });
});
