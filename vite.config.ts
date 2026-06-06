import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, copyFileSync, mkdirSync, existsSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
import { componentTagger } from "lovable-tagger";

/**
 * Pure Desktop (P3 PR-8 finale): copy the `@sqlite.org/sqlite-wasm` runtime
 * into `dist/sqlite/` so the OPFS SQLite adapter can load under `file://`
 * in the packaged Electron renderer. No-op in dev (Vite serves from
 * node_modules directly).
 */
function copySqliteWasmPlugin(): Plugin {
  return {
    name: "copy-sqlite-wasm",
    apply: "build",
    closeBundle() {
      const src = path.resolve(__dirname, "node_modules/@sqlite.org/sqlite-wasm/dist");
      const dst = path.resolve(__dirname, "dist/sqlite");
      if (!existsSync(src)) return;
      mkdirSync(dst, { recursive: true });
      for (const file of ["sqlite3.wasm", "sqlite3-opfs-async-proxy.js", "sqlite3-worker1.mjs"]) {
        const from = path.join(src, file);
        if (existsSync(from)) copyFileSync(from, path.join(dst, file));
      }
    },
  };
}

/**
 * PR-H-OPFS-FIX (H-4): serve `/sqlite/*` from `@sqlite.org/sqlite-wasm/dist`
 * in dev so the OPFS proxy + worker1 files resolve under the wasm-locator's
 * dev base path. Without this Electron DEV gets 404 and degrades to in-memory.
 */
function serveSqliteWasmDevPlugin(): Plugin {
  return {
    name: "serve-sqlite-wasm-dev",
    apply: "serve",
    configureServer(server) {
      const wasmDir = path.resolve(__dirname, "node_modules/@sqlite.org/sqlite-wasm/dist");
      server.middlewares.use("/sqlite", (req, res, next) => {
        const url = req.url || "/";
        const safe = url.split("?")[0].replace(/^\/+/, "");
        if (!/^[\w.-]+$/.test(safe)) {
          res.statusCode = 400;
          return res.end("bad request");
        }
        const filePath = path.join(wasmDir, safe);
        if (!filePath.startsWith(wasmDir + path.sep)) {
          res.statusCode = 403;
          return res.end("forbidden");
        }
        if (!existsSync(filePath)) return next();
        const ext = path.extname(filePath).toLowerCase();
        const mime =
          ext === ".wasm"
            ? "application/wasm"
            : ext === ".mjs" || ext === ".js"
              ? "application/javascript"
              : "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.end(readFileSync(filePath));
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // PR-H-OPFS: enable cross-origin isolation in dev so OPFS-SAH-pool VFS
    // (SharedArrayBuffer-based) initializes when running `bun run dev` under
    // Electron. Without these headers `installOpfsSAHPoolVfs` is undefined.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    copySqliteWasmPlugin(),
    serveSqliteWasmDevPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: [
      "@radix-ui/react-progress",
      "@radix-ui/react-tabs",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "lucide-react",
    ],
    // Per @sqlite.org/sqlite-wasm README: ne prebund-uj — interni import.meta.url
    // resolve-a wasm asset, što se kvari kroz Vite dep cache (HTML fallback,
    // pogrešan MIME, "expected magic word" greška).
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  esbuild: {
    // Strip console.* and debugger from production Electron build to prevent
    // PII leaks into DevTools console. console.error is preserved so genuine
    // crash signals still reach the crash log path. Dev builds keep all logs.
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" ? ["console.log", "console.info", "console.debug", "console.warn"] : [],
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * Split eager vendor graph out of the main App chunk so it falls
         * below the 500 KB warning threshold and benefits from long-term
         * HTTP/file caching (stable libs change rarely vs. app code).
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router")) return "vendor-router";
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "vendor-motion";
          if (id.includes("recharts")) return "vendor-recharts";
          if (id.includes("/d3-") || id.includes("victory-vendor")) return "vendor-d3";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-tiptap";
          if (id.includes("@xyflow") || id.includes("reactflow")) return "vendor-xyflow";
          if (id.includes("dompurify") || id.includes("lucide-react")) return "vendor-ui-utils";
        },
      },
    },
  },
  worker: {
    format: "es",
  },
}));