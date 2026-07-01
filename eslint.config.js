import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

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
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/components/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/hooks/**/*.{ts,tsx}", "src/views/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          {
            group: ["@/lib/db/queries/cards-writes", "@/lib/db/queries/cards-bulk-mutations"],
            message: "Card writes belong in cardRepository (@/lib/repositories).",
          },
          {
            group: ["@/lib/repositories/cardRepository"],
            message: "Import cardRepository from @/lib/repositories barrel.",
          },
        ],
      }],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          {
            group: ["@/store/*"],
            message: "Import store selectors through parent hooks/views, not nested components.",
          },
          {
            group: ["@/lib/db/queries", "@/lib/db/queries/*"],
            message: "DB queries belong in hooks/repositories, not UI components.",
          },
          {
            group: ["@/domains/metacognition/metacognitive-storage"],
            message: "Metacognitive storage writes belong in hooks, not UI components.",
          },
        ],
      }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["warn", {
        selector: "CallExpression[callee.name='useGlobalHotkey'] > Literal:nth-child(2):not(ObjectExpression)",
        message: "useGlobalHotkey should pass an options object (e.g. { ignoreInEditable: true }).",
      }],
    },
  },
);
