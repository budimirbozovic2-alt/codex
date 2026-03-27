import { MonumentSVG } from "@/components/gamification/monument-buildings";
import type { BuildingType, MaterialTier } from "@/lib/forum-logic";

const BUILDINGS: BuildingType[] = ['amphitheatrum','basilica','tabularium','rostra','curia','macellum','argentaria','templum','arcus','insula'];
const LABELS: Record<string, string> = {
  amphitheatrum: "Amfiteatar", basilica: "Bazilika", tabularium: "Arhiv",
  rostra: "Govornica", curia: "Senat", macellum: "Tržnica",
  argentaria: "Blagajna", templum: "Hram", arcus: "Slavoluk", insula: "Blok"
};
const TIERS: MaterialTier[] = ['wood','brick','stone','marble','gold'];

export default function BuildingShowcase() {
  return (
    <div className="min-h-screen bg-[#0a0a14] p-8">
      <h1 className="text-2xl font-display text-gold text-center mb-8">Monumenti — Sve zgrade</h1>
      <div className="space-y-12">
        {BUILDINGS.map(b => (
          <div key={b} className="space-y-3">
            <h2 className="text-lg font-display text-foreground/80 tracking-wide">{LABELS[b]}</h2>
            <div className="flex gap-6 flex-wrap">
              {TIERS.map(t => (
                <div key={t} className="flex flex-col items-center gap-2">
                  <div className="w-[200px] h-[160px] bg-[#12122a] rounded-lg border border-white/5 flex items-center justify-center" id={`building-${b}-${t}`}>
                    <MonumentSVG buildingType={b} tier={t} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
