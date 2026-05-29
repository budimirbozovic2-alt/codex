// ─────────────────────────────────────────────────────────────────────────────
// Motion primitives — 4 funkcionalna primitiva.
//
// Ako poželiš peti, plan se mijenja, ne fajl. Dekorativne animacije nisu
// dobrodošle u učnoj aplikaciji gdje je brzina misli najvažnija.
// ─────────────────────────────────────────────────────────────────────────────
import { ReactNode, HTMLAttributes } from "react";
// eslint-disable-next-line no-restricted-imports
import { m, AnimatePresence, HTMLMotionProps } from "framer-motion";
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

// ── CrossFade ───────────────────────────────────────────────────────────────
// Toggle dva stanja na ISTOM mjestu (onboarding steps, tab content,
// dva uzastopna pitanja u review sesiji). `mode="wait"` osigurava da
// novi sadržaj ne ulazi dok stari ne izađe — bez layout thrash-a.
interface CrossFadeProps {
  /** Stabilan ključ koji se mijenja kad se zamijeni sadržaj */
  motionKey: string;
  children: ReactNode;
  className?: string;
}

export function CrossFade({ motionKey, children, className }: CrossFadeProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={motionKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.fast, ease: EASE.out }}
        className={className}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

// ── ListItem ────────────────────────────────────────────────────────────────
// Layout-animated stavka. Koristi se kad se lista može reorder-ovati ili
// stavke ulaze/izlaze (backlinks, planner stavke, palace items). Bez ovog,
// nova stavka "pukne" u UI bez konteksta.
interface ListItemProps extends Omit<HTMLMotionProps<"li">, "layout"> {
  children: ReactNode;
}

export function ListItem({ children, ...rest }: ListItemProps) {
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: TRANSLATE_PX }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      {...rest}
    >
      {children}
    </m.li>
  );
}

// ── Presence ────────────────────────────────────────────────────────────────
// Tanki wrapper za AnimatePresence. Re-export ne donosi ništa novo, ali
// poštuje "jedan ulaz" pravilo barrel-a i daje nam mjesto za buduće
// default prop-e (npr. `initial={false}` po defaultu).
export function Presence({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

// Tip alias za potrošače koji rade vlastite `m.div`-ove sa našim props-ima.
export type { HTMLAttributes };
