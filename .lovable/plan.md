## Cilj

U `CategoryView` (ekran koji renderuje `SourcesTab` na ruti `/category/:categoryId`) dodati jasan breadcrumb i kontekstualni indikator da je to dedicirani **Izvori (Reader/Editor)** ekran za taj predmet, kako bi korisnik uvijek znao gdje se nalazi i kako se vratiti na hub predmeta.

## Šta korisnik vidi

Iznad postojećeg `h1` naslova kategorije pojaviće se kompaktan red:

```text
[ ← ]  Predmeti  ›  {Naziv predmeta}  ›  Izvori        [ Otvoreno: Izvori predmeta ]
```

- "Predmeti" je link na početni dashboard (lista svih predmeta).
- Naziv predmeta je link na `SubjectDashboard` (`/subject/:categoryId`) — hub tog predmeta.
- "Izvori" je trenutna stranica (neaktivni tekst, `aria-current="page"`).
- Desno: mali pill/badge "Otvoreno: Izvori predmeta" sa ikonicom `BookOpen`/`FileText` koji jasno kaže da je u kontekstu otvoren samo Reader/Editor za taj predmet (a ne globalni izvori ili druge kartice).
- Lijevo strelica `←` (ikona `ArrowLeft`) kao prečica nazad na `SubjectDashboard`.

Postojeći `h1 {category.name}` i mastery bar ostaju netaknuti ispod breadcrumba.

## Tehničke izmjene

### 1. Nova komponenta `src/components/category/SourcesBreadcrumb.tsx`
Mala prezentaciona komponenta koja prima `categoryId` i `categoryName`. Renderuje:
- Back dugme (`Button variant="ghost" size="icon"`) → `navigate('/subject/${categoryId}')`.
- Breadcrumb segmenti koristeći postojeći shadcn `Breadcrumb` (`src/components/ui/breadcrumb.tsx` ako postoji; ako ne, koristiti jednostavan `nav` sa `ChevronRight` separatorima — provjeriti pri implementaciji).
  - "Predmeti" → `Link` na `/` (ili rutu liste predmeta — provjeriti u `App.tsx`).
  - `categoryName` → `Link` na `/subject/${categoryId}`.
  - "Izvori" → `BreadcrumbPage` (current).
- Desno: `Badge variant="secondary"` sa ikonom i tekstom "Otvoreno: Izvori predmeta", `title`/`tooltip` objašnjenje da edit/reader djeluju samo nad ovim predmetom.

### 2. Integracija u `src/views/CategoryView.tsx` (oko linije 87–92)
- Importovati novi `SourcesBreadcrumb`.
- Renderovati ga kao prvi child `space-y-6` containera, prije header bloka sa `h1`.
- Naslov `h1` ostaje (potvrda identiteta predmeta), ali se uklanja redundantnost time što breadcrumb daje navigacioni kontekst.

### 3. Bez izmjena u `SourcesTab.tsx`
Breadcrumb je odgovornost stranice (`CategoryView`), ne taba. Ovo poštuje postojeći Orchestrator pattern.

### 4. Pristupačnost
- `nav aria-label="Breadcrumb"`.
- Trenutna stranica `aria-current="page"`.
- Back dugme: `aria-label="Nazad na predmet"`.
- Badge ima `title` atribut sa punim objašnjenjem.

## Fajlovi

- **Novo:** `src/components/category/SourcesBreadcrumb.tsx`
- **Izmijenjeno:** `src/views/CategoryView.tsx` (dodan import + render breadcrumba iznad header bloka)

## Van opsega

- Ne mijenja se logika učitavanja/izmjene izvora.
- Ne dodaje se breadcrumb u druge `Subject*` rute (može u zasebnom koraku ako se traži konzistentnost).
- Ruta liste predmeta za prvi segment: ako u `App.tsx` ne postoji eksplicitna ruta "Predmeti", koristiće se `/` (root dashboard) — provjeriće se pri implementaciji.