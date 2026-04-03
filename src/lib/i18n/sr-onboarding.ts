/**
 * Onboarding i help sadržaj — odvojeno od glavnog rječnika jer su dugački tekstovi.
 */

export const srOnboarding = {
  app: {
    slides: [
      {
        title: "Dobrodošli u CODEX",
        content: "Inteligentni sistem za učenje koji se prilagođava tvom napretku. Evo kratkog pregleda ključnih funkcija.",
        bullets: [
          "Sve kartice se automatski raspoređuju po FSRS algoritmu",
          "Sistem prati stabilnost, težinu i greške za svaku cjelinu",
          "Tvoj cilj: savladaj gradivo kroz aktivno prisjećanje",
        ],
      },
      {
        title: "Kontrolna tabla",
        content: "Centralni pregled napretka sa dnevnim ciljem, streikom i preporukama.",
        bullets: [
          "Progres ispita, dnevni cilj i streak na jednom mjestu",
          "Idealni fokus — optimalan omjer novog i ponavljanog",
          "Statusne ikone upozoravaju na rizike i propuste",
        ],
      },
      {
        title: "Učenje",
        content: "Tri progresivna režima za savladavanje novog gradiva.",
        bullets: [
          "Slobodno učenje — čitaj bez pritiska",
          "Aktivno prisjećanje — reprodukuj iz sjećanja",
          "Metod lanca — gradi savršen niz ponavljanja",
        ],
      },
      {
        title: "Konsolidacija",
        content: "Ponavljaj kartice koje su spremne za utvrđivanje.",
        bullets: [
          "Fokusirano — svježe i pogrešne kartice",
          "Kritični pregled — optimalni momenat za ponavljanje",
          "Najteža pitanja — tvrdokorno gradivo zahtijeva posebnu pažnju",
        ],
      },
      {
        title: "Mapa znanja",
        content: "Vizuelni pregled savladanosti po kategorijama, podkategorijama i glavama.",
        bullets: [
          "Navigator — organizuj kartice po glavama drag-and-drop-om",
          "Auditor — heatmapa savladanosti sa detaljnim statistikama",
        ],
      },
      {
        title: "Memorizacija",
        content: "Mnemotehničke alate za teško pamtive informacije.",
        bullets: [
          "Mentalni video — vizuelizuj gradivo kroz žive scene",
          "Akronimi — napravi kratice od nabrajanja",
          "Major sistem — pretvori brojeve u riječi fonetskim kodom",
        ],
      },
      {
        title: "Statistika i analitika",
        content: "Detaljni uvid u tvoj napredak i kognitivne obrasce.",
        bullets: [
          "Krivulja zaboravljanja i predikcija retencije",
          "Kalibracija — koliko su tvoje ocjene precizne",
          "Efikasnost i latencija po sesijama",
        ],
      },
      {
        title: "Strateški planer i dnevnik",
        content: "Postavi ciljeve, prati disciplinu i reflektuj o svom učenju.",
        bullets: [
          "Definiši predmete, ciljeve i rokove",
          "Prati dnevnu disciplinu i kognitivni dug",
          "Dnevnik za metakognitivnu refleksiju",
        ],
      },
      {
        title: "Spreman si!",
        content: "Svaka sekcija ima svoje dugme za pomoć (?) sa detaljnijim uputstvima. Počni kreiranjem prve kartice ili uvozom iz dokumenta.",
        bullets: [
          "Klikom na ? u bilo kojoj sekciji dobijaš detaljni vodič",
          "Ctrl+K — brza globalna pretraga",
          "Backup podataka je dostupan u Bazi podataka (Export/Import)",
        ],
      },
    ],
    finishLabel: "Počni koristiti",
  },

  dashboard: {
    slides: [
      {
        title: "Kontrolna tabla",
        content: "Centralni pregled tvog napretka, ciljeva i preporuka — sve na jednom mjestu.",
        bullets: [
          "Dnevni cilj i streak prate tvoju disciplinu",
          "Progres ispita pokazuje koliko si daleko od cilja",
          "Widgeti se mogu uključiti/isključiti u podešavanjima",
        ],
      },
      {
        title: "Dnevni cilj i streak",
        content: "Prati koliko sekcija si danas obradio u odnosu na postavljeni cilj.",
        bullets: [
          "Progress bar pokazuje procenat ispunjenja dnevnog cilja",
          "Streak broji uzastopne dane sa barem jednom sesijom",
          "Kartice za prvo ponavljanje ukazuju na nepregledan materijal",
        ],
      },
      {
        title: "Idealni fokus",
        content: "Sistem automatski računa optimalan odnos novog i ponavljanog gradiva.",
        bullets: [
          "Što više naučiš, više vremena treba za ponavljanje",
          "Preporučeni omjer se prilagođava tvom napretku",
          "Stvarni omjer danas se prikazuje pored preporučenog",
        ],
      },
      {
        title: "Statusne ikone i upozorenja",
        content: "Crvene i žute ikone signaliziraju potencijalne probleme.",
        bullets: [
          "Rizik od zagušenja memorije — previše novog, premalo ponavljanja",
          "Kognitivni dug — propušteni dani se akumuliraju",
          "Upozorenja za backup i storage prostor",
        ],
      },
      {
        title: "Velocitet i najslabije kategorije",
        content: "Prati brzinu učenja i identificiraj oblasti koje zahtijevaju pažnju.",
        bullets: [
          "Velocitet (sekcija/dan) pokazuje prosječnu brzinu za 7 dana",
          "Trend strelica indicira da li ubrzavaš ili usporavaš",
          "Top 3 najslabije kategorije — fokusiraj se na njih",
        ],
      },
      {
        title: "Briefing i energetska preporuka",
        content: "Personalizovani savjeti bazirani na tvom rasporedu i napretku.",
        bullets: [
          "Dnevni briefing predlaže konkretne akcije za danas",
          "Energetski nivo se računa prema dobu dana",
          "Preporuka za vrstu aktivnosti (učenje, ponavljanje, dril)",
        ],
      },
    ],
    finishLabel: "Razumijem",
  },

  learn: {
    slides: [
      {
        title: "Tri režima učenja",
        content: "CODEX koristi progresivan sistem učenja — od pasivnog čitanja do aktivne produkcije znanja na glas.",
        bullets: [
          "Svaki režim odgovara drugom nivou spremnosti",
          "Počni od lakšeg i napreduj ka težem",
          "Fokus je na usmenoj reprodukciji, ne na pasivnom čitanju",
        ],
      },
      {
        title: "Slobodno učenje",
        level: "Lak",
        content: "Upoznaj se sa materijalom bez pritiska.",
        bullets: [
          "Čitaj pitanja i odgovore svojim tempom",
          "Otvori i zatvori sekcije po volji",
          'Označi pitanje kao "Pročitano" kad završiš',
          "Idealno za prvi kontakt sa novim gradivom",
        ],
      },
      {
        title: "Aktivno prisjećanje",
        level: "Srednji",
        content: "Pregledaj, a zatim reprodukuj iz sjećanja.",
        bullets: [
          "Faza 1: Pročitaj cijelo pitanje sa svim modulima",
          "Faza 2: Odgovori su skriveni — pokušaj ih ponoviti na glas",
          "Ocijeni svoje znanje od 1 do 4",
          "Samo ocjena 4 te pomjera na sljedeći modul",
          "Ocjena ispod 4 = ponovi taj modul odmah",
        ],
      },
      {
        title: "Metod lanca",
        level: "Teški",
        content: "Snowball tehnika — gradi lanac savršenih ponavljanja.",
        bullets: [
          "Savladaj modul N ocjenom 4",
          "Zatim ponovi cijeli niz od modula 1 do N",
          "Ako bilo koji modul u lancu ocijeniiš ispod 4 → vraćaš se na modul 1",
          "Napredak je nemoguć bez savršenog lanca",
          "Dostupno samo za esejska pitanja sa 3+ modula",
        ],
      },
      {
        title: "Spreman si!",
        content: "Tvoj napredak se automatski čuva. Ako izađeš usred učenja, nastavićeš tamo gdje si stao.",
        bullets: [
          "Ocjene se upisuju u FSRS sistem i utiču na buduća ponavljanja",
          "Savladana pitanja se označavaju zelenom bojom",
          "Preporučujemo: Slobodno → Aktivno → Lanac",
        ],
      },
    ],
    finishLabel: "Počni učenje",
  },

  review: {
    slides: [] as { title: string; content: string; bullets: string[] }[],
    finishLabel: "Razumijem",
  },
} as const;
