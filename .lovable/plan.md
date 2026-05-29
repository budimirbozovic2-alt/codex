# Motion sa inženjerskom disciplinom

## Kontekst (zatečeno stanje)

- `framer-motion@^12.36.0` je **već instaliran** i importovan u **36 fajlova** (memorija koja kaže "framer-motion uklonjen" je netačna i biće osvježena).
- Svaki fajl koristi puni `motion.*` import — bundle nosi cijeli motion paket eagerno (~35 KB gzip), iako većini korisnika treba samo `fade/scale`.
- `prefers-reduced-motion` se poštuje samo u 3 fajla (`index.css`, `useCountUp`, `RouteTransition`) — preostalih 33 ignoriše korisničke postavke.
- Nema centralnih `duration`/`easing`/`stagger` tokena → svaki autor je smišljao svoje brojeve (0.2s, 0.3s, 0.25s, 0.4s pomiješano).
- Nema `LayoutGroup`/`layoutId` strategije — propušteni funkcionalni dobici (kontinuitet pri otvaranju Zettel članka, reorder backlinkova, FSRS flip).

**Cilj:** ne dodavati nove dekorativne animacije. Konsolidovati postojeće, smanjiti bundle, učiniti svaku animaciju funkcionalnom ili je ukloniti.

---

## Filozofija — kada motion smije postojati

| Smije | Ne smije |
|---|---|
| Kontinuitet (element ostaje isti, mijenja kontekst) | Ulazak liste kartica jedna po jedna sa 80ms staggerom |
| Potvrda akcije (FSRS grade, save, delete) | Bounce/spring na tekstu naslova |
| Orijentacija pažnje na promjenu (toast, novi backlink) | Animirani gradient u pozadini |
| Drag feedback (lift, drop zone highlight) | "Wow" intro animacije |
| Layout shift maskiranje (skeleton → content) | Bilo šta preko 240ms ako blokira interakciju |

**Tvrdo pravilo:** trajanje > 240ms zahtijeva pisani razlog u komentaru iznad. Sve preko 400ms je zabranjeno bez izuzetka.

---

## 1. Centralni motion sistem (`src/lib/motion/`)

Novi modul, jedan ulazni barrel:

```
src/lib/motion/
  tokens.ts          // duration, easing, stagger konstante
  MotionProvider.tsx // LazyMotion + MotionConfig wrapper
  primitives.tsx     // FadeUp, CrossFade, ListItem, Presence
  index.ts           // public barrel
```

### `tokens.ts`
```ts
export const DURATION = {
  instant: 0.12,  // mikro-interakcija (hover, focus ring)
  fast:    0.18,  // toast, popover, tooltip
  base:    0.22,  // page transition, modal open
  slow:    0.32,  // layout shift, FSRS card flip
} as const;

export const EASE = {
  out:     [0.22, 0.61, 0.36, 1] as const,  // standard izlaz
  in:      [0.42, 0, 0.58, 1] as const,
  spring:  { type: "spring", stiffness: 360, damping: 30 } as const,
} as const;

export const STAGGER = { tight: 0.03, loose: 0.06 } as const;
```

Sve postojeće `transition={{ duration: 0.3 }}` se zamjenjuju sa `DURATION.base` + `EASE.out`.

### `MotionProvider.tsx`
Mountuje se jednom u `AppContext.tsx`:
```tsx
<LazyMotion features={domAnimation} strict>
  <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE.out }}>
    {children}
  </MotionConfig>
</LazyMotion>
```

- `LazyMotion` + `strict` → koristi se `<m.div>` umjesto `<motion.div>` → bundle pada sa **~35 KB → ~6 KB** za većinu ekrana (drag/layout funkcije se lazy-loaduju samo gdje treba).
- `reducedMotion="user"` → SVE animacije automatski poštuju OS postavku, bez ručnih `useReducedMotion()` checkova po fajlu.
- Default `transition` znači da `<m.div animate={{ opacity: 1 }}>` nasljeđuje token bez ponavljanja.

### `primitives.tsx` — 4 funkcionalna primitiva
```tsx
<FadeUp delay?>      // ulazak skeleton → content (DURATION.base, 6px translate)
<CrossFade>          // toggle između dva stanja (DURATION.fast)
<ListItem layoutId>  // za reorder liste (backlinks, planner, palace)
<Presence>           // tanki AnimatePresence wrapper sa default exit-om
```

Nema više od 4. Ako neko poželi peti, plan se mijenja, ne fajl.

---

## 2. Migracija postojećih 36 fajlova (mehanička)

| Korak | Što | Kako |
|---|---|---|
| 2a | `import { motion } from "framer-motion"` → `import { m } from "framer-motion"` | sed sweep, 36 fajlova |
| 2b | `<motion.div>` → `<m.div>` | sed sweep |
| 2c | Ukloniti pojedinačne `transition={{ duration: X }}` koje se poklapaju sa default tokenom | grep + ručno |
| 2d | Ukloniti pojedinačne `useReducedMotion()` checkove — sada globalno | grep + ručno |

Rizik: `LazyMotion strict` baca grešku ako negdje ostane `motion.*` (umjesto `m.*`). To je željeno — ESLint pravilo blokira regresiju.

---

## 3. Funkcionalni dobici (ne nove animacije — bolje postojeće)

Svaka stavka zamjenjuje postojeću ad-hoc animaciju, ne dodaje novu površinu.

| Mjesto | Trenutno | Nakon | Zašto je funkcionalno |
|---|---|---|---|
| `ReviewCard` grade | fade in novog pitanja | horizontal slide u smjeru ocjene (Again←, Good→) | korisnik vizuelno potvrdi smjer ocjene, smanjuje miss-tap |
| `ZettelPreview` open | scale-in | `layoutId` cross-fade iz Explorer naslova | kontinuitet — vidi se da je to isti članak |
| `BacklinksPanel` reorder | re-render | `<m.li layout>` na izmjenu | bez "popovanja" novog backlinka, fokus ostaje |
| `CardOrgMode` drag | dnd-kit default | `EASE.spring` na drop | "physical" osjećaj, ne dekorativan |
| `OnboardingModal` step | fade | `CrossFade` sa fiksnom visinom | ne pomjera dugmad, ruka ostaje na CTA |
| `RouteTransition` | fade-up CSS | `m.div key={pathname}` sa `DURATION.base` | jedinstveno sa ostatkom, automatski reduced-motion |

**Nigdje ne dodajemo motion gdje ga nema.** Sidebar, sticky nav, KPI brojevi, Settings tabovi — ostaju CSS-only.

---

## 4. Što se UKLANJA

- `framer-motion` import u `ProgressRing.tsx` — to je SVG arc, ne treba motion (već imamo CSS animaciju i `useCountUp`).
- `motion` u `ForgettingCurve.tsx`, `DashboardChart.tsx`, `LazyChart.tsx`, `MyStats.tsx` (4 grafička fajla) — Recharts ima built-in `isAnimationActive`, framer je tu duplikat.
- `MnemonicTest*` (4 fajla) intro animacije > 300ms — skraćuju se na `DURATION.base` ili briše.

Procjena: **~10 fajlova ostaje bez framer importa** nakon čišćenja, **26 ostaje** ali sa `m.*` i tokenima.

---

## 5. ESLint zaštita regresije

Dodaje se pravilo u `eslint.config.js`:

```js
// W10 — Disciplinovan motion
{
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/lib/motion/**", "src/contexts/AppContext.tsx"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "framer-motion",
        importNames: ["motion", "MotionConfig", "LazyMotion"],
        message: "Use `m` (LazyMotion) and import tokens from @/lib/motion."
      }]
    }],
  },
},
```

`motion.*` u kodu trigeruje grešku; `m.*` prolazi. `MotionProvider` smije importovati pune simbole.

---

## 6. Bundle i performanse — očekivani efekat

- **-25 KB gzip** sa eager motion paketa (LazyMotion + tree-shake).
- **0 KB dodatih** — sve već postoji.
- Smanjen broj re-rendera u Review sesiji (CrossFade ima fiksnu visinu → bez layout thrash).
- `reducedMotion="user"` → korisnici sa OS postavkom dobijaju instant tranzicije, bez ručnog koda.

---

## 7. Redoslijed implementacije (4 inkrementa, bez velikog PR-a)

1. **Tokeni + MotionProvider + ESLint pravilo** (1 fajl novi, AppContext mountuje, eslint update). Validacija: app radi, postojeći `motion.*` baca lint warning.
2. **Migracija `motion.*` → `m.*` u 36 fajlova** + uklanjanje per-file `useReducedMotion`. Mehanička, sed-driven.
3. **Brisanje motion importa iz 10 fajlova** gdje je dekorativan (grafovi, ProgressRing, intro screens).
4. **Funkcionalna nadogradnja (sekcija 3, 6 mjesta)** — jedan po jedan, sa QA na preview-u.

Nakon koraka 4 — update memory: `mem://style/motion-discipline-v1` sa tokenima i pravilima.

---

## Tehnička sažeta lista promjena

- Novi: `src/lib/motion/{tokens,MotionProvider,primitives,index}.ts(x)`
- Dirano: `src/contexts/AppContext.tsx` (wrap children u `MotionProvider`)
- Dirano: 36 fajlova (`motion` → `m`)
- Obrisano: framer importi iz ~10 fajlova
- Dirano: `eslint.config.js` (W10 pravilo)
- Dirano: 6 fajlova za funkcionalne nadogradnje (sekcija 3)
- Memorija: `mem://technical-choices/performance-optimization-v5` se ažurira (framer NIJE uklonjen, sada je disciplinovan); novi memo `mem://style/motion-discipline-v1`

Nema novih dependency-ja. Nema novih dekorativnih površina. Bundle pada, regresija je blokirana lintom.