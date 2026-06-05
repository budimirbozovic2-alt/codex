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

describe("PR-H-OPFS-FIX-2: CSP + self-hosted fonts", () => {
  it("main.cjs PROD_CSP allows 'unsafe-eval' and 'wasm-unsafe-eval'", () => {
    const src = read("main.cjs");
    const m = src.match(/PROD_CSP\s*=\s*"([^"]+)"/);
    expect(m).toBeTruthy();
    const csp = m![1];
    expect(csp).toMatch(/'unsafe-eval'/);
    expect(csp).toMatch(/'wasm-unsafe-eval'/);
  });

  it("main.cjs PROD_CSP does not allowlist Google Fonts origins", () => {
    const src = read("main.cjs");
    const m = src.match(/PROD_CSP\s*=\s*"([^"]+)"/);
    const csp = m![1];
    expect(csp).not.toMatch(/fonts\.googleapis\.com/);
    expect(csp).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("index.html has no Google Fonts references", () => {
    const src = read("index.html");
    expect(src).not.toMatch(/fonts\.googleapis\.com/);
    expect(src).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("public/splash.html has no Google Fonts references", () => {
    const src = read("public/splash.html");
    expect(src).not.toMatch(/fonts\.googleapis\.com/);
    expect(src).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("src/index.css self-hosts Fraunces from /fonts/", () => {
    const src = read("src/index.css");
    expect(src).toMatch(/font-family:\s*['"]Fraunces['"]/);
    expect(src).toMatch(/url\(['"]\/fonts\/fraunces-latin\.woff2['"]\)/);
  });
});

describe("PR-H-OPFS-FIX-3: every app:// Response carries isolation + CSP", () => {
  const src = read("main.cjs");

  it("ISOLATION_HEADERS constant pins COOP=same-origin, COEP=require-corp, CORP=cross-origin", () => {
    const m = src.match(/ISOLATION_HEADERS\s*=\s*\{([\s\S]*?)\}/);
    expect(m).toBeTruthy();
    const block = m![1];
    expect(block).toMatch(/['"]Cross-Origin-Opener-Policy['"]\s*:\s*['"]same-origin['"]/);
    expect(block).toMatch(/['"]Cross-Origin-Embedder-Policy['"]\s*:\s*['"]require-corp['"]/);
    expect(block).toMatch(/['"]Cross-Origin-Resource-Policy['"]\s*:\s*['"]cross-origin['"]/);
  });

  it("buildHeaders includes Content-Type + ISOLATION_HEADERS spread + CSP", () => {
    const m = src.match(/buildHeaders\s*=\s*\([^)]*\)\s*=>\s*\(\{([\s\S]*?)\}\)/);
    expect(m).toBeTruthy();
    const body = m![1];
    expect(body).toMatch(/['"]Content-Type['"]\s*:/);
    expect(body).toMatch(/\.\.\.ISOLATION_HEADERS/);
    expect(body).toMatch(/['"]Content-Security-Policy['"]\s*:\s*PROD_CSP/);
  });

  it("every `new Response(...)` inside protocol.handle('app', ...) uses buildHeaders", () => {
    const handleIdx = src.indexOf("protocol.handle('app'");
    expect(handleIdx).toBeGreaterThan(-1);
    // Slice the handler body to the matching closing `});` — bounded scan is fine.
    const block = src.slice(handleIdx, handleIdx + 4000);
    const responses = block.match(/new Response\([\s\S]*?\}\s*\)/g) || [];
    expect(responses.length).toBeGreaterThan(0);
    for (const r of responses) {
      expect(r).toMatch(/headers\s*:\s*buildHeaders\(/);
    }
    // serveIndex() (used as fallback inside the handler) must also use buildHeaders.
    const serveIndexMatch = src.match(/serveIndex\s*=\s*async[\s\S]*?\};/);
    expect(serveIndexMatch).toBeTruthy();
    expect(serveIndexMatch![0]).toMatch(/headers\s*:\s*buildHeaders\(['"]text\/html['"]\)/);
  });

  it("MIME_TYPES covers every asset extension shipped in dist/ + public/", () => {
    const required = [
      ".html", ".js", ".mjs", ".css", ".json", ".svg",
      ".png", ".jpg", ".jpeg", ".ico",
      ".woff", ".woff2", ".ttf", ".otf",
      ".wasm",
    ];
    const m = src.match(/MIME_TYPES\s*=\s*\{([\s\S]*?)\};/);
    expect(m).toBeTruthy();
    const block = m![1];
    for (const ext of required) {
      expect(block).toMatch(new RegExp(`['"]\\${ext}['"]\\s*:`));
    }
  });

  it("--verify-headers runtime smoke entrypoint is wired in main.cjs and module exists", () => {
    expect(src).toMatch(/--verify-headers/);
    expect(src).toMatch(/electron[\/\\]+verify-headers\.cjs|verify-headers\.cjs/);
    const mod = read("electron/verify-headers.cjs");
    expect(mod).toMatch(/net\.fetch\(/);
    expect(mod).toMatch(/cross-origin-opener-policy/);
    expect(mod).toMatch(/cross-origin-embedder-policy/);
    expect(mod).toMatch(/cross-origin-resource-policy/);
    expect(mod).toMatch(/content-security-policy/);
    expect(mod).toMatch(/app:\/\/localhost/);
  });
});

