
# Ambient trackovi umjesto generičkog šuma u ZenMode-u

## Pristup
Statički `.mp3` fajlovi (~3-4MB svaki) u `public/audio/`, lazy-loadani tek kad korisnik odabere track. Postojeći API (`start/stop/setVolume/isPlaying`) ostaje isti — samo se unutrašnja implementacija proširuje.

## Trackovi (4 komada, generisani via imagegen ili unaprijed pripremljeni)
1. **Brown Noise** — zadržati postojeći proceduralni generator (0 KB, instant)
2. **Kiša** — `rain-ambient.mp3`
3. **Šuma** — `forest-ambient.mp3`  
4. **Lo-fi hum** — `lofi-ambient.mp3`

## Promjene

### Fajl 1: `src/lib/brown-noise.ts` → `src/lib/ambient-audio.ts` (rename + proširenje)
- Dodati `type AmbientTrack = "brown" | "rain" | "forest" | "lofi"`
- Za `"brown"`: zadržati postojeći proceduralni generator (nema download-a)
- Za ostale: `fetch(`/audio/${track}.mp3`)` → `decodeAudioData` → `AudioBufferSourceNode` sa `loop=true`
- Keširati decoded buffer u `Map<string, AudioBuffer>` — drugi put instant
- API: `startAmbient(track, volume)`, `stopAmbient()`, `setAmbientVolume(v)`, `isAmbientPlaying()`
- Export stare funkcije kao aliase za backward compatibility

### Fajl 2: `src/components/ZenMode.tsx` (~15 linija promjena)
- Import novi API umjesto starog
- Dodati `Select` dropdown iznad volume slider-a sa 4 opcije (Brown šum, Kiša, Šuma, Lo-fi)
- State: `ambientTrack: AmbientTrack` (default "brown")
- Prilikom promjene track-a: stop → start novi
- Loading indikator dok se track fetch-uje (mali spinner pored naziva)

### Fajl 3: Audio fajlovi
- `public/audio/rain-ambient.mp3` — generisati
- `public/audio/forest-ambient.mp3` — generisati
- `public/audio/lofi-ambient.mp3` — generisati

## Pitanje
Audio fajlove trebam generisati. Mogu koristiti ElevenLabs Music API ako imaš API key podešen, ili mogu napraviti proceduralne generatore (poput postojećeg brown noise-a) za kišu/šumu/lo-fi — nema eksternih fajlova, 0 KB, instant. 

**Preporuka:** Proceduralni generatori za sva 4 zvuka — nema MP3 fajlova, nema latencije, nema bandwith-a. Svaki zvuk je ~20 linija koda.

## Fajlovi

| Fajl | Tip | Promjena |
|------|-----|----------|
| `src/lib/brown-noise.ts` | RENAME → `ambient-audio.ts` | Proširiti sa 4 tipa zvuka |
| `src/components/ZenMode.tsx` | EDIT | Track picker UI |

## Scope
- 1 rename+proširenje, 1 edit, ~80 linija neto
- Nema novih zavisnosti, nema eksternih fajlova
- Backward compatible (stare funkcije exportovane kao aliasi)
