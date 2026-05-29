// ─────────────────────────────────────────────────────────────────────────────
// MotionProvider — jedinstveni mount point za framer-motion sistem.
//
//   • LazyMotion + domAnimation → tree-shake puni `motion` paket
//     (~35 KB) na ~6 KB; drag/layout funkcije se lazy-loaduju samo gdje
//     se koriste preko `domMax` (ako bude trebalo, dodajemo ga ovdje).
//   • `strict` → kompajler greška ako neko negdje ostavi `<motion.div>`
//     umjesto `<m.div>`. Forsira disciplinu, ne dozvoljava regresiju.
//   • `MotionConfig reducedMotion="user"` → SVE m.* animacije globalno
//     poštuju OS postavku. Bez ovog wrappera moramo per-fajl
//     `useReducedMotion()` što je dosadno i zaboravlja se.
//   • Default `transition` znači da svaki `<m.div animate={{ opacity: 1 }}>`
//     nasljeđuje token bez ponavljanja.
//
// Ovaj fajl je JEDINI legitiman korisnik `motion`, `LazyMotion`, `MotionConfig`
// importa iz framer-motion. ESLint W10 pravilo blokira ostatak aplikacije.
// ─────────────────────────────────────────────────────────────────────────────
import { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { DURATION, EASE } from "./tokens";

interface MotionProviderProps {
  children: ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: DURATION.base, ease: EASE.out }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
