## Premium UI — preostale preporuke

Tipografija, surface tokeni, sjenke, `animate-fade-up`, `hover-lift`, `text-display + tabular`, eyebrow labele, sticky-nav refinement, BackupCard/QuickActions i animacijski sloj su već uvedeni u prethodnim koracima. Plan ispod pokriva **samo ono što nedostaje** da dovršimo "premium" osjećaj.

---

### 1. Count-up animacije na KPI brojkama  (sekcija 4)
- Mini hook `useCountUp(value, { duration: 600, easing })` u `src/hooks/useCountUp.ts` — `requestAnimationFrame` petlja, `prefers-reduced-motion` respect, **bez** dodavanja motion lib.
- Primjena: `CoreStats.due`, `VelocityWidget.velocity`, `weakest.score %`, `ExamProgressBar` brojevi.
- Zadržati `.tabular` da skok cifara ne pomjera layout.

### 2. ProgressRing → radial-gradient + drop-shadow  (sekcija 5)
- `src/components/ProgressRing.tsx`: zamijeniti solid `stroke` sa `<defs><linearGradient/></defs>` (primary → primary-glow), dodati `filter: drop-shadow(0 2px 6px hsl(var(--primary)/0.25))`.
- Track stroke → `hsl(var(--surface-2))` umjesto `--muted`.
- Boja se mapira preko `mastery-color` tokena (zelena/žuta/crvena) — gradijent koristi `currentColor` + 70%-stop varijantu.

### 3. SettingsPage — vazduh + kompaktne kontrole  (sekcija 5)
- `SRSettingsPanel` i sve `*Tab.tsx` (`AlgorithmTab`, `PersonalizationTab`, `WorkflowTab`, `SubjectsTab`, `SystemTab`):
  - sekcije `space-y-6` → `space-y-10`
  - kartica `py-6` → `py-8`, `gap-4` → `gap-6`
  - svi `Input`/`Select`/`Button` u Settingsu → `h-9` (override preko className-a, ne globalno)
  - section heading → `.text-display text-xl` + `.text-eyebrow` iznad

### 4. OnboardingModal — premium first-impression  (sekcija 5)
- `src/components/onboarding/OnboardingModal.tsx` (i njegov tree):
  - Hero ilustracija/ikon header sa `bg-gradient-to-br from-primary/8 via-surface-2 to-transparent`
  - Naslov `.text-display text-4xl tracking-tighter`, podnaslov `.text-eyebrow` iznad
  - Step indikator: hairline progress (1px traka) umjesto dotova
  - Footer dugmad: primarno `shadow-elevated hover-lift pressable`, sekundarno ghost
  - Spring open animacija (CSS `cubic-bezier(0.34, 1.56, 0.64, 1)` 280ms)

### 5. Page-transition sloj  (sekcija 6)
- `src/components/RouteTransition.tsx`: thin wrapper koji slušajući `location.pathname` re-mountuje children sa `animate-fade-up` (0.22s).
- Umotati `<Routes>` u `App.tsx` (linija 96-128). Bez biblioteke, čisti CSS.
- `prefers-reduced-motion` → no-op.

### 6. Konsistentnost ikona — stroke sweep  (sekcija 7)
- Codemod-podržan ručni sweep: u `src/components/**` i `src/views/**`, **svim Lucide ikonama BEZ `strokeWidth` propa** dodati `strokeWidth={1.6}` (default 2 = pre-debelo).
- Iznimke: ikone unutar dugmadi `size="sm"` ostaju 2 zbog čitljivosti na malom.
- Procijenjeno ~60 tačaka — radi se ciljano u top-level layout/dashboard/zettelkasten/cards fajlovima.

### 7. Borderi: jeftin AI-look sweep  (sekcija 3 — preostalo)
- Globalni replace u **non-form, non-input** kontekstima: `border-border` (full opacity) → `border-hairline` ili `border-border/40`.
- Inpute/select/checkbox **ostavljamo** na punom border-u (čitljivost forme).
- Fokus na: `zettelkasten/*` (Explorer, Preview, Backlinks, EmbeddedMindMap), `AutoSplitDialog`, `MindMapPickerDialog`, `SubjectDashboard`.

### 8. Splash screen polish  (sekcija 7)
- `public/splash.html` (92 LOC trenutno):
  - Pozadinski radial-gradient `at 30% 20%, hsl(220 30% 16%) → hsl(220 40% 8%)`
  - Centrirani CODEX brand mark (SVG inline, gold accent stroke)
  - Pulse animacija na tagline-u (0.6 → 1 opacity, 1.6s ease), bez spinnera
  - `font-family: 'Fraunces', serif` za "CODEX" wordmark; tagline DM Sans 13px tracking +0.18em uppercase

### 9. Loading skeleton sweep  (sekcija 4)
- `src/components/ui/skeleton-premium.tsx` (već imamo `.skeleton-premium` utility) → React komponenta `<SkeletonRow lines={3} />` i `<SkeletonCard />`.
- Zamijeniti `Loader2` spinnere u top-3 mjesta: `Dashboard` initial load, `CategoryView` cards loader, `ZettelkastenView` index loader.

---

### Redoslijed implementacije
1. ProgressRing gradient + count-up hook  (najvidljiviji wow)
2. RouteTransition wrapper  (osjeti se odmah pri navigaciji)
3. SettingsPage spacing + h-9 controls
4. OnboardingModal
5. Stroke sweep + border sweep (ručno, ciljano)
6. Splash polish + skeleton sweep (cleanup)

### Tehničke odluke
- **Bez novih dependency-ja** — sve čistim CSS-om i RAF-om. Memory: framer-motion je već uklonjen (`performance-optimization-v5`), poštujemo.
- Sve nove CSS animacije idu u `src/index.css` ispod postojećih premium utility-ja.
- Sve nove utility klase poštuju `prefers-reduced-motion`.
- Tabular nums i `.text-display` se već automatski lance kroz utility — ne duplicirati.

### Što NE radimo
- Ne dodajemo motion library (poštujemo postojeću odluku).
- Ne diramo Electron preload/CSP.
- Ne mijenjamo postojeću palette/theme strukturu — samo nadograđujemo surface i hairline tokene koji već postoje.
- Ne refaktorišemo god-fajlove iz audita (`PassiveReader`, `backup-schema`) — to ide u zaseban refactor PR.
