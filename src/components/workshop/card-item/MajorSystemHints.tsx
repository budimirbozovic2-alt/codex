import { Hash, MapPin } from "lucide-react";
import { resolveNumber } from "@/lib/mnemonic-storage";

interface Props {
  numbers: { number: number; context: string }[];
  majorSystem: Record<number, string>;
}

export function MajorSystemHints({ numbers, majorSystem }: Props) {
  if (numbers.length === 0) return null;
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5" /> Major sistem — sugestije
      </p>
      <div className="space-y-1.5">
        {numbers.map(({ number, context }, idx) => {
          const resolved = resolveNumber(number, majorSystem);
          return (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <span className="font-mono font-bold text-primary min-w-[40px] text-right">{number}</span>
              <span className="text-foreground font-medium">= {resolved.term}</span>
              {resolved.location && (
                <span className="flex items-center gap-0.5 text-xs text-warning">
                  <MapPin className="h-3 w-3" /> {resolved.location}
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-auto truncate max-w-[200px]">„{context}"</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
