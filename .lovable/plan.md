# Theme Rebalance v1 — alternativne palete

Amber Focus (bazna) ostaje **netaknuta**. Doradjuje se 5 alternativnih tema da svaka ima jasan karakter, ispravan kontrast i različit accent od primary. Sve izmjene su lokalizovane u `src/index.css` (linije 125–598).

## Ciljevi

1. Razriješiti konflikte (Forest `success≡primary`, Rose `destructive≡primary`).
2. Podići karakter (Slate i Ocean trenutno djeluju desaturisano i bezlično).
3. Uvesti pravi `--accent` token različit od `--primary` (sekundarna brand boja).
4. Per-theme `--gold` (metal-akcent koji se slaže sa primary hue).
5. Standardizovati dark `--background` lightness (svi na 6–7%, sad varira 5–8%).

## Tehnički detalji — nove HSL vrijednosti

Format po temi: `primary → accent → gold | success | destructive` (svjetla/tamna varijanta gdje se razlikuje).

### Slate → "Graphite" (hladni monohrom + steel-blue accent)
- Light primary: `215 20% 35%` → `218 32% 28%` (dublji, težinski)
- Light accent (novo): `200 55% 45%` (steel-cyan, daje "tech" notu)
- Gold (silver): `220 8% 62%` light / `220 6% 72%` dark
- Success: `160 45% 38%` → `162 48% 36%` (više smaragd)

### Forest (rješava success/primary konflikt)
- Primary ostaje: `152 50% 32%` light / `152 55% 42%` dark
- Accent (novo, distinct): `38 70% 45%` (bronza, topla protivteža)
- **Success premjestiti na**: `145 55% 38%` (svjetliji lime-green, jasna razlika od duboke šumske primary)
- Gold (bronze): `32 65% 48%` light / `32 70% 55%` dark

### Ocean (pojačati morsku dubinu)
- Primary: `210 65% 42%` → `205 70% 40%` (više cijan)
- Accent (novo): `175 55% 42%` (teal, sekundarni morski ton)
- Muted/secondary: dodati blagi cijan tint (`200 18% 93%` umjesto `210 14% 95%`)
- Gold ostaje pravi gold: `43 74% 49%`

### Rose → "Bordeaux" (rješava destructive/primary konflikt)
- Primary: `346 55% 45%` → `345 60% 42%` (dublji bordo)
- Accent (novo): `25 70% 55%` (terakota, topli kontrast)
- **Destructive premjestiti na**: `5 75% 50%` (jasni crveni-narandžasti, ne više magenta)
- Gold (rose-gold): `15 55% 60%` light / `15 60% 68%` dark

### Midnight (light mode reidentifikacija)
- Light primary: `245 50% 48%` → `250 45% 38%` (deeper royal, manje "default indigo")
- Accent (novo): `270 50% 55%` (suptilan violet pomak)
- Dark mode ostaje (taj radi)
- Gold (platinum): `220 10% 68%` light / `220 8% 78%` dark

## Strukturne izmjene

1. **Per-tema `--accent` ≠ `--primary`** — dodaje se prava sekundarna boja u svakoj od 5 alt tema.
2. **Per-tema `--gold`** — uklanja se hardkod `43 74% 49%` iz alt tema; svaka dobija svoj "metal".
3. **Dark `--background` standardizacija** — sve teme na lightness 6–7% (Amber `8%` ostaje jer je default i radi).
4. **Sidebar tokens** — auto-prate nove primary/accent vrijednosti unutar svake teme.

## Šta NIJE u scope-u

- Amber tema (light + dark) — ostaje 1:1.
- Ne dodaju se nove teme.
- Ne mijenjaju se `--radius`, `--shadow-*`, surface step tokeni, ni tipografija.
- Ne diraju se komponente — sve ide isključivo kroz tokene u `index.css`.
- Ne mijenja se theme selector UI ni storage (već radi).

## Verifikacija nakon implementacije

- Vizuelni check kroz preview: prebaciti redom svih 6 tema u light i dark, otvoriti Dashboard, CardList, ReviewCard, Settings.
- Provjeriti da Destructive dugme (Delete kartice) nije zamjenjivo sa Primary.
- Provjeriti success indikatore (FSRS retrievability ringovi) — u Forest temi moraju biti jasno odvojeni od primary zelene.
- Update `mem://style/color-palette` sa novim per-theme vrijednostima.

## Rizik

Nizak. Sve su CSS token izmjene unutar postojeće `[data-theme="..."]` strukture. Komponente koje koriste `bg-primary`, `text-accent`, `--gold` automatski preuzimaju nove vrijednosti. Nema breaking promjena u API-ju.
