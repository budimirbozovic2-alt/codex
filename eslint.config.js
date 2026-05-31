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
        // G7: ban raw setTimeout / setInterval. Every timer must go through
        // `taskScheduler` (src/lib/scheduler) so it participates in shutdown
        // on `beforeunload` / Electron `before-quit`, can be inspected via
        // `snapshot()`, and follows the `pauseWhenHidden` contract.
        //
        // Allow-list (per-file override below): timing-critical engines
        // (Pomodoro, SpeedReader), pre-boot infrastructure (db-schema, splash,
        // panic timer), low-level libraries that the scheduler itself sits on
        // top of (persist-queue tick, event-bus heartbeat, zip-service idle,
        // docx-parser race), and editor draft hooks that are scheduled for
        // unified `useDraftAutosave` refactor (Task 2).
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message:
            "Koristi taskScheduler.setTimeout() (src/lib/scheduler). Raw setTimeout je dozvoljen samo u whitelisted infrastrukturi i tight engine-ima (vidi eslint.config.js override).",
        },
        {
          selector: "CallExpression[callee.name='setInterval']",
          message:
            "Koristi taskScheduler.setInterval() (src/lib/scheduler). Raw setInterval je dozvoljen samo u whitelisted engine-ima (vidi eslint.config.js override).",
        },
        {
          selector:
            "MemberExpression[object.name='window'][property.name=/^(setTimeout|setInterval)$/]",
          message:
            "Koristi taskScheduler iz src/lib/scheduler umjesto window.setTimeout/setInterval.",
        },
        // PR1 — Keyed mutex consolidation. Ad-hoc `let _pendingX = Promise.resolve()`
        // serijalizacioni lanci moraju ići kroz `createKeyedMutex` iz
        // `@/lib/concurrency`. Implementacija primitive je u `src/lib/concurrency/**`.
        {
          selector:
            "VariableDeclarator[id.name=/^_?pending[A-Z]\\w*$/][init.type='CallExpression'][init.callee.object.name='Promise'][init.callee.property.name='resolve']",
          message:
            "Koristi createKeyedMutex() iz @/lib/concurrency umjesto ručnog `_pendingX = Promise.resolve()` lanca (PR1).",
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
      "src/hooks/cards/**/*.{ts,tsx}",
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

  // ─── W6 — View-layer Public API discipline ─────────────────────────────
  // Views must consume domain providers, not raw infra. Source/mindmap-heavy
  // views are sanctioned exceptions because no dedicated provider exists yet.
  {
    files: ["src/views/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db-seed",
              message:
                "Views must use domain providers (useCardData, useCategoryActions, useBackupActions, …) instead of importing seed helpers directly (W6).",
            },
          ],
          patterns: [
            {
              group: ["@/features/*/*"],
              message:
                "Deep imports into a feature are forbidden. Import from the feature barrel: `@/features/<name>`.",
            },
            {
              group: ["@/lib/repositories/*"],
              message:
                "Importuj iz `@/lib/repositories` barrel-a (Public API wall).",
            },
            {
              group: ["@/store/*"],
              message:
                "Importuj iz `@/store` barrel-a (Public API wall).",
            },
            {
              group: ["@/lib/db/queries/*"],
              message:
                "Importuj iz `@/lib/db` barrel-a — `queries/*` je interno (Public API wall).",
            },
          ],
        },
      ],
    },
  },

  // ─── W7 — Ban raw `dangerouslySetInnerHTML` (XSS hardening) ─────────────
  // Every render-site MUST route through `<SafeHtml>` so DOMPurify runs at
  // render-time as defense-in-depth against XSS from imported user data.
  // Sanctioned exceptions: the `<SafeHtml>` wrapper itself and one read-only
  // SourceContent renderer that feeds pre-sanitized HTML straight from its
  // pipeline.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/safe-html.tsx",
      "src/components/source-reader/SourceContent.tsx",
      "src/test/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "Koristi <SafeHtml html={...} /> umjesto sirovog `dangerouslySetInnerHTML`. Render-time DOMPurify je obavezna XSS odbrana (P0-3).",
        },
        {
          selector:
            "Property[key.name='dangerouslySetInnerHTML'][value.type='ObjectExpression']",
          message:
            "Koristi <SafeHtml html={...} /> umjesto sirovog `dangerouslySetInnerHTML` u createElement props-u (P0-3).",
        },
      ],
    },
  },

  // ─── W8 — Public API walls + Feature-Sliced boundaries ─────────────────
  //
  // Outside `src/features/X/`, code may only import `@/features/X` (its
  // barrel). Deep imports like `@/features/X/lib/internal` are forbidden.
  //
  // Walled domains (`@/lib/repositories`, `@/store`, `@/lib/db/queries`,
  // `@/lib/drafts`) expose a single barrel each. Deep imports re-introduce
  // the cross-module coupling we eliminated during the IDB-as-SSOT
  // migration — blocked here for every consumer outside the walled
  // directory itself.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/features/**",
      "src/test/**",
      "src/lib/repositories/**",
      "src/store/**",
      "src/lib/db/**",
      "src/lib/drafts/**",
      // Draft hooks own the thin React wrapper over the drafts module and
      // legitimately reach for sub-modules (registry, table) directly.
      "src/hooks/useDraftAutosave.ts",
      "src/hooks/useDraftRegistry.ts",
      "src/hooks/usePersistedDraftMirror.ts",
      "src/hooks/useCardDraftAutosave.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message:
                "Deep imports into a feature are forbidden. Import from the feature barrel: `@/features/<name>`.",
            },
            {
              group: ["@/lib/repositories/*"],
              message:
                "Importuj iz `@/lib/repositories` barrel-a (Public API wall).",
            },
            {
              group: ["@/store/*"],
              message:
                "Importuj iz `@/store` barrel-a (Public API wall).",
            },
            {
              group: ["@/lib/db/queries/*"],
              message:
                "Importuj iz `@/lib/db` barrel-a — `queries/*` je interno (Public API wall).",
            },
            {
              group: ["@/lib/drafts/*"],
              message:
                "Importuj iz `@/lib/drafts` barrel-a (Public API wall). Hookove koristi iz @/hooks/useDraftAutosave | useDraftRegistry | usePersistedDraftMirror.",
            },
          ],
        },
      ],
    },
  },

  // PR5 — analytics `_pure/**` modules must remain free of any side-effectful
  // dependency so they can run identically inside `analytics.worker.ts`.
  // Blocks storage, IDB, contexts, React, and the event bus.
  {
    files: ["src/lib/analytics/_pure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/storage", "@/lib/storage/*"], message: "_pure analytics ne smije čitati storage. Inject snapshote." },
            { group: ["@/lib/db", "@/lib/db/*"], message: "_pure analytics ne smije pristupati IDB. Inject snapshote." },
            { group: ["@/lib/metacognitive-storage"], message: "_pure analytics ne smije čitati metacognitive-storage. Inject snapshote." },
            // Type-only imports from planner are allowed (`import type { ... }`); runtime reads are not.
            { group: ["@/lib/planner-storage", "@/domains/planner", "@/domains/planner/*"], message: "_pure analytics ne smije čitati planner runtime. Inject snapshote (type-only import je dozvoljen).", allowTypeImports: true },
            { group: ["@/domains/cards", "@/domains/cards/*"], message: "_pure analytics ne smije pristupati card domenu. Inject snapshote." },
            { group: ["@/domains/mnemonic", "@/domains/mnemonic/*"], message: "_pure analytics ne smije pristupati mnemonic domenu. Inject snapshote." },
            { group: ["@/contexts/*", "@/contexts/**"], message: "_pure analytics ne smije čitati React contexts." },
            { group: ["react", "react-dom"], message: "_pure analytics mora biti React-free (radi u Web Worker-u)." },
            { group: ["@/lib/event-bus", "@/lib/event-bus-types"], message: "_pure analytics ne smije emitovati event-bus." },
          ],
        },
      ],
    },
  },

  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message:
                "Deep import into another feature is forbidden. Use that feature's barrel `@/features/<name>`.",
            },
          ],
        },
      ],
    },
  },

  // B4/B8 — Zabrana runtime uvoza @/lib/db iz UI sloja.
  // Dozvoljen je samo `import type` (allowTypeImports) i sanctioned barrel
  // `@/lib/db/queries` (Public API wall — hooks consume queries directly).
  // Motivacija: OPFS SQLite + TanStack Query — DB pristup mora ići kroz
  // queries barrel ili custom hook, nikad direktno iz UI komponenti.
  //
  // Allow-list (sanctioned exceptions, infrastructure that cannot route
  // through a hook because it IS the boot/import infrastructure):
  //   • src/hooks/card-bootstrap/**          — boot orchestrator (opens DB)
  //   • src/components/export-import/**      — backup/import validator (FK checks)
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    ignores: [
      "src/hooks/card-bootstrap/**",
      "src/components/export-import/**",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Runtime import @/lib/db iz UI sloja je zabranjen. Koristi @/lib/db/queries barrel (u hookovima) ili `import type` za interfejse.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              // Block deep imports into @/lib/db except the sanctioned
              // `queries` barrel. Negated extglob keeps `@/lib/db/queries`
              // accessible while still blocking siblings like `@/lib/db/foo`.
              group: ["@/lib/db/*", "!@/lib/db/queries"],
              message:
                "Runtime import @/lib/db/* iz UI sloja je zabranjen. Koristi @/lib/db/queries barrel (Public API wall) ili custom hook.",
              allowTypeImports: true,
            },
            {
              group: ["@/lib/db/queries/*"],
              message:
                "Importuj iz `@/lib/db/queries` barrel-a — `queries/*` je interno (Public API wall).",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },



  // G7 — Raw setTimeout/setInterval allow-list.
  //
  // Disables `no-restricted-syntax` (which carries the timer guards from
  // the global block) ONLY for files that legitimately need raw timers:
  //
  //   • src/lib/scheduler/**        — the implementation itself
  //   • src/lib/persist-queue.ts    — frame-coalescer + retry tick; predates
  //                                    and underpins scheduler bootstrap
  //   • src/lib/db-schema.ts        — pre-boot DB open / blocked-tab recovery
  //   • src/lib/db-queries.ts       — reviewLog debounce hot path
  //   • src/lib/event-bus.ts        — heartbeat / cleanup interval (singleton)
  //   • src/lib/zip-service.ts      — idle-timeout worker teardown
  //   • src/lib/electron-integration.ts — IPC timeout race wrapper
  //   • src/lib/backup/yield-ui.ts  — alternative to scheduler for Dexie txs
  //   • src/main.tsx                 — splash removal pre-scheduler init
  //   • src/hooks/useCardBootstrap.ts — boot panic timer
  //   • src/hooks/useNotificationScheduler.ts — global 60s polling
  //   • src/hooks/speed-reader/useSpeedReaderEngine.ts — RSVP timing
  //   • src/features/mnemonic/hooks/useTestEngine.ts — test countdown
  //   • src/features/docx-importer/docx-parser.ts — worker timeout race
  //   • src/components/db/BlockingModal.tsx — pre-boot DB poll
  //   • src/components/ZenMode.tsx — 1s timer tick
  //
  // Task 2 group MIGRATED to taskScheduler (PR completed): useCardDraftAutosave,
  // useSourceEditing, useArticleDraft, useWikiLinkAutoCreate, useMindMapCanvas,
  // useNodeEditing, SourceReader.
  {
    files: [
      "src/lib/scheduler/**",
      "src/lib/persist-queue.ts",
      "src/lib/db-schema.ts",
      "src/lib/db-queries.ts",
      "src/lib/event-bus.ts",
      "src/lib/zip-service.ts",
      "src/lib/electron-integration.ts",
      "src/lib/backup/yield-ui.ts",
      "src/main.tsx",
      "src/hooks/useCardBootstrap.ts",
      "src/hooks/useNotificationScheduler.ts",
      "src/hooks/speed-reader/useSpeedReaderEngine.ts",
      "src/features/mnemonic/hooks/useTestEngine.ts",
      "src/features/docx-importer/docx-parser.ts",
      "src/components/db/BlockingModal.tsx",
      "src/components/ZenMode.tsx",
      // Test files legitimately use raw timers for fake-timer scenarios.
      "src/test/**",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // Phase C — Dexie removal: the legacy shell is gone. Keep a hard-fail
  // guard against any future `import "dexie"` / `import "dexie-react-hooks"`
  // (or re-introduction of `@/lib/legacy/idb-dexie`) so we don't regress.
  // Migration now reads raw IDB via `@/lib/persistence/sqlite/idb-raw-reader`.
  // ─────────────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "dexie",
              message:
                "Dexie je uklonjen (Phase C). Migracija ide preko @/lib/persistence/sqlite/idb-raw-reader; runtime DB pristup ide preko @/lib/db/queries.",
            },
            {
              name: "dexie-react-hooks",
              message:
                "useLiveQuery je zabranjen (Core). Koristi TanStack Query (useQuery + invalidateQueries).",
            },
          ],
          patterns: [
            {
              group: ["@/lib/legacy/idb-dexie", "**/legacy/idb-dexie"],
              message:
                "legacy/idb-dexie je uklonjen (Phase C). Koristi @/lib/db/queries za runtime ili @/lib/persistence/sqlite/idb-raw-reader za migraciju.",
            },
          ],
        },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // W9 — `*Ram` card selectors are test-only.
  //
  // The granular Zustand-backed selectors (`useCardsByCategoryRam`, etc.)
  // exist only as a `QueryClientProvider`-free fallback for unit tests in
  // `card-selectors.test.tsx`. Production code MUST read through the
  // TanStack variants (un-suffixed names re-exported from `@/store`).
  // Importing a `*Ram` selector outside the allow-list defeats the
  // "TanStack is the cards read path" invariant (Core memory, mem://
  // architecture/tanstack-query-read-path).
  // ─────────────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/test/**",
      "src/store/useCardSelectors.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportSpecifier[imported.name=/^(useCardsByCategoryRam|useCardsBySubcategoryRam|useCardsByChapterRam|useCardCountByCategoryRam|useCardByIdRam)$/]",
          message:
            "*Ram selektori su test-only (W9). Koristi TanStack varijante iz @/store (npr. useCardsByCategory).",
        },
      ],
    },
  },

  // ─── W10 — Disciplinovan motion ─────────────────────────────────────────
  // framer-motion smije ulaziti u app SAMO kroz `@/lib/motion` barrel.
  // Pojedinačni `motion.*` importi su zabranjeni (gube LazyMotion strict
  // benefit). Koristi `m` iz @/lib/motion ili importuj primitive
  // (FadeUp, CrossFade, ListItem, Presence). MotionProvider.tsx je jedini
  // legitiman korisnik `motion`/`LazyMotion`/`MotionConfig` importa.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/motion/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "framer-motion",
              importNames: ["motion", "MotionConfig", "LazyMotion", "domAnimation", "domMax"],
              message:
                "Koristi @/lib/motion barrel (FadeUp/CrossFade/ListItem/Presence ili `m` iz framer-motion uz eslint-disable + opravdanje). `motion.*` razbija LazyMotion tree-shake (W10).",
            },
          ],
        },
      ],
    },
  },

  // ─── W11/W12/W13 — Domain barrels (src/domains/*) ───────────────────────
  // Each domain exposes a single barrel `@/domains/<name>`. Deep imports
  // (`@/domains/<name>/internal-file`) are forbidden for all callers
  // OUTSIDE the domain's own directory. The domain itself, plus `src/test`,
  // is whitelisted via the `ignores` block so internal composition works.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/domains/cards/**",
      "src/domains/planner/**",
      "src/domains/mnemonic/**",
      "src/test/**",
      // Legacy back-compat shims that intentionally re-export domain internals.
      "src/lib/planner-storage.ts",
      "src/lib/analytics/blind-spots.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/domains/cards/*"],
              message:
                "Deep import u cards domen je zabranjen (W11). Importuj iz `@/domains/cards` barrel-a.",
            },
            {
              group: ["@/domains/planner/*"],
              message:
                "Deep import u planner domen je zabranjen (W12). Importuj iz `@/domains/planner` barrel-a.",
            },
            {
              group: ["@/domains/mnemonic/*"],
              message:
                "Deep import u mnemonic domen je zabranjen (W13). Importuj iz `@/domains/mnemonic` barrel-a.",
            },
          ],
        },
      ],
    },
  },

  // ─── W14 — Cross-domain isolation ────────────────────────────────────────
  // A domain may NOT deep-import another domain's internals. The only
  // sanctioned cross-domain seam is the public barrel. Combined with W11–W13
  // this guarantees a stable contract surface between bounded contexts and
  // lets each domain refactor its internals without ripples.
  {
    files: ["src/domains/cards/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/domains/planner/*", "@/domains/mnemonic/*"], message: "Cross-domain deep import (W14). Koristi barrel `@/domains/<other>`." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domains/planner/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/domains/cards/*", "@/domains/mnemonic/*"], message: "Cross-domain deep import (W14). Koristi barrel `@/domains/<other>`." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domains/mnemonic/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/domains/cards/*", "@/domains/planner/*"], message: "Cross-domain deep import (W14). Koristi barrel `@/domains/<other>`." },
          ],
        },
      ],
    },
  },
);


