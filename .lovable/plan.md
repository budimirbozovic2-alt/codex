

# Plan: 7 poboljšanja + uklanjanje "Nova" iz navigacije

## Pregled promjena

### 1. Uklanjanje "Nova" iz navigacije
- Ukloniti stavku `{ key: "create", ... }` iz `navItems` niza u `Index.tsx`
- Dugme "Nova" već postoji unutar `cards` pogleda, to je dovoljno

### 2. Heatmap kalendar aktivnosti (GitHub-style)
- Nova komponenta `src/components/ActivityHeatmap.tsx`
- Prikazuje 90-120 dana unazad kao mrežu malih kvadratića (7 redova × N kolona)
- Boje od sive (0 aktivnosti) do tamnozelene (mnogo aktivnosti) na osnovu `reviewLog`
- Dodati na Dashboard ispod statistika

### 3. Grafikon retencije
- Nova komponenta `src/components/RetentionChart.tsx`
- Linijski grafikon koji prikazuje prosječnu ocjenu po sedmici tokom vremena
- Koristi `reviewLog` podatke, grupiše po sedmicama, računa prosjek ocjena
- Dodati na Dashboard pored heatmapa

### 4. Pretraga kartica
- Dodati `searchQuery` state u `Index.tsx` (cards view)
- Input polje za pretragu iznad liste kartica
- `CardList` prima `searchQuery` prop i filtrira po tekstu pitanja i sadržaju sekcija (strip HTML, case-insensitive)

### 5. Markdown podrška (proširenje RichTextEditor)
- Dodati toolbar dugmad u `RichTextEditor.tsx`: lista (insertUnorderedList), numerisana lista (insertOrderedList), heading, italic, underline
- Proširiti toolbar sa 2 na ~6 dugmadi

### 6. Automatske reverse kartice za blic pitanja
- U `CardForm.tsx` dodati checkbox "Napravi i obrnuto pitanje" (podrazumijevano uključen)
- Kada se kreira blic kartica sa uključenim checkboxom, poziva se `onSaveFlash` dva puta: jednom normalno (Q→A) i jednom obrnuto (A→Q)
- Oznaka u `CardList` da je kartica "obrnuta"

### 7. Text-to-Speech (TTS)
- Nova utility `src/lib/tts.ts` sa `speak(text: string)` funkcijom koristeći `SpeechSynthesis` Web API
- Dugme sa ikonom zvučnika u `ReviewSession` (pored pitanja i odgovora) i `LearnSession`
- Strip HTML tagove prije čitanja

### 8. Dnevni cilj i streak
- Proširiti `SRSettings` sa `dailyGoal: number` (default: 20 ponavljanja)
- Nova storage stavka za streak podatke (`lastActiveDate`, `currentStreak`)
- Na Dashboardu: progress bar prema dnevnom cilju + streak counter sa ikonom vatre
- Streak se resetuje ako korisnik preskoči dan

## Fajlovi koji se mijenjaju

| Fajl | Promjena |
|------|----------|
| `src/pages/Index.tsx` | Ukloniti "Nova" iz nav, dodati search state, proslijediti heatmap/retention/streak na Dashboard |
| `src/components/Dashboard.tsx` | Integrisati heatmap, retention chart, streak/cilj widget |
| `src/components/ActivityHeatmap.tsx` | **NOVO** — GitHub-style heatmap |
| `src/components/RetentionChart.tsx` | **NOVO** — linijski grafikon retencije |
| `src/components/StreakWidget.tsx` | **NOVO** — dnevni cilj + streak |
| `src/components/CardList.tsx` | Primiti i primijeniti `searchQuery` |
| `src/components/CardForm.tsx` | Checkbox za reverse blic kartice |
| `src/components/ReviewSession.tsx` | TTS dugme |
| `src/components/LearnSession.tsx` | TTS dugme |
| `src/components/RichTextEditor.tsx` | Prošireni toolbar |
| `src/lib/tts.ts` | **NOVO** — TTS utility |
| `src/lib/spaced-repetition.ts` | Proširiti `SRSettings` sa `dailyGoal` |
| `src/lib/storage.ts` | Streak persistence (load/save) |
| `src/hooks/useCards.ts` | Streak logika, proslijediti nove podatke |
| `src/components/SRSettingsPanel.tsx` | Polje za dnevni cilj |

