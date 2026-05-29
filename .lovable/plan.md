
## Cilj

1. Generisati brendirane CODEX ikonice u svim formatima koje electron-builder traži (`.ico` za Windows, `.icns` za macOS, `.png` za Linux), tako da `npm run dist:win` / `dist:mac` više ne pucaju na "missing icon".
2. Splitovati glavni `App-*.js` chunk (~1.05 MB / 335 KB gz) ispod 500 KB preko `build.rollupOptions.output.manualChunks` u `vite.config.ts`.

---

## Dio 1 — CODEX ikonice

### Dizajn

Konzistentno sa već postojećim brendingom (memory: *Visual Identity v2* — midnight navy CODEX icon):
- Pozadina: midnight navy (`#0F172A` / tamna varijanta već u temi).
- Glif: bijelo "C" sa serifnim/zakošenim "X" overlayem, ili monogram "CX". Predlažem zatvoreni krug + bijeli "CODEX" monogram u centru — čitljivo i na 16×16.
- Bez gradienta na malim veličinama (zbog kompresije u `.ico` 16/24/32/48).

### Generisanje (build mode)

1. `imagegen--generate_image` (premium, transparent_background=false) na 1024×1024 → `build/icon-source.png` (master).
2. Iz mastera napraviti sve potrebne veličine pomoću ImageMagick-a (kroz `nix run nixpkgs#imagemagick`):
   - `public/app-icon.ico` — multi-size `.ico` (16, 24, 32, 48, 64, 128, 256).
   - `build/app-icon.icns` — preko `png2icns` (`nix run nixpkgs#libicns`) iz seta 16/32/64/128/256/512/1024 png-ova.
   - `build/icon.png` — 512×512 za Linux AppImage.
   - `public/app-logo.png` — 256×256, zamjenjuje postojeći logo u `TitleBar.tsx` (ostaje ista putanja, samo svježa verzija).
   - `public/favicon.png` — 64×64 (opciono, za dev preview).
3. Update `electron-builder` configa u `package.json`:
   - `win.icon: "public/app-icon.ico"` — već postavljen, samo fajl sad postoji.
   - `mac.icon: "build/app-icon.icns"` — već postavljen.
   - Dodati `linux.icon: "build/icon.png"` (ako Linux target postoji nakon prethodne odluke; ako ne, preskočiti).

### Verifikacija

- `file public/app-icon.ico` → potvrda multi-resolution ICO.
- `file build/app-icon.icns` → potvrda ICNS magic bytes.
- QA: konvertovati `.ico` natrag u PNG i vizuelno provjeriti 16/32/256 veličine (čitljivost na malim dimenzijama je čest problem).

---

## Dio 2 — App chunk split

### Trenutno stanje

`dist/assets/App-*.js` = 1.05 MB (gzip 335 KB). Sve eager-loaded biblioteke završavaju u jednom chunku jer Vite/Rollup po defaultu drži cijeli `node_modules` graf zajedno.

### Strategija — `manualChunks` funkcija

U `vite.config.ts` dodati `build.rollupOptions.output.manualChunks`:

```ts
build: {
  emptyOutDir: true,
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (!id.includes("node_modules")) return;
        if (id.includes("react-router")) return "vendor-router";
        if (id.match(/node_modules\/(react|react-dom|scheduler)\//))
          return "vendor-react";
        if (id.includes("@tanstack/react-query")) return "vendor-query";
        if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils"))
          return "vendor-motion";
        if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
        if (id.includes("@radix-ui")) return "vendor-radix";
        if (id.includes("dompurify") || id.includes("lucide-react"))
          return "vendor-ui-utils";
      },
    },
  },
},
```

### Zašto baš ovi chunkovi

- **vendor-react**: stabilan, rijetko mijenja → dugoročni cache hit.
- **vendor-router**: mali, ali odvojen radi cache stabilnosti.
- **vendor-query**: TanStack je centralni read-path, dijeli ga cijela app.
- **vendor-motion**: framer-motion je težak (~80 KB gz), koristi se na više mjesta.
- **vendor-charts**: recharts + d3-* su najteži single grupa (~100+ KB gz), koristi ih samo StatsPage → idealan kandidat za split (može čak biti i lazy preko `import()` u StatsPage, ali manualChunks već daje 90% benefita).
- **vendor-radix**: Radix primitivi su rasprostranjeni, ali grupisanje smanjuje duplikate.
- **vendor-ui-utils**: lucide ikone + DOMPurify; lucide tree-shake-uje, ali bundling ostatka pomaže.

Očekivani rezultat: App chunk pada na ~300-400 KB (gz ~100-130 KB), vendor chunkovi ~100-200 KB svaki, ispod 500 KB praga.

### Verifikacija

1. `bunx vite build` → provjeriti veličine u outputu.
2. Potvrditi da nema warninga `Some chunks are larger than 500 kB`.
3. Smoke test u preview-u (`/` ruta) — provjeriti da nema runtime grešaka oko duplikata React-a (zato je `dedupe: ["react", "react-dom"]` već u configu — ostaje).
4. Pokrenuti postojeće testove (`bunx vitest run`) — manualChunks ne dira test bundler, ali sanity check.

---

## Out of scope

- Bez promjena u Electron `.cjs` entry fajlovima.
- Bez Linux electron-builder targeta osim ako prethodno nije odobreno.
- Bez dirаnja `LabEditor` i drugih već-lazy ruta — one su već split-ovane.

## Fajlovi koji se mijenjaju

- `vite.config.ts` — dodati `rollupOptions.output.manualChunks`.
- `package.json` — eventualno dodati `linux.icon` u `build` config.
- **Novi fajlovi**: `public/app-icon.ico`, `build/app-icon.icns`, `build/icon.png`, `build/icon-source.png`, `public/app-logo.png` (overwrite), opciono `public/favicon.png`.
