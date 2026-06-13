import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { 
  readFileSync, copyFileSync, mkdirSync, existsSync 
} from "fs";
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

function copySqliteWasmPlugin(): Plugin {
  return {
    name: "copy-sqlite-wasm",
    apply: "build",
    closeBundle() {
      const src = path.resolve(
        __dirname, 
        "node_modules/@sqlite.org/sqlite-wasm/dist"
      );
      const dst = path.resolve(__dirname, "dist/sqlite");
      if (!existsSync(src)) return;
      mkdirSync(dst, { recursive: true });
      
      const files = [
        "sqlite3.wasm", 
        "sqlite3-opfs-async-proxy.js", 
        "sqlite3-worker1.mjs", 
        "index.mjs"
      ];
      
      for (const file of files) {
        const from = path.join(src, file);
        if (existsSync(from)) {
          copyFileSync(from, path.join(dst, file));
        }
      }
    },
  };
}

function serveSqliteWasmDevPlugin(): Plugin {
  return {
    name: "serve-sqlite-wasm-dev",
    apply: "serve",
    configureServer(server) {
      const wasmDir = path.resolve(
        __dirname, 
        "node_modules/@sqlite.org/sqlite-wasm/dist"
      );
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
        res.setHeader(
          "Cross-Origin-Resource-Policy", 
          "same-origin"
        );
        res.end(readFileSync(filePath));
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
  plugins: [
    react(),
    copySqliteWasmPlugin(),
    serveSqliteWasmDevPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(
        __dirname, 
        "node_modules/react-dom"
      ),
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
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  esbuild: {
    // O-8 Observability FIX: Ne izrezujemo error i warn
    // logove u produkciji jer su nam neophodni za telemetriju.
    pure: mode === "production" 
      ? ["console.log", "console.info", "console.debug"] 
      : [],
  },
  build: {
    emptyOutDir: true,
    sourcemap: false,
    // Electron 41 bundles Chromium 130 — target it directly so Vite/esbuild
    // skips polyfills for features already native in that engine.
    target: "chrome130",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            if (id.includes("worker-client")) return "infra-worker-client";
            return;
          }
          // Single React vendor chunk: every lib that calls createContext /
          // forwardRef at module init must live here (never in a separate
          // vendor-* chunk that app code preloads at boot).
          if (
            id.includes("react-router") ||
            /node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ||
            id.includes("@radix-ui") ||
            id.includes("node_modules/sonner") ||
            id.includes("lucide-react") ||
            id.includes("dompurify") ||
            id.includes("@tanstack/react-query") ||
            id.includes("framer-motion") ||
            id.includes("motion-dom") ||
            id.includes("motion-utils") ||
            id.includes("@xyflow") ||
            id.includes("reactflow")
          ) {
            return "vendor-react";
          }
          // Do NOT manual-chunk recharts or @tiptap/prosemirror — keep them in
          // lazy route / feature chunks to avoid shared vendor ↔ app cycles.
        },
      },
    },
  },
  worker: {
    format: "es",
  },
  test: {
    setupFiles: ["src/test/setup.ts"],
    environment: "jsdom",
  },
}));