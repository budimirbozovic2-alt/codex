import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { Card } from "@/lib/spaced-repetition";
import { default as Play } from "lucide-react/dist/esm/icons/play";
import { default as Pause } from "lucide-react/dist/esm/icons/pause";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as ChevronLeft } from "lucide-react/dist/esm/icons/chevron-left";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as Gauge } from "lucide-react/dist/esm/icons/gauge";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Eye } from "lucide-react/dist/esm/icons/eye";
import { default as Type } from "lucide-react/dist/esm/icons/type";
import ScrollableRow from "@/components/ScrollableRow";
import InfoPanel from "@/components/InfoPanel";
import DOMPurify from "dompurify";

const WPM_OPTIONS = [100, 150, 200, 250, 300, 400, 500];
const FONT_SIZES = [
  { label: "S", value: "text-base" },
  { label: "M", value: "text-lg" },
  { label: "L", value: "text-xl" },
  { label: "XL", value: "text-2xl" },
];

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = DOMPurify.sanitize(html);
  return div.textContent || div.innerText || "";
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

const SPEED_READER_INFO = (
  <div className="space-y-3 text-sm">
    <div className="flex items-start gap-2"><Eye className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Highlighting režim</strong><p className="text-muted-foreground">Tekst se prikazuje u cijelosti, a trenutna riječ se ističe u zadanom tempu (WPM).</p></div></div>
    <div className="flex items-start gap-2"><Gauge className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Brzina čitanja</strong><p className="text-muted-foreground">Podesi WPM (riječi po minuti). Počni sporije pa postepeno ubrzavaj.</p></div></div>
    <div className="flex items-start gap-2"><BookOpen className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Izbor sadržaja</strong><p className="text-muted-foreground">Odaberi kategoriju i karticu čiji sadržaj želiš brzo čitati.</p></div></div>
  </div>
);

export default function SpeedReader() {
  const { cards, categories, subcategories } = useAppContext();

  // Filters
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);
  const [selCard, setSelCard] = useState<Card | null>(null);
  const [selSection, setSelSection] = useState(0);

  // Reader state
  const [wpm, setWpm] = useState(200);
  const [fontSize, setFontSize] = useState("text-xl");
  const [playing, setPlaying] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Filtered cards
  const filteredCards = useMemo(() => {
    let result = cards;
    if (selCat) result = result.filter(c => c.category === selCat);
    if (selSub) result = result.filter(c => c.subcategory === selSub);
    return result.filter(c => c.type !== "flash"); // Only essay cards with sections
  }, [cards, selCat, selSub]);

  const availableSubs = selCat ? (subcategories[selCat] || []) : [];

  // Current text content
  const currentText = useMemo(() => {
    if (!selCard) return "";
    const section = selCard.sections[selSection];
    if (!section) return "";
    return stripHtml(section.content);
  }, [selCard, selSection]);

  const words = useMemo(() => tokenize(currentText), [currentText]);

  // Reset on content change
  useEffect(() => {
    setCurrentWordIdx(0);
    setPlaying(false);
    wordRefs.current = [];
  }, [currentText]);

  // Timer
  useEffect(() => {
    if (playing && words.length > 0) {
      const interval = 60000 / wpm;
      timerRef.current = setInterval(() => {
        setCurrentWordIdx(prev => {
          if (prev >= words.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, interval);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, wpm, words.length]);

  // Scroll highlighted word into view
  useEffect(() => {
    const el = wordRefs.current[currentWordIdx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [currentWordIdx]);

  const handlePlayPause = useCallback(() => {
    if (words.length === 0) return;
    if (currentWordIdx >= words.length - 1) setCurrentWordIdx(0);
    setPlaying(p => !p);
  }, [words.length, currentWordIdx]);

  const handleReset = useCallback(() => {
    setPlaying(false);
    setCurrentWordIdx(0);
  }, []);

  const handlePrevWord = () => {
    setPlaying(false);
    setCurrentWordIdx(prev => Math.max(0, prev - 1));
  };

  const handleNextWord = () => {
    setPlaying(false);
    setCurrentWordIdx(prev => Math.min(words.length - 1, prev + 1));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); handlePlayPause(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); handlePrevWord(); }
      if (e.code === "ArrowRight") { e.preventDefault(); handleNextWord(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePlayPause]);

  const progress = words.length > 0 ? ((currentWordIdx + 1) / words.length) * 100 : 0;

  // ─── No card selected ──────────────────────────────
  if (!selCard) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-serif">Speed Reader</h2>
          <InfoPanel title="Speed Reader">{SPEED_READER_INFO}</InfoPanel>
        </div>

        {/* Category filter */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Odaberi kategoriju</span>
          <ScrollableRow>
            <button onClick={() => { setSelCat(null); setSelSub(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selCat ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              Sve
            </button>
            {categories.map(c => (
              <button key={c} onClick={() => { setSelCat(c); setSelSub(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selCat === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                {c}
              </button>
            ))}
          </ScrollableRow>

          {selCat && availableSubs.length > 0 && (
            <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
              <button onClick={() => setSelSub(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selSub ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Sve podkat.
              </button>
              {availableSubs.map(sc => (
                <button key={sc} onClick={() => setSelSub(sc)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${selSub === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {sc}
                </button>
              ))}
            </ScrollableRow>
          )}
        </div>

        {/* Card list */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Odaberi karticu ({filteredCards.length})
          </span>
          {filteredCards.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nema esejskih kartica za prikaz.</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {filteredCards.map(card => (
                <button
                  key={card.id}
                  onClick={() => { setSelCard(card); setSelSection(0); }}
                  className="w-full text-left p-3 rounded-lg border hover:border-primary/30 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5 text-xs text-muted-foreground">
                    <span>{card.category}</span>
                    {card.subcategory && <span>› {card.subcategory}</span>}
                    <span className="ml-auto">{card.sections.length} sekcija</span>
                  </div>
                  <p className="font-serif text-sm line-clamp-1">{card.question}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Reader mode ──────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelCard(null); setPlaying(false); }} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-serif">{selCard.question}</h2>
            <p className="text-xs text-muted-foreground">{selCard.category}{selCard.subcategory ? ` › ${selCard.subcategory}` : ""}</p>
          </div>
        </div>
        <InfoPanel title="Speed Reader" items={INFO_ITEMS} />
      </div>

      {/* Section tabs */}
      {selCard.sections.length > 1 && (
        <ScrollableRow>
          {selCard.sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setSelSection(i); setPlaying(false); setCurrentWordIdx(0); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selSection === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            >
              {s.title || `Sekcija ${i + 1}`}
            </button>
          ))}
        </ScrollableRow>
      )}

      {/* Controls bar */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Play controls */}
          <div className="flex items-center gap-2">
            <button onClick={handlePrevWord} disabled={currentWordIdx === 0} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={handlePlayPause} className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button onClick={handleNextWord} disabled={currentWordIdx >= words.length - 1} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={handleReset} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Resetuj">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* WPM selector */}
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {WPM_OPTIONS.map(w => (
                <button key={w} onClick={() => setWpm(w)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${wpm === w ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {w}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-1">WPM</span>
          </div>

          {/* Font size */}
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {FONT_SIZES.map(f => (
                <button key={f.label} onClick={() => setFontSize(f.value)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${fontSize === f.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Riječ {currentWordIdx + 1} / {words.length}</span>
            <span>{Math.ceil((words.length - currentWordIdx) / wpm)} min preostalo</span>
          </div>
        </div>
      </div>

      {/* Text display with highlighting */}
      <div className="rounded-xl border bg-card p-6 sm:p-8 min-h-[40vh] max-h-[60vh] overflow-y-auto">
        {words.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Ova sekcija nema tekstualni sadržaj.</p>
        ) : (
          <p className={`${fontSize} leading-relaxed font-serif select-none`}>
            {words.map((word, i) => (
              <span
                key={i}
                ref={el => { wordRefs.current[i] = el; }}
                className={`inline-block mr-[0.35em] py-0.5 px-0.5 rounded transition-all duration-150 cursor-pointer ${
                  i === currentWordIdx
                    ? "bg-primary text-primary-foreground scale-105 shadow-sm"
                    : i < currentWordIdx
                    ? "text-muted-foreground/60"
                    : "text-foreground"
                }`}
                onClick={() => { setCurrentWordIdx(i); setPlaying(false); }}
              >
                {word}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="flex justify-center">
        <p className="text-[10px] text-muted-foreground/50">
          Space = play/pause · ← → = prethodna/sljedeća riječ · Klikni na riječ za skok
        </p>
      </div>
    </div>
  );
}