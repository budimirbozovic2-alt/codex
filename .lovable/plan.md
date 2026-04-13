

# Deep Audit: Electron Arhitektura — Greške i Uska Grla

## Rezime

Electron infrastruktura je solidna: custom `app://` protokol, crash recovery sa limitom, backup sistem sa timeout guardom, i čist preload API. Pronašao sam **9 konkretnih problema** — 2 sigurnosna, 3 uska grla, 2 greške u logici, i 2 optimizacije.

---

## KRITIČNI (sigurnost)

### K1. Path traversal u `save-file` i `read-file` IPC handlerima
**Problem:** `main.cjs:80-98` — `save-file` i `read-file` primaju proizvoljni `filePath` od renderera bez ikakve validacije. Maliciozni ili kompromitovani renderer može pisati/čitati bilo koji fajl na disku:
```js
// Renderer može poslati:
electronAPI.saveFile('/etc/passwd', base64Data)
electronAPI.readFile('/home/user/.ssh/id_rsa')
```
Iako je `contextIsolation: true`, ako renderer bude kompromitovan (XSS, maliciozni import), ovo je direktan pristup fajl sistemu.

**Fix:** Validirati da `filePath` počinje sa korisničkim direktorijumom (`app.getPath('documents')` ili `app.getPath('downloads')`):
```js
const allowedDirs = [app.getPath('documents'), app.getPath('downloads'), app.getPath('desktop')];
if (!allowedDirs.some(dir => path.resolve(filePath).startsWith(dir))) {
  return false; // ili null za read
}
```

### K2. `show-save-dialog` i `show-open-dialog` primaju nefiltrirane `options`
**Problem:** `main.cjs:68-78` — opcije za dialog se proslijeđuju direktno od renderera. Iako Electron dialog API nije direktno exploitable, proslijeđivanje nefiltriranih objekata iz renderera u native API je loša praksa.

**Fix:** Whitelist-ovati dozvoljene ključeve (`defaultPath`, `filters`, `properties`).

---

## USKA GRLA

### B1. `save-file` koristi sinkroni `writeFileSync` za potencijalno velike fajlove
**Problem:** `main.cjs:83` — `fs.writeFileSync` blokira main process event loop dok piše fajl. Za backup od 20-50MB, ovo može zamrznuti UI na 1-2s (window controls ne reaguju, IPC queue se blokira).

**Fix:** Zamijeniti sa `fs.promises.writeFile`:
```js
await fs.promises.writeFile(filePath, Buffer.from(cleanBase64, 'base64'));
```

### B2. `read-file` koristi sinkroni `readFileSync` — isti problem
**Problem:** `main.cjs:93` — čitanje velikog fajla blokira main process.

**Fix:** Zamijeniti sa `fs.promises.readFile`.

### B3. Backup `writeBackup` koristi sinkroni `writeFileSync`
**Problem:** `backup.cjs:53` — `fs.writeFileSync` za backup JSON (može biti 10-50MB). Main process je blokiran tokom pisanja.

**Fix:** Zamijeniti sa `await fs.promises.writeFile` i učiniti `writeBackup` async.

---

## GREŠKE U LOGICI

### G1. `before-quit` handler poziva `app.quit()` rekurzivno
**Problem:** `main.cjs:169-177`:
```js
app.on('before-quit', async (e) => {
  if (isQuitting) return;       // ← Guard radi samo jednom
  isQuitting = true;
  e.preventDefault();
  await backup.performBeforeQuitBackup();
  app.quit();                   // ← Ovo ponovo triggeruje 'before-quit'
});
```
Drugi put ulazi u handler, `isQuitting` je `true`, pa `return` — ali `e.preventDefault()` se NE poziva, pa quit prolazi. Ovo *funkcioniše* ali je fragilan pattern. Ako se `isQuitting` resetuje (npr. pri macOS re-open), backup se neće izvršiti.

**Fix:** Eksplicitno koristiti `app.exit(0)` umjesto `app.quit()` za finalni izlaz (zaobilazi `before-quit` event potpuno).

### G2. `ready-to-show` timer logika je konfuzna i potencijalno kontraproduktivna
**Problem:** `window.cjs:245-252`:
```js
win.once('ready-to-show', () => {
  setTimeout(() => {
    if (!appReady) {
      clearTimeout(fallbackTimer);         // Poništava 6s fallback
      setTimeout(showWindow, 3000);        // Čeka JOŠ 3s
    }
  }, 500);
});
```
Logika: ako `ready-to-show` fire-uje, čekaj 500ms, pa ako app nije ready, poništi 6s fallback i čekaj još 3s. Problem: `ready-to-show` se emituje kad je Chromium spreman za paint (obično ~1-2s). Ovo **produžava** čekanje od 6s na 3.5s od `ready-to-show`, što može biti DUŽE od originalnog 6s fallbacka. Neto efekat: nepredvidivo ponašanje zavisno od toga kad se `ready-to-show` emituje.

**Fix:** Ukloniti `ready-to-show` handler — `renderer-ready` IPC signal iz `useCardBootstrap` + 6s fallback su dovoljni.

---

## OPTIMIZACIJE

### O1. `cleanOldBackups` čita `statSync` za svaki fajl — nepotrebno
**Problem:** `backup.cjs:20-23` — za svaki backup fajl se radi `fs.statSync` da se dobije `mtimeMs`. Sa MAX_BACKUPS=3, ovo je zanemarljivo, ali fajlovi već imaju timestamp u imenu (`Codex_AutoBackup_2026_04_13...`).

**Fix:** Parsirati timestamp iz imena fajla umjesto `statSync`. Minor optimizacija.

### O2. `crashTimestamps` je globalni niz koji nikad ne oslobađa memoriju starijih zapisa
**Problem:** `window.cjs:79` — `crashTimestamps` filtrira pri svakom pozivu, ali akumulira se tokom životnog vijeka procesa. Za normalnu upotrebu ovo je zanemarljivo (max 3 entry-ja), ali pattern je nečist.

**Fix:** Zamijeni sa circular buffer od 3 elementa — trivijalna izmjena.

---

## Šta je DOBRO (ne treba mijenjati)

- `app://` custom protokol sa SPA fallback — odlično rješenje za IndexedDB persistenciju
- Crash recovery sa limitom (3 crashes / 60s) — sprečava beskonačni loop
- IPC handler cleanup pri crash recovery i window close — čist lifecycle management
- Single instance lock sa focus restore — standard pattern
- `sandbox: false` je potreban za preload.cjs — korektna konfiguracija
- Splash → main window tranzicija sa `renderer-ready` signalom
- Quit backup sa 5s timeout + race — ne blokira izlaz
- `contextIsolation: true` + `nodeIntegration: false` — ispravan security model
- preload.cjs path resolution sa candidate lista — robustan za različite build konfiguracije

---

## Scope implementacije

**3 fajla** (`main.cjs`, `electron/window.cjs`, `electron/backup.cjs`). Najvažniji su K1 (path validation ~10 linija) i B1-B3 (zamjena sync → async, ~5 linija svaka). Ukupno ~30min rada.

