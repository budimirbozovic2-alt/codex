

## Redizajn navigacije — "Laboratorija" mega menu

### Trenutno stanje
Nav bar ima 8 stavki + Baza podataka = 9 linkova, što je prenatrpano.

### Novi layout

**Glavni nav linkovi (5):**
1. Dashboard (/)
2. Učenje (/learn)
3. Konsolidacija (/review) — sa badge-om
4. **Laboratorija** — mega menu dugme (nije link)
5. Podešavanja (/settings)

**Laboratorija mega menu panel** (otvara se klikom):
Široki dropdown panel sa ikonama i opisima, organizovan u grid (2-3 kolone):
- Statistika (/stats) — BarChart3
- Dnevnik (/metacognitive) — BookOpen
- Mnemo radionica (/mnemonic) — Brain
- Strateški planer (/planner) — Target
- Kartice (/cards → /database) — BookOpen/Database
- Kategorije (/categories → /database) — FolderOpen

Panel se zatvara klikom van njega ili na neku stavku.

### Tehnički detalji

**Fajl: `src/components/TopNav.tsx`**
- Razdvojiti `NAV_ITEMS` na `PRIMARY_NAV` (4 direktna linka) i `LAB_ITEMS` (6 stavki u mega meniju)
- Dodati state `labOpen` za toggle panela
- Laboratorija dugme sa ikonom `FlaskConical` ili `Beaker`
- Mega panel: apsolutno pozicioniran, grid layout 2x3, svaka stavka ima ikonu + naziv + kratki opis
- Click-outside zatvara panel (useRef + useEffect)
- Ako je korisnik na nekoj od lab ruta, Laboratorija dugme ima active stil
- Podešavanja ostaje kao direktan link u nav baru

**Mobilni meni:**
- Isti flat layout kao dosad, samo sa grupom "Laboratorija" koja prikazuje sve pod-stavke uvučeno

**Fajl: `src/components/AppSidebar.tsx`**
- Ažurirati da prati istu strukturu (PRIMARY + Laboratorija grupa + Podešavanja)

