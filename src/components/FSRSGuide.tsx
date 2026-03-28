import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  leechThreshold?: number;
}

export default function FSRSGuide({ leechThreshold = 5 }: Props) {
  return (
    <div className="space-y-4">
      {/* Grade effects summary */}
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3 space-y-1">
          <p className="font-medium text-destructive">Opet (1)</p>
          <p>Stabilnost pada na 10%. Težina +2.</p>
        </div>
        <div className="rounded-lg bg-warning/5 border border-warning/10 p-3 space-y-1">
          <p className="font-medium text-warning">Teško (2)</p>
          <p>Stabilnost ×1.5 + 0.5d. Težina +1.</p>
        </div>
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 space-y-1">
          <p className="font-medium text-primary">Dobro (3)</p>
          <p>Stabilnost ×3.0 + 1.0d. Težina ista.</p>
        </div>
        <div className="rounded-lg bg-success/5 border border-success/10 p-3 space-y-1">
          <p className="font-medium text-success">Lako (4)</p>
          <p>Stabilnost ×5.0 + 2.0d. Težina -1.</p>
        </div>
      </div>

      {/* FSRS deep dive */}
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          FSRS (<em>Free Spaced Repetition Scheduler</em>) je algoritam koji odlučuje <strong className="text-foreground">kada</strong> treba da ponoviš neku cjelinu.
          Cilj: ponavljaj <em>tačno prije nego što zaboraviš</em>.
        </p>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            🧱 Stabilnost (Stability)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pl-6 space-y-2">
            <p>Broj koji predstavlja <strong className="text-foreground">koliko dugo možeš zadržati informaciju</strong>, u danima.</p>
            <p>Ako je stabilnost = 10, nakon 10 dana imaš ~90% šanse da se prisjetiš.</p>
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p>🟢 "Dobro" ili "Lako" → stabilnost raste</p>
              <p>🔴 "Opet" → stabilnost drastično pada</p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            ⚖️ Težina (Difficulty)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pl-6 space-y-2">
            <p>Broj od <strong className="text-foreground">1 do 10</strong> — koliko ti je cjelina teška. Automatski se podešava.</p>
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p>"Opet" → težina +2 | "Teško" → +1.5 | "Dobro" → isto | "Lako" → -1</p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            📊 Retencija (Retrievability)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pl-6 space-y-2">
            <p><strong className="text-foreground">Vjerovatnoća da se sjećaš</strong> u ovom trenutku (0–100%).</p>
            <div className="rounded-lg bg-muted/50 p-3 text-xs">
              <p>Formula: <code className="bg-background px-1.5 py-0.5 rounded text-foreground">R = e^(-dani / stabilnost)</code></p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            🎯 Kako ocjene utiču na intervale
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pl-6 space-y-2">
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                <p className="font-medium text-destructive">❌ Opet (1)</p>
                <p>Stabilnost pada na 5%. Interval: <strong>20 min</strong>. Bilježi lapsus.</p>
              </div>
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1">
                <p className="font-medium text-warning">⚠️ Teško (2)</p>
                <p>Stabilnost pada na 30%. Interval: max 24h.</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                <p className="font-medium text-primary">✅ Dobro (3)</p>
                <p>Stabilnost × 3.0 + 1 dan. Standardna ocjena.</p>
              </div>
              <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1">
                <p className="font-medium text-success">🚀 Lako (4)</p>
                <p>Stabilnost × 5.0 + 2 dana. Instant recall.</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            🚨 Leech (problematične cjeline)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pl-6 space-y-2">
            <p>Nakon {leechThreshold} padova na istoj cjelini, sistem je označava kao <em>leech</em>.</p>
            <p>Signal da trebaš promijeniti pristup: preformuliši pitanje, dodaj mnemonik, razbi na manje dijelove.</p>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            💡 Praktični savjeti
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pl-6 space-y-2">
            <ul className="space-y-1.5 list-disc list-inside text-xs">
              <li>"Dobro" je podrazumijevana ocjena</li>
              <li>"Lako" samo kad je prisjećanje trenutno</li>
              <li>U dilemi — radije "Teško" nego "Dobro"</li>
              <li>20 kartica dnevno &gt; 100 jednom sedmično</li>
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
