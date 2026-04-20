

## Plan: Estetski redizajn `SessionFilters` — kartica "Filteri" sa jasnom hijerarhijom

### Dijagnoza (šta tačno škripi vizuelno)

`SessionFilters.tsx` u `max-w-xl` kontejneru renderuje:
1. Red 1: "TIP" label + 3 pilla + separator + "Često na ispitu" badge — sve `flex-wrap`, često se prelama.
2. Red 2: "KATEGORIJA" label
3. Red 3: Pillovi kategorija (veći, `text-xs`, sa count badge)
4. Red 4 (kondicional): Pillovi potkategorija sa **lijevim border-om** `border-l-2 border-primary/20` (manji, `text-[11px]`)
5. Red 5 (kondicional): Pillovi glava sa **dvostrukim indent-om** + drugim border-om (još svjetliji)

**Problemi:**
- 3 različite veličine pilova (`text-xs` / `text-[11px]` / `text-[11px]` + 3 različite boje pozadina) → vizuelni šum.
- Indent kroz `pl-3` / `pl-6` + lijevi border → izgleda kao "ručno crtana stabla", ne kao moderan UI.
- Nema vizuelnog grupisanja — sve plivaju jedno ispod drugog.
- "TIP" i "Često na ispitu" su u potpuno drugom stilu (neki imaju label, neki nemaju).

### Rješenje: jedan `glass-card` kontejner sa 2 jasne sekcije

```
┌─ FILTERI ──────────────────────────── 12 / 47 modula ─┐
│                                                        │
│  Tip:  [ Sve ] [ Esejska ] [ Blic ]    🔥 Često (8)    │
│                                                        │
│  ─────────────────────────────────────────────         │
│                                                        │
│  Predmet                                               │
│  [ Sve ]  [ KMP · 23 ]  [ KPP · 18 ]  [ GMP · 12 ] ▶  │
│                                                        │
│  Potkategorija    (pojavi se tek nakon izbora predmeta)│
│  [ Sve ]  [ Krivična djela ]  [ Sankcije ]         ▶  │
│                                                        │
│  Glava            (pojavi se tek nakon potkategorije) │
│  [ Sve ]  [ Glava I ]  [ Glava II ]  [ Glava III ] ▶  │
└────────────────────────────────────────────────────────┘
```

**Konkretne izmjene u `SessionFilters.tsx`:**

1. **Wrap u `glass-card rounded-xl p-5 space-y-4`** umjesto golog `space-y-3` → daje mu "kontejner" identitet usklađen sa Mode karticama iznad.

2. **Header sa naslovom i brojačem** (gore desno: `{filteredCount} / {totalCount}`) — korisnik odmah vidi efekat svojih filtera. (Brojač se može računati u parent komponenti i proslijediti, ali pošto već imamo `cards` prop, izračunamo ga lokalno na osnovu trenutnih izbora.)

3. **Ujednačena veličina pilova** — sve `text-xs` (ne miješati `text-[11px]`), iste paddinge `px-3 py-1.5`, ista boja pozadine.

4. **Eliminisati lijevi border + indent** — umjesto toga koristiti **sekciju sa labelom iznad** ("Predmet" / "Potkategorija" / "Glava") u istoj veličini i hijerarhiji. Vizuelna hijerarhija dolazi od **redoslijeda i razmaka**, ne od indent-a.

5. **Suptilan separator** (`<div className="h-px bg-border" />`) između "Tip + Često" reda i "Predmet" sekcije — razdvaja semantičke grupe.

6. **Konzistentna estetika selekcije** — svi nivoi koriste isti `bg-primary text-primary-foreground` za aktivni pill (umjesto kategorija = solid primary, potkategorija = primary/15, glava = primary/10). Hijerarhija dolazi od **pozicije**, ne od opadajućeg intenziteta boje koji djeluje kao "izblijeđeni klon".

7. **Count badge samo na predmetima** (najgornji nivo), ne i na potkat/glavama — manje vizuelnog šuma na nižim nivoima.

8. **Zadržati `ScrollableRow`** za horizontalno skrolanje pilova — funkcionalnost ostaje.

9. **Zadržati `framer-motion` `layoutId` animacije** za glatku tranziciju aktivnog pilla.

### Šta NE diram

- Logika filtriranja, sort po `sortOrder`, scoping — netaknuto.
- `FilterSetup.tsx` (Učenje) i `ReviewSetup.tsx` (Konsolidacija) — koriste `SessionFilters` kroz iste propove, automatski dobijaju novi izgled.
- "Tag" filter ne postoji u Učenje/Konsolidacija (samo u CategoryView) — neće biti dodavan.

### Fajl

- `src/components/SessionFilters.tsx` — refaktor cijele JSX strukture, ~80 linija. Logika i propovi nepromijenjeni.

**Ukupno: 1 fajl, 0 breaking change-a, čista UI iteracija.**

