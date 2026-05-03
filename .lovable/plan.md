
# Plan: Optimizacija Export/Import-a + preseljenje na Dashboard

## 1. Duboka analiza trenutnog stanja

**Lokacija**: `Settings → SystemTab` → `ExportImportDialog` (503 linija) → koristi `useCardExport` + `useCardImport`.

**Logika (jaki dijelovi)**
- Zod `BackupSchema` validacija + sanitizacija (XSS).
- Atomic overwrite za cards+categories u `db.transaction`.
- Remap kategorija po imenu (idRemap) prije persistanja kartica/sources/mnemonics.
- Legacy v1 (string[] kategorije) podržan + `resolveLegacyTaxonomyNames`.
- Whitelist + sanitizacija `localStorage` ključeva.
- Chunked JSON serijalizacija (500 cards/chunk) za export.
- ZIP kompresija preko worker-a.
- Electron native save/open dialog kad je dostupan.

**Pronađeni problemi (logic/UX/UI)**

| # | Sloj | Problem |
|---|------|---------|
| L1 | Logic | `downloadFile` je `async` ali se u `useCardExport` poziva bez `await` (pravi race ka `handleOpenChange(false)` u dialogu — toast “uspješno” se može vidjeti prije nego korisnik potvrdi save dialog, a ako otkaže — toast i dalje kaže success). |
| L2 | Logic | `IPC_SIZE_LIMIT_MB = 50` — pri prelasku tiho prekida (`return`) bez bacanja greške; pozivalac misli da je gotovo. |
| L3 | Logic | `handleExportTemplate/Full` u dialogu zatvara modal u `finally` čak i kad export pukne — greška se proguta (nema toast.error u catch blokovima exporta). |
| L4 | Logic | Validacija fajla u `ExportImportDialog` parsira JSON 2x (jednom za pre-validaciju, drugi put u `useCardImport`) — duplo CPU/RAM za velike backupove. |
| L5 | Logic | Pre-validacija ne koristi `BackupSchema` (zod) — divergencija pravila između dialoga i import hook-a. |
| L6 | Logic | `handleImport` koristi `setInterval` lažni progres (5%/300ms) jer `importData` ne emitira progres — korisnik ne zna šta se događa kod 10k+ kartica. |
| L7 | Logic | Velike file operacije rade na main threadu (parse + zod + sanitize 50MB JSON-a zamrzava UI). Worker postoji samo za zip i docx. |
| L8 | Logic | `compress` toggle se resetuje pri svakom otvaranju (`reset()`); bolja UX je perzistirati u `app-settings`. |
| L9 | Logic | Nema “Preview” diff-a (koliko će novih/preskočenih/prepisanih) prije konflikt-strategije — broj duplikata prikazan, ali ne i posljedice po strategiji. |
| L10 | Logic | Auto-backup nigdje ne stoji — postoji samo `setLastBackupTime`, ali nema schedulera ni podsjetnika na dashboardu. |
| UX1 | UX | Tok “menu → export → exporting” ima previše klikova; primary akcije (Quick Backup, Quick Restore) nedostaju. |
| UX2 | UX | Pri import-confirm nema “Šta će se desiti?” objašnjenja po strategijama (samo lista u conflict step-u). |
| UX3 | UX | Nema “Preuzmi posljednji backup ponovo” shortcut-a / istorije. |
| UX4 | UX | Progress poruke su mješavina Bos/Eng (“Pripremam uvoz…”, “Finalizacija...”); standardizovati. |
| UX5 | UX | Dialog nema “drag & drop” zone za fajlove (samo file picker). |
| UI1 | UI | Modal `sm:max-w-md` je previše uzak za conflict step (3 dugmadi sa dugim opisima se vertikalno zguraju). |
| UI2 | UI | Nema vizuelne razlike između destruktivnog “Prepiši sve” i bezbjednih opcija — sve izgledaju isto (`variant="outline"`). |
| UI3 | UI | `exporting` i `import-validating` koraci su identični skeleti — moglo bi se konsolidovati u jedan `<ProgressStep />` komponent. |
| UI4 | UI | Dashboard `ToolCards` su 2-kolone — dodavanje treće kartice traži regrid. |

## 2. Optimizacije/popravke koje implementiramo

A) **Logic fixes**
- L1/L3: `useCardExport` — vratiti `Promise<{saved: boolean}>` iz `downloadFile`, `await`-ovati i tek tada toast/close. Ako korisnik otkaže Electron save dialog → tihi return + dialog ostaje otvoren.
- L2: Veliki ZIP — umjesto silent return, baciti tipiziranu grešku + toast sa preporukom (split export po kategoriji).
- L4/L5: Konsolidovati validaciju — `ExportImportDialog` poziva novu utility funkciju `validateBackupFile(file)` u `src/lib/backup-validate.ts` koja koristi isti `BackupSchema`. `useCardImport.importData` prima već parsirani objekat (preko nove preload-data ručke) → samo jedan parse.
- L6: Dodati `onProgress` callback u `useCardImport.importData` (bulk operacije: cards 30%, categories 10%, sources/mindmaps 20%, idb tabele 30%, ls 10%) i prikazati pravi progres.
- L7: Premjestiti `JSON.parse` + zod parse u novi worker `src/workers/backup-parse-worker.ts` (preko `Comlink`-style postMessage). Glavni thread ostaje responzivan na 50MB+.
- L8: Perzistirati `compress` u `app-settings` (`backupCompressDefault`).

B) **UX/UI**
- UX1: U dialogu dodati “Brzi backup” dugme na top (1-klik full export sa zadnjim podešavanjima).
- UX2: U `import-confirm` prikazati dry-run summary: `+N novih, ~M preskočenih, !K prepisanih` po strategiji.
- UX3: Sačuvati posljednjih 5 backup metapodataka (datum, veličina, hash, naziv) u `db.settings` → istorija u dialogu (read-only lista za izvoz; restore radi samo iz fajla i dalje).
- UX4: Standardizovati sve poruke na bosanski (utility `BACKUP_MSG`).
- UX5: Drop-zone na “Import” kartici (desktop drag & drop preko `electronAPI.onFileDrop` + web fallback `ondrop`).
- UI1: Conflict step proširiti na `sm:max-w-lg`; destruktivnu opciju obojiti `border-destructive/40 hover:bg-destructive/5`.
- UI3: Zajednička komponenta `ProgressStep` (loader + Progress + msg).

C) **Backup health widget na Dashboard-u**
- Mali indikator (last backup age) u `BackupCard` (vidi #3) koji pulsira ako je >7 dana od zadnjeg backup-a.

## 3. Preseljenje iz Settings → Dashboard

**Cilj layout-a (desni rail Dashboard-a)**:
```text
┌──────────────────────────────────────┐
│  QuickActions (Ponovi dospjele)      │
├───────────────────┬──────────────────┤
│ Strateški planer  │   Statistika     │   ← postojeće ToolCards (2 col)
├───────────────────┴──────────────────┤
│ Backup & Restore  (full-width card)  │   ← NOVO
│  • Posljednji backup: prije 3 dana   │
│  • [Brzi izvoz]  [Uvoz / Više…]      │
└──────────────────────────────────────┘
```

Implementacija:
1. **Nova komponenta** `src/components/dashboard/BackupCard.tsx`:
   - `glass-card` u stilu `ToolCards`.
   - Lokalni `useState` za `dialogOpen`.
   - Koristi `useBackupActions()` (`exportData`, `exportTemplate`, `importData`).
   - Two CTA: “Brzi backup” (1-klik full ZIP) + “Više opcija…” (otvara `ExportImportDialog`).
   - “Posljednji backup” iz `getLastBackupTime()`.
2. **`Dashboard.tsx`**: ispod `<ToolCards />` u `<aside>` → `<BackupCard />`. (I u `EmptyState` grani `DashboardPage` isto.)
3. **`ToolCards.tsx`**: ostaje 2-kolone (Planer + Stats); ne gura backup unutra (čišća semantika).
4. **`SystemTab.tsx`**: ukloniti dugme “Export / Import” + `onOpenExportImport` prop. Tab čuva samo `HealthMonitor`. Po potrebi dodati napomenu “Backup je premješten na kontrolnu tablu” sa linkom (Link to="/").
5. **`SRSettingsPanel.tsx`**: ukloniti `exportImportOpen` state, `<ExportImportDialog />` mount, prop drilling u `SystemTab`.

## 4. Fajlovi koji se mijenjaju/kreiraju

**Novi**
- `src/lib/backup-validate.ts` — shared zod validacija + dry-run report.
- `src/workers/backup-parse-worker.ts` — off-main-thread parse + sanitize.
- `src/components/dashboard/BackupCard.tsx`
- `src/components/ExportImport/ProgressStep.tsx` (interna)

**Izmjene**
- `src/hooks/useCardExport.ts` — await downloadFile, error toast, persist compress.
- `src/hooks/useCardImport.ts` — `onProgress`, prihvaća pre-parsed objekat.
- `src/components/ExportImportDialog.tsx` — novi tok (Quick Backup, drag&drop, dry-run summary, lg width, destructive variant), koristi worker + shared validator, ProgressStep.
- `src/components/dashboard/ToolCards.tsx` — bez promjene strukture (samo verifikacija).
- `src/components/Dashboard.tsx` + `src/views/DashboardPage.tsx` — render `<BackupCard />`.
- `src/components/settings/SystemTab.tsx` — ukloniti backup sekciju.
- `src/components/SRSettingsPanel.tsx` — ukloniti dialog & state.
- `src/lib/storage.ts` — proširiti `setLastBackupTime` da pamti i veličinu/tip; dodati `getBackupHistory()`.
- `src/lib/app-settings.ts` — `backupCompressDefault`.

## 5. Backward compatibility & rizici

- `BackupSchema` ostaje isti (in/out wire format nepromijenjen — postojeći fajlovi se otvaraju).
- Worker se loaduje preko `?worker` Vite import-a (postoji presedan u `docx-worker`).
- Stari korisnici koji su navikli na lokaciju u Settings — kratki info banner u SystemTab-u 1 release.
- Drag & drop u Electron-u zahtijeva da `preload.cjs` ne blokira `dragover`; provjeriti i po potrebi dodati handler.

## 6. Test plan

- Vitest: novi `backup-validate.test.ts` (valid/invalid/legacy v1).
- Manuelni QA: full export 10k kartica (progres pravi; UI ne zamrzava), import sa ZIP/JSON, conflict strategije (newer/keep/overwrite), Electron save cancel ne pravi false success toast, dashboard “Brzi backup” radi, “Posljednji backup” se osvježi.
