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
      ],
    },
  },

  // View-layer hardening: views must consume domain providers, not raw db.
  // Sanctioned exceptions: source/mindmap-heavy views still call db directly
  // because no dedicated provider exists for those domains yet.
  {
    files: ["src/views/**/*.{ts,tsx}"],
    ignores: [
      "src/views/MindMapPage.tsx",
      "src/views/SubjectMindMapPage.tsx",
      "src/views/SubjectCardsView.tsx",
      "src/views/SubjectDashboard.tsx",
      "src/views/CategoryView.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Views must use domain providers (useCardData, useCategoryActions, useBackupActions, …) instead of importing the raw db instance. Type-only imports (import type) are still allowed.",
              importNames: ["db"],
            },
          ],
        },
      ],
    },
  },
);
