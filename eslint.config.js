import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Raw Tailwind palette colors (e.g. text-red-500) are forbidden in app code.
// Use semantic tokens: success / warning / destructive / info / primary / muted / accent.
// Mastery and MindMap node tokens are also available (mastery-*, node-*).
const RAW_COLOR_PATTERN =
  String.raw`(text|bg|border|ring|stroke|fill|shadow|outline|divide|from|via|to)-(red|green|blue|yellow|orange|purple|pink|amber|emerald|rose|indigo|violet|cyan|teal|sky|lime|fuchsia)-\d{2,3}`;

export default tseslint.config(
  { ignores: ["dist", "electron/**", "main.cjs", "preload.cjs"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",

      // Zero-any policy — enforced as ERROR globally. Tests are exempted
      // via the dedicated `src/test/**` override block below (partial mocks
      // legitimately need `any`). All production code must use strict types.
      "@typescript-eslint/no-explicit-any": "error",

      // Block raw Tailwind palette colors in JSX/string literals.
      // Forces use of semantic design tokens defined in src/index.css.
      "no-restricted-syntax": [
        "warn",
        {
          selector: `Literal[value=/${RAW_COLOR_PATTERN}/]`,
          message:
            "Raw Tailwind palette colors are forbidden. Use semantic tokens (success, warning, destructive, info, primary, mastery-*, node-*) defined in src/index.css.",
        },
        {
          selector: `TemplateElement[value.raw=/${RAW_COLOR_PATTERN}/]`,
          message:
            "Raw Tailwind palette colors are forbidden. Use semantic tokens (success, warning, destructive, info, primary, mastery-*, node-*) defined in src/index.css.",
        },
        // W5: disallow string-literal event names on eventBus.{emit,subscribe,unsubscribe}.
        // Forces the use of EVENT_TYPES.X constants so typos & stale names fail at lint time.
        {
          selector:
            "CallExpression[callee.object.name='eventBus'][callee.property.name=/^(emit|subscribe|unsubscribe)$/] > Literal:first-child",
          message:
            "Koristi EVENT_TYPES.X umjesto string literala (W5).",
        },
        {
          selector:
            "CallExpression[callee.object.name='eventBus'][callee.property.name=/^(emit|subscribe|unsubscribe)$/] > TemplateLiteral:first-child",
          message:
            "Koristi EVENT_TYPES.X umjesto template-literal-a (W5).",
        },
      ],
    },
  },

  // Critical paths: backup/import/persist/contexts/migrations cannot regress.
  // Any new `any` in these files must FAIL the build.
  {
    files: [
      "src/hooks/useCardImport.ts",
      "src/hooks/useCardExport.ts",
      "src/lib/migrations/**/*.ts",
      "src/lib/sanitize.ts",
      "src/lib/persist-queue.ts",
      "src/lib/db-queries.ts",
      "src/lib/db-schema.ts",
      "src/contexts/cards/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Metacognitive storage hardening: detect dead code early.
  // Po uklanjanju "Procjena sigurnosti" iz Konsolidacije, modul sadrži više
  // legacy/read-only API-ja. Build mora pasti ako se pojave neiskorišteni
  // importi, lokalne varijable, parametri ili nedostupan kod — kako bi se
  // mrtve grane uočile u CI-ju, a ne u ručnoj reviziji.
  {
    files: ["src/lib/metacognitive-storage.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-unreachable": "error",
      "no-useless-catch": "error",
    },
  },

  // Tests: partial mocks legitimately need `any` for constructing
  // simplified fixtures without satisfying full domain interfaces.
  {
    files: ["src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // View-layer hardening: views must consume domain providers, not raw db.
  // Sanctioned exceptions: source/mindmap-heavy views still call db directly
  // because no dedicated provider exists for those domains yet.
  {
    files: ["src/views/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Views must use domain providers (useCardData, useCategoryActions, useBackupActions, …) instead of importing the raw db instance. Type-only imports (import type … from '@/lib/db') are still allowed.",
              importNames: ["db"],
            },
          ],
        },
      ],
    },
  },
);
