

# UI usklađivanje i unapređenje

## 1. Unifikacija fonta — uklanjanje Cinzel-a

**Problem**: Aplikacija koristi dva fonta — DM Sans (tijelo) i Cinzel (`.imperial-title` za naslove). Cinzel se učitava sa Google Fonts, dodaje HTTP zahtjev i vizualno se razlikuje.

**Rješenje**:
- Ukloniti Cinzel import iz `index.html` (linija 15)
- Promijeniti `.imperial-title` u `src/index.css` (linija 713) da koristi samo `'DM Sans', sans-serif`
- Zadržati zlatnu boju, bold i tracking — naslovi ostaju vizualno istaknuti, ali u istom fontu

**Fajlovi**: `index.html`, `src/index.css`

---

## 2. Smanjenje zasićenosti crvene u temi Ruža

**Problem**: Ruža tema ima preintenzivnu crvenu na destructive elementima. Trenutne vrijednosti:
- Light: `--destructive: 0 68% 50%` i `--primary: 346 55% 45%`
- Dark: `--destructive: 0 55% 42%` i `--primary: 346 60% 55%`

**Rješenje**: Smanjiti saturation destructive boje i blago pomaknuti hue ka rozoj da se uklopi u temu:
- Light: `--destructive: 350 45% 48%` (mekša, rozikasta crvena)
- Dark: `--destructive: 350 40% 45%`

**Fajl**: `src/index.css` (linije 437-438, 483-484)

---

## 3. Usklađivanje info/help dugmadi sa ShortcutsHint

Trenutno stanje po modulu:

| Modul | HelpCircle (onboarding) | InfoPanel | ShortcutsHint |
|---|---|---|---|
| Dashboard | ✅ | ✗ | ✗ |
| Učenje (ModeSelector) | ✅ | ✗ | ✗ |
| Learn Session | ✗ | ✗ | ✅ |
| Konsolidacija (ReviewSetup) | ✅ | ✗ | ✗ |
| Review Session | ✗ | ✗ | ✅ |
| Statistika | ✗ | ✅ | ✗ |
| Dnevnik | ✗ | ✅ | ✗ |
| Planer | ✗ | ✅ | ✗ |
| Memorizacija | ✅ | ✗ | ✗ |
| Speed Reader | ✗ | ✅ | ✗ |
| Podešavanja | ✗ | ✗ | ✗ |

**Rješenje**: Svaki modul dobija i InfoPanel (kontekstualne informacije + prečice) i HelpCircle (onboarding vodič, prvi put automatski, poslije na klik). Konkretno, dodati ono što nedostaje:

- **Statistika, Dnevnik, Planer, Speed Reader**: Dodati HelpCircle dugme pored postojećeg InfoPanel-a sa onboarding modalima
- **Podešavanja**: Dodati InfoPanel sa objašnjenjem tabova
- **Dashboard**: Dodati InfoPanel sa prečicama
- Tamo gdje ima ShortcutsHint (Learn/Review sesije) — integrirati prečice u InfoPanel tooltip umjesto zasebnog komponenta (ili zadržati oba ako je korisno)

Kreirati 4 nova onboarding fajla:
- `src/components/StatsOnboarding.tsx`
- `src/components/MetacognitiveOnboarding.tsx`
- `src/components/PlannerOnboarding.tsx`
- `src/components/SpeedReaderOnboarding.tsx`

Svaki koristi postojeći `OnboardingModal` pattern sa 3-5 slide-ova.

---

## 4. Dodavanje prečica u InfoPanel gdje nedostaju

Proširiti InfoPanel sadržaj sa listom relevantnih tastaturnih prečica za svaki modul koji ih podržava — koristiti `<kbd>` stil konzistentan sa ShortcutsHint.

---

## 5. Dodatna UI/UX poboljšanja

- **Konzistentnost zaglavlja**: Svaka stranica koristi isti layout pattern: naslov lijevo, info/help dugmad desno u `flex items-center justify-between` — provjeriti i uskladiti sve module
- **Hover state**: Ujednačiti hover stil za sva icon-dugmad (`p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors`)
- **Aria labels**: Dodati `aria-label` na sva nova info/help dugmad

---

## Scope

- ~12 fajlova se mijenja/kreira
- 4 nova onboarding komponenta
- CSS promjene u 1 fajlu (`index.css`)
- HTML promjena u 1 fajlu (`index.html`)
- Bez funkcionalnih/logičkih promjena — čisto vizualno usklađivanje

