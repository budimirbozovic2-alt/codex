import { Film, Type } from "lucide-react";
import type { MnemonicCard } from "@/lib/mnemonic-storage";

interface Props {
  card: MnemonicCard;
  enumItemsLen: number;
  onUpdate: (updates: Partial<MnemonicCard>) => void;
}

/** Hook mode selector + matching editor (mental video OR acronym). */
export function HookEditor({ card, enumItemsLen, onUpdate }: Props) {
  const promote = (patch: Partial<MnemonicCard>) =>
    onUpdate({
      ...patch,
      mnemonicStatus: card.mnemonicStatus === "new" ? "in-workshop" : card.mnemonicStatus,
    });

  return (
    <>
      {/* Mode toggle */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Kuka:</span>
        <button
          onClick={() => onUpdate({ hookMode: "video" })}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            card.hookMode === "video" ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <Film className="h-3 w-3" /> Mentalni video
        </button>
        <button
          onClick={() => onUpdate({ hookMode: "acronym" })}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            card.hookMode === "acronym" ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <Type className="h-3 w-3" /> Akronim
        </button>
      </div>

      {card.hookMode === "video" && (
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5 text-primary" /> Mentalni video
          </label>
          <textarea
            value={card.mnemonicVideo}
            onChange={(e) => promote({ mnemonicVideo: e.target.value })}
            placeholder="Opiši živopisnu mentalnu scenu koja ti pomaže da zapamtiš ovu informaciju..."
            className="w-full min-h-[80px] px-3 py-2 rounded-lg border bg-background text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {card.hookMode === "acronym" && (
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Type className="h-3.5 w-3.5 text-primary" /> Akronim / Mentalna kuka
            {enumItemsLen >= 2 && (
              <span className="text-xs text-muted-foreground ml-1">({enumItemsLen} slova potrebno)</span>
            )}
          </label>
          <input
            value={card.acronym}
            onChange={(e) => promote({ acronym: e.target.value })}
            placeholder={
              enumItemsLen >= 2
                ? `Unesite akronim od ${enumItemsLen} slova`
                : "Npr. kratka reč, broj iz Major Sistema, asocijacija..."
            }
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {enumItemsLen >= 2 && card.acronym.length > 0 && card.acronym.length !== enumItemsLen && (
            <p className="text-xs text-warning">⚠ Akronim ima {card.acronym.length} slova, a nabrajanje ima {enumItemsLen} stavki</p>
          )}
        </div>
      )}
    </>
  );
}
