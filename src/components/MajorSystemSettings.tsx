import { RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { loadMajorSystem, saveMajorSystem, DEFAULT_MAJOR_SYSTEM } from "@/lib/mnemonic-storage";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function MajorSystemSettings() {
  const [system, setSystem] = useState<Record<number, string>>(DEFAULT_MAJOR_SYSTEM);
  const [savedSystem, setSavedSystem] = useState<Record<number, string>>(DEFAULT_MAJOR_SYSTEM);

  useEffect(() => {
    loadMajorSystem().then(s => {
      setSystem(s);
      setSavedSystem(s);
    });
  }, []);

  const handleChange = (num: number, value: string) => {
    setSystem(prev => ({ ...prev, [num]: value }));
  };

  const handleSave = async () => {
    await saveMajorSystem(system);
    setSavedSystem({ ...system });
    toast.success("Izmjene sačuvane");
  };

  const handleReset = async () => {
    const next = { ...DEFAULT_MAJOR_SYSTEM };
    setSystem(next);
    await saveMajorSystem(next);
    setSavedSystem(next);
  };

  const hasChanges = (() => {
    const keys = new Set([...Object.keys(system), ...Object.keys(savedSystem)]);
    for (const k of keys) {
      const numKey = Number(k);
      if (system[numKey] !== savedSystem[numKey]) return true;
    }
    return false;
  })();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="imperial-title">Mentalne tablice (Major sistem)</h2>
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
