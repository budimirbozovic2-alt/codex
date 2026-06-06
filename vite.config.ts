import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { componentTagger } from "lovable-tagger";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

function copySqliteWasmPlugin(): Plugin {
  return {
    name: "copy-sqlite-wasm",
    apply: "build",
    closeBundle() {
      const src = path.resolve(__dirname, "node_modules/@sqlite.org/sqlite-wasm/dist");
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
        if (existsSync(from)) copyFileSync(from, path.join(dst, file));
      }
    },
  };
}

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
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  esbuild: {
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" 
      ? ["console.log", "console.info", "console.debug", "console.warn"] 
      : [],
  },
  build: {
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
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