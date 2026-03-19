import { useState, useEffect } from "react";
import { loadMajorSystem, saveMajorSystem, DEFAULT_MAJOR_SYSTEM } from "@/lib/mnemonic-storage";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onBack: () => void;
}

export default function MajorSystemSettings({ onBack }: Props) {
  const [system, setSystem] = useState<Record<number, string>>(loadMajorSystem());

  const handleChange = (num: number, value: string) => {
    setSystem(prev => ({ ...prev, [num]: value }));
  };

  const handleSave = () => {
    saveMajorSystem(system);
  };

  const handleReset = () => {
    setSystem({ ...DEFAULT_MAJOR_SYSTEM });
    saveMajorSystem(DEFAULT_MAJOR_SYSTEM);
  };

  const hasChanges = JSON.stringify(system) !== JSON.stringify(loadMajorSystem());

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <h2 className="text-3xl font-serif">Mentalne tablice (Major sistem)</h2>
        <p className="text-muted-foreground mt-1">Prilagodi termine za brojeve 0–100.</p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-1 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 101 }, (_, i) => i).map((num) => (
            <div key={num} className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground w-8 text-right tabular-nums">{num}</span>
              <input
                value={system[num] || ""}
                onChange={(e) => handleChange(num, e.target.value)}
                className="flex-1 px-2 py-1 rounded border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={!hasChanges} className="flex-1">
          Sačuvaj izmjene
        </Button>
        <Button onClick={handleReset} variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" /> Podrazumijevano
        </Button>
      </div>
    </div>
  );
}
