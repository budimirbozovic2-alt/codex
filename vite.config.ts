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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
  },
  worker: {
    format: "es",
  },
}));
