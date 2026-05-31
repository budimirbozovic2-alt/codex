// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel za motion sistem.
//
// Spoljni potrošači importuju samo iz ovog fajla. Direktan
// `framer-motion` import je zabranjen ESLint pravilom W10
// (vidi eslint.config.js). MotionProvider.tsx je jedini izuzetak.
//
// Šta ide odavde:
//   • MotionProvider — mountuj jednom na vrhu app-a
//   • Tokeni — DURATION, EASE, STAGGER, TRANSLATE_PX
//   • Primitivi — FadeUp, CrossFade, ListItem, Presence
//
// Za naprednije slučajeve (custom m.div sa layoutId), importuj
// `m` direktno iz `framer-motion` ali sa eslint-disable komentarom
// i pisanim opravdanjem zašto primitivi nisu dovoljni.
// ─────────────────────────────────────────────────────────────────────────────

export { MotionProvider } from "./MotionProvider";
export { DURATION, EASE, STAGGER, TRANSLATE_PX } from "./tokens";
export { FadeUp, CrossFade, ListItem, Presence } from "./primitives";

// `m` i `AnimatePresence` su jedini sankcionisani framer-motion primitivi.
// Direktan `import { m } from "framer-motion"` je blokiran ESLint W10 pravilom
// — sve mora ići kroz ovaj barrel da LazyMotion tree-shake ostane intaktan.
export { m, AnimatePresence } from "framer-motion";
