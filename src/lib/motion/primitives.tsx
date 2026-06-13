// ─────────────────────────────────────────────────────────────────────────────
// Motion primitives — FadeUp entry animation.
//
// Ako poželiš peti, plan se mijenja, ne fajl. Dekorativne animacije nisu
// dobrodošle u učnoj aplikaciji gdje je brzina misli najvažnija.
// ─────────────────────────────────────────────────────────────────────────────
import { ReactNode } from "react";
import { m, HTMLMotionProps } from "framer-motion";
import { DURATION, EASE, TRANSLATE_PX } from "./tokens";

// ── FadeUp ──────────────────────────────────────────────────────────────────
// Standardni ulazak: skeleton → content, modal body, novi widget. 6px
// translate je namjerno mali — premium aplikacije ne "skaču".
interface FadeUpProps extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition"> {
  /** Sekvencijalni stagger; koristi STAGGER.* za listu */
  delay?: number;
  children: ReactNode;
}

export function FadeUp({ delay = 0, children, ...rest }: FadeUpProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: TRANSLATE_PX }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: TRANSLATE_PX }}
      transition={{ duration: DURATION.base, ease: EASE.out, delay }}
      {...rest}
    >
      {children}
    </m.div>
  );
}
