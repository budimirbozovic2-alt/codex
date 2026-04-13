import { Layers, BookMarked, Zap, HelpCircle } from "lucide-react";
import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/sources-storage";
import ScrollableRow from "@/components/ScrollableRow";
import InfoPanel from "@/components/InfoPanel";
import { stripHtml, type ContentSource } from "./speed-reader-constants";

const SPEED_READER_INFO = (
  <div className="space-y-3 text-sm">
    <div className="flex items-start gap-2"><Layers className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Čitaj podkategoriju</strong><p className="text-muted-foreground">Sve kartice se spajaju u kontinuirani tok teksta.</p></div></div>
    <div className="flex items-start gap-2"><BookMarked className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" /><div><strong>Čitaj izvor</strong><p className="text-muted-foreground">Kompletni zakonski tekst ili dokument u speed reader formatu.</p></div></div>
  </div>
);

export { SPEED_READER_INFO };

interface Props {
  uuidToName: Record<string, string>;
  categories: string[];
  filteredCards: Card[];
  filteredSources: Source[];
  availableSubs: string[];
  selCat: string | null;
  setSelCat: (v: string | null) => void;
  selSub: string | null;
  setSelSub: (v: string | null) => void;
  contentSource: ContentSource;
  setContentSource: (v: ContentSource) => void;
  wpm: number;
  startSubcategoryRead: () => void;
  startSingleCardRead: (card: Card) => void;
  startSourceRead: (source: Source) => void;
  onShowOnboarding?: () => void;
}

export default function SpeedReaderSelector({
  uuidToName, categories, filteredCards, filteredSources, availableSubs,
  selCat, setSelCat, selSub, setSelSub, contentSource, setContentSource,
  wpm, startSubcategoryRead, startSingleCardRead, startSourceRead, onShowOnboarding,
}: Props) {
  const totalWords = filteredCards.reduce((sum, c) => {
    return sum + c.sections.reduce((s2, sec) => s2 + stripHtml(sec.content).split(/\s+/).filter(Boolean).length, 0);
  }, 0);
  const estMinutes = Math.ceil(totalWords / wpm);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Zap className="h-6 w-6 text-primary" /> Speed Reader</h2>
          <p className="text-muted-foreground text-sm mt-1">Brzo čitanje kartica i izvora — treniraj brzinu i fokus</p>
        </div>
        <div className="flex items-center gap-1">
          <InfoPanel title="Speed Reader">{SPEED_READER_INFO}</InfoPanel>
          {onShowOnboarding && (
            <button
              onClick={onShowOnboarding}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
              title="Vodič za brzo čitanje"
              aria-label="Vodič za brzo čitanje"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Onboarding</span>
            </button>
          )}
        </div>
      </div>

      {/* Content source toggle */}
      <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 w-fit">
        <button onClick={() => setContentSource("cards")} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${contentSource === "cards" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Layers className="h-4 w-4" /> Kartice
        </button>
        <button onClick={() => setContentSource("sources")} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${contentSource === "sources" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <BookMarked className="h-4 w-4" /> Izvori
        </button>
      </div>

      {/* Category filter */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kategorija</span>
        <ScrollableRow>
          <button onClick={() => { setSelCat(null); setSelSub(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selCat ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            Sve
          </button>
          {categories.map(c => (
            <button key={c} onClick={() => { setSelCat(c); setSelSub(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selCat === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              {uuidToName[c] ?? c}
            </button>
          ))}
        </ScrollableRow>

        {contentSource === "cards" && selCat && availableSubs.length > 0 && (
          <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
            <button onClick={() => setSelSub(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selSub ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              Sve podkat.
            </button>
            {availableSubs.map(sc => (
              <button key={sc} onClick={() => setSelSub(sc)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${selSub === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                {uuidToName[sc] ?? sc}
              </button>
            ))}
          </ScrollableRow>
        )}
      </div>

      {contentSource === "cards" ? (
        <>
          {filteredCards.length > 0 && (
            <button onClick={startSubcategoryRead} className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 p-5 transition-colors group">
              <div className="flex items-center justify-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                    Čitaj {selSub ? `"${uuidToName[selSub] ?? selSub}"` : selCat ? `"${uuidToName[selCat] ?? selCat}"` : "sve kartice"} — {filteredCards.length} kartica
                  </p>
                  <p className="text-xs text-muted-foreground">{totalWords.toLocaleString()} riječi · ~{estMinutes} min pri {wpm} WPM</p>
                </div>
              </div>
            </button>
          )}

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ili odaberi pojedinačnu karticu ({filteredCards.length})</span>
            {filteredCards.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nema esejskih kartica za prikaz.</p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {filteredCards.map(card => {
                  const wc = card.sections.reduce((s, sec) => s + stripHtml(sec.content).split(/\s+/).filter(Boolean).length, 0);
                  return (
                    <button key={card.id} onClick={() => startSingleCardRead(card)} className="w-full text-left p-3 rounded-lg border hover:border-primary/30 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-2 mb-0.5 text-xs text-muted-foreground">
                        <span>{uuidToName[card.categoryId] ?? card.categoryId}</span>
                        {card.subcategoryId && <span>› {uuidToName[card.subcategoryId] ?? card.subcategoryId}</span>}
                        <span className="ml-auto">{card.sections.length} sek. · {wc} rij.</span>
                      </div>
                      <p className="text-sm font-medium line-clamp-1">{card.question}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Odaberi izvor za čitanje ({filteredSources.length})</span>
          {filteredSources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{selCat ? "Nema izvora u ovoj kategoriji." : "Nema učitanih izvora."}</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {filteredSources.map(source => {
                const text = stripHtml(source.htmlContent || "");
                const wc = text.split(/\s+/).filter(Boolean).length;
                const estMin = Math.ceil(wc / wpm);
                return (
                  <button key={source.id} onClick={() => startSourceRead(source)} className="w-full text-left p-3 rounded-lg border hover:border-primary/30 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-2 mb-0.5 text-xs text-muted-foreground">
                      <span>{uuidToName[source.categoryId] ?? source.categoryId}</span>
                      <span className="ml-auto">v{source.version} · {wc.toLocaleString()} rij. · ~{estMin} min</span>
                    </div>
                    <p className="text-sm font-medium line-clamp-1 flex items-center gap-2">
                      <BookMarked className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      {source.title}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
