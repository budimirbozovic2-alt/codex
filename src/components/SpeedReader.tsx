import { ChevronLeft, Layers, BookMarked, FileText } from "lucide-react";
import ScrollableRow from "@/components/ScrollableRow";
import InfoPanel from "@/components/InfoPanel";
import { useSpeedReaderEngine } from "@/hooks/useSpeedReaderEngine";
import SpeedReaderSelector, { SPEED_READER_INFO } from "@/components/speed-reader/SpeedReaderSelector";
import SpeedReaderControls from "@/components/speed-reader/SpeedReaderControls";
import SpeedReaderDisplay from "@/components/speed-reader/SpeedReaderDisplay";

interface SpeedReaderProps {
  onShowOnboarding?: () => void;
  initialCategoryId?: string;
}

export default function SpeedReader({ onShowOnboarding, initialCategoryId }: SpeedReaderProps) {
  const engine = useSpeedReaderEngine(initialCategoryId);

  // ─── Selection screen ──────────────────────────────
  if (!engine.readerActive) {
    return (
      <SpeedReaderSelector
        onShowOnboarding={onShowOnboarding}
        uuidToName={engine.uuidToName}
        categories={engine.categories}
        filteredCards={engine.filteredCards}
        filteredSources={engine.filteredSources}
        availableSubs={engine.availableSubs}
        selCat={engine.selCat}
        setSelCat={engine.setSelCat}
        selSub={engine.selSub}
        setSelSub={engine.setSelSub}
        contentSource={engine.contentSource}
        setContentSource={engine.setContentSource}
        wpm={engine.wpm}
        startSubcategoryRead={engine.startSubcategoryRead}
        startSingleCardRead={engine.startSingleCardRead}
        startSourceRead={engine.startSourceRead}
      />
    );
  }

  // ─── Reader mode ──────────────────────────────
  const activeSegIdx = engine.segments.findIndex(s => s === engine.activeSegment);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={engine.exitReader} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            {engine.readMode === "source" && engine.selSource ? (
              <>
                <h2 className="text-xl font-medium flex items-center gap-2">
                  <BookMarked className="h-5 w-5 text-primary" />
                  {engine.selSource.title}
                </h2>
                <p className="text-xs text-muted-foreground">{engine.uuidToName[engine.selSource.categoryId] ?? engine.selSource.categoryId} · v{engine.selSource.version} · {engine.totalWords.toLocaleString()} riječi</p>
              </>
            ) : engine.readMode === "subcategory" ? (
              <>
                <h2 className="text-xl font-medium flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  {engine.selSub ? (engine.uuidToName[engine.selSub] ?? engine.selSub) : (engine.selCat ? engine.uuidToName[engine.selCat] : null) || "Sve kartice"}
                </h2>
                <p className="text-xs text-muted-foreground">{engine.selectedCards.length} kartica · {engine.totalWords.toLocaleString()} riječi</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-medium">{engine.selCard?.question}</h2>
                <p className="text-xs text-muted-foreground">{engine.uuidToName[engine.selCard?.categoryId ?? ""] ?? engine.selCard?.categoryId}{engine.selCard?.subcategoryId ? ` › ${engine.uuidToName[engine.selCard.subcategoryId] ?? engine.selCard.subcategoryId}` : ""}</p>
              </>
            )}
          </div>
        </div>
        <InfoPanel title="Speed Reader">{SPEED_READER_INFO}</InfoPanel>
      </div>

      {/* Card-level navigator */}
      {engine.readMode === "subcategory" && engine.selectedCards.length > 1 && (
        <ScrollableRow>
          {engine.selectedCards.map((card, ci) => {
            const isActive = engine.activeSegment?.cardIndex === ci;
            const isPast = engine.activeSegment ? engine.activeSegment.cardIndex > ci : false;
            const firstSeg = engine.segments.find(s => s.cardIndex === ci);
            return (
              <button
                key={card.id}
                onClick={() => { if (firstSeg) { engine.setCurrentWordIdx(firstSeg.globalStartIdx); engine.setPlaying(false); } }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : isPast ? "text-muted-foreground/50 bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary-foreground/20" : "bg-secondary"}`}>{ci + 1}</span>
                <span className="max-w-[180px] truncate">{card.question}</span>
              </button>
            );
          })}
        </ScrollableRow>
      )}

      {/* Segment navigator */}
      {engine.segments.length > 1 && (
        <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
          {engine.segments.filter(s => !engine.activeSegment || s.cardIndex === engine.activeSegment.cardIndex).map((seg) => {
            const segIdx = engine.segments.indexOf(seg);
            const isActive = segIdx === activeSegIdx;
            return (
              <button key={segIdx} onClick={() => engine.jumpToSegment(segIdx)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="max-w-[140px] truncate">{seg.sectionTitle}</span>
              </button>
            );
          })}
        </ScrollableRow>
      )}

      {/* Controls */}
      <SpeedReaderControls
        playing={engine.playing}
        currentWordIdx={engine.currentWordIdx}
        totalWords={engine.totalWords}
        wpm={engine.wpm}
        setWpm={engine.setWpm}
        fontSize={engine.fontSize}
        setFontSize={engine.setFontSize}
        progress={engine.progress}
        ttsEnabled={engine.ttsEnabled}
        setTtsEnabled={engine.setTtsEnabled}
        ttsMode={engine.ttsMode}
        setTtsMode={engine.setTtsMode}
        ttsSettings={engine.ttsSettings}
        showTtsSettings={engine.showTtsSettings}
        setShowTtsSettings={engine.setShowTtsSettings}
        voices={engine.voices}
        updateTtsSettings={engine.updateTtsSettings}
        stopTts={engine.stopTts}
        handlePlayPause={engine.handlePlayPause}
        handleReset={engine.handleReset}
        handlePrevWord={engine.handlePrevWord}
        handleNextWord={engine.handleNextWord}
      />

      {/* Display */}
      <SpeedReaderDisplay
        segments={engine.segments}
        activeSegment={engine.activeSegment}
        currentWordIdx={engine.currentWordIdx}
        setCurrentWordIdx={engine.setCurrentWordIdx}
        setPlaying={engine.setPlaying}
        fontSize={engine.fontSize}
        totalWords={engine.totalWords}
        wordRefs={engine.wordRefs}
      />

      {/* Keyboard hint */}
      <div className="flex justify-center">
        <p className="text-[10px] text-muted-foreground/50">
          Space = play/pause · ← → = prethodna/sljedeća riječ · Klikni na riječ za skok
        </p>
      </div>
    </div>
  );
}
