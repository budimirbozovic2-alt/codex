import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react({
      exclude: [/node_modules/, /\.worker\.(ts|js)$/],
    }),
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
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  esbuild: {
    pure: mode === "production"
      ? ["console.log", "console.info", "console.debug"]
      : [],
  },
  build: {
    emptyOutDir: true,
    sourcemap: false,
    target: "chrome130",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
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
