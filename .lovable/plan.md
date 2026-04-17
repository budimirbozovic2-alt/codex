

# Deep Audit: Sigurnost — Runda 6

## Rezime

Audit pokriva 4 vektora: XSS injection u rendering layer-u, sanitizaciju import putanja, Electron IPC validaciju, i localStorage manipulaciju. Aplikacija ima **solidan defense-in-depth model** (DOMPurify na input/persist/render slojevima, IPC path whitelist, LS key whitelist, CSP, contextIsolation). Pronašao sam **6 konkretnih nalaza** — 2 srednja XSS rizika, 2 IPC/Electron, 1 import edge case, 1 informativni.

---

## XSS VEKTORI

### X1. `RichTextEditor` i `SourceContent` — paste image bez sanitizacije `data:` URL-a
**Fajlovi:** `RichTextEditor.tsx:235`, `SourceContent.tsx:49`

**Problem:** Pri paste-u slike iz clipboard-a, `FileReader.readAsDataURL(file)` proizvodi data URL koji se direktno injectuje preko `document.execCommand("insertHTML", false, \`<img src="${reader.result}" ...>\`)`. Iako `reader.result` proizilazi iz `Blob`-a (binary), MIME tip se ne validira striktno — `item.type.startsWith("image/")` propušta `image/svg+xml` koji može sadržavati JavaScript (`<svg onload=...>`).

**Rizik:** Korisnik kopira maliciozan SVG, paste-uje u editor → SVG sa script payload-om se snima kao data URL u kartici. Pri kasnijem render-u, `<img src="data:image/svg+xml;base64,...">` u Chromium-u **NE izvršava** script u img kontekstu, ali ako se ikad promijeni rendering na `<object>` ili inline SVG → XSS. Trenutno NIZAK rizik, ali defense-in-depth brisanje SVG-a iz dozvoljenih MIME tipova je trivijalno.

**Fix:** Striktna MIME whitelist — `["image/png","image/jpeg","image/gif","image/webp"]`.

### X2. `highlightKeyParts` — regex injection putem `keyParts`
**Fajl:** `lib/highlight-key-parts.ts:13-26`

**Problem:** `keyParts` se escape-uju regex specijalnim karakterima (linija 16), ali pattern dozvoljava `\\s+` zamjenu — dobro. Međutim, output (`<mark>` wrapped HTML) se na kraju sanitizira (linija 27) — **defense-in-depth je validan**. Provjerio sam: nema injekcije.

**Status:** **False positive** nakon detaljne analize — ostavljam kao info.

### X3. `SourceContent.enhanceHeadings` — `icon.innerHTML = '<svg...>'` direktno
**Fajl:** `SourceContent.tsx:77`

**Problem:** SVG ikonica se hardkoduje preko `innerHTML`. SVG je statičan, bez user input-a — **bezbjedan**. Ali pattern je krhak: ako neko u budućnosti parametrizuje ikonicu, otvara se vektor.

**Fix (preventivno):** Zamijeniti sa `createElementNS("http://www.w3.org/2000/svg", "svg")` API-jem ili JSX render kroz portal. Ne-hitno.

---

## IPC / ELECTRON

### I1. `save-file` IPC ne validira veličinu base64 payload-a
**Fajl:** `main.cjs:104-117`

**Problem:** `saveFile(filePath, base64Data)` prima base64 string bez ograničenja veličine. Maliciozan ili buggy renderer može poslati GB-skalu string → `Buffer.from(...)` alocira velike količine RAM-a u main procesu, blocking event loop, potencijalni OOM crash.

**Rizik:** Renderer je under naša kontrola (contextIsolation + sandbox = false), ali pravilo je IPC tretirati kao untrusted boundary.

**Fix:** Cap na input size:
```js
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
if (typeof base64Data !== 'string' || base64Data.length > MAX_FILE_SIZE * 1.4) {
  logCrash('save-file-too-large', filePath);
  return false;
}
```

### I2. `request-backup` IPC — nema upper bound na JSON size
**Fajl:** `electron/backup.cjs:88-93`

**Problem:** `if (typeof jsonData === 'string' && jsonData.length > 2)` — donja granica postoji, ali nema gornje. Backup od 500MB (npr. nakon import-a velikih DOCX-a kao base64 slika) blokira disk write, može da zaglavi quit-backup timeout.

**Fix:** Cap na npr. 200MB i toast u rendereru ako prelazi.

---

## IMPORT SANITIZACIJA

### IM1. `data.localStorageData` whitelist — ključevi se podudaraju ali vrijednosti se ne validiraju shape-om
**Fajl:** `useCardImport.ts:306-314`

**Problem:** `ALLOWED_LS_KEYS` set je dobar (whitelist pristup), ali kad se vrijednost zapisuje:
```ts
localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
```
Ne validira se shape sadržaja. Maliciozan import može ubaciti `codex-app-settings: {"theme": "<script>alert(1)</script>"}` — kada `loadAppSettings` parsira i vrijednost se direktno ubacuje u DOM (npr. theme u CSS klasu), dolazi do CSS injection ili šire.

**Provjera:** `app-settings.ts` koristi value-e direktno za theme klase i fontove. Trenutno je render bezbjedan jer se klasa primjenjuje preko `setAttribute("data-theme", ...)`, ali vrijednost se ipak interpolira.

**Fix:** Per-key shape validacija (npr. theme mora biti enum `"amber"|"steel"|...`, brojevi su brojevi). Najjednostavnije: whitelist value-tipa po ključu.

### IM2. `data.sources[].htmlContent` se sanitira, ali `data.mindMaps` i `data.diary` se NE sanitiraju
**Fajl:** `useCardImport.ts:236-238, 251`

**Problem:** Sources su sanitizirani (linija 237), ali mindMaps node labels i diary entries nisu. Diary se renderuje preko `dangerouslySetInnerHTML`? Provjerio sam — diary nije rich-text, ali mindMap node-ovi mogu imati `description` polje koje se renderuje kao text. Ako se u budućnosti pređe na rich-text, vektor postoji.

**Fix:** Sanitizirati sve string vrijednosti u importovanim mindMaps i diary nizovima koje mogu sadržavati HTML, ili postaviti tekst-only render politiku eksplicitno u tipovima.

---

## LOCALSTORAGE MANIPULACIJA

### LS1. `ErrorBoundary` direktno parsira localStorage bez veličinske kontrole
**Fajl:** `ErrorBoundary.tsx:44`

**Problem:** `JSON.parse(localStorage.getItem(LOG_KEY) || "[]")` — ako je log korumpiran ili napumpan na 5MB+ (npr. attacker via DevTools u dev modu), parse blokira UI thread. Postoji `MAX_ENTRIES` cap nakon parse-a, ali ne i pre.

**Fix:** Try-catch oko parse + size guard pre `JSON.parse`:
```ts
const raw = localStorage.getItem(LOG_KEY);
if (raw && raw.length > 1_000_000) { localStorage.removeItem(LOG_KEY); return; }
```

### LS2. `sr-tts-mode`, `sidebar:state` i sl. — bez validacije pri load-u
**Status:** Većina mjesta ima fallback (`saved === "wpm" ? "wpm" : "natural"`) — **dobro**. Provjerio sam `useSpeedReaderEngine`, `useSourceReaderStore`, `sidebar.tsx`, `MentalSkeleton` — svi imaju enum/type-narrowing fallback.

**Status:** **Bezbjedan**.

---

## ŠTO JE DOBRO

- DOMPurify na 3 sloja: input (`RichTextEditor`), persist (`useCardImport.migrateImported`), render (`sanitizeHtml` u svakom `dangerouslySetInnerHTML` ili `highlightKeyParts`).
- Electron `contextIsolation: true`, `nodeIntegration: false`, preload sa minimalnim API.
- IPC path whitelist (`isPathAllowed`) + dialog options whitelist (`sanitizeDialogOptions`).
- CSP header u produkciji (bez `'unsafe-eval'`).
- Single-instance lock + crash loop detection.
- ALLOWED_LS_KEYS whitelist na import-u (S1 fix iz prethodne runde).
- Cards i sources idu kroz `sanitizeHtml` pri importu.
- TTS koristi `ALLOWED_TAGS: []` da extract pure text (najsigurniji DOMPurify mode).
- App protocol `app://localhost` umjesto `file://` (stable origin, no opaque storage).

---

## Scope implementacije

**Prioritet 1 (sigurnosno hardening, ~25min):**
- X1: SVG MIME blacklist u paste handler-ima — `RichTextEditor.tsx`, `SourceContent.tsx` (~3 linije svaki)
- I1: Size cap na `save-file` IPC (~5 linija u `main.cjs`)
- I2: Size cap na `request-backup` IPC (~3 linije u `electron/backup.cjs`)

**Prioritet 2 (defense-in-depth, ~25min):**
- IM1: Per-key shape validacija za `localStorageData` import — minimalno za `codex-app-settings` (theme enum, font enum) (~15 linija)
- IM2: Sanitizirati string polja u importovanim mindMaps i diary (~8 linija)

**Prioritet 3 (preventivno, ~10min):**
- LS1: Size guard pre `JSON.parse` u ErrorBoundary (~3 linije)
- X3: Refaktor `enhanceHeadings` da koristi DOM API umjesto innerHTML (~10 linija) — ne-hitno, kozmetika

Ukupno: **5 fajlova** za Prioritet 1+2.

