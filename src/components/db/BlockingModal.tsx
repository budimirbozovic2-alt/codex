import { useEffect, useState } from "react";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { AlertCircle, MonitorOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hard-blocking modal that appears when IndexedDB is blocked by another tab.
 * This happens during schema upgrades.
 */
export default function BlockingModal() {
  const [isBlocked, setIsBlocked] = useState(false);
  const [tabCount, setTabCount] = useState(1);

  useEffect(() => {
    const unsubBlocked = eventBus.subscribe(EVENT_TYPES.DB_BLOCKED, () => {
      setIsBlocked(true);
    });

    const unsubUnblocked = eventBus.subscribe(EVENT_TYPES.DB_UNBLOCKED, () => {
      setIsBlocked(false);
    });

    // Update tab count display
    const interval = setInterval(() => {
      setTabCount(eventBus.getTabCount());
    }, 2000);

    return () => {
      unsubBlocked();
      unsubUnblocked();
      clearInterval(interval);
    };
  }, []);

  if (!isBlocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md transition-all animate-in fade-in duration-300">
      <div className="max-w-md w-full p-8 bg-card border shadow-2xl rounded-2xl text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-destructive/10 text-destructive animate-pulse">
            <AlertCircle className="h-12 w-12" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Akcija je blokirana</h2>
          <p className="text-muted-foreground leading-relaxed">
            Nova verzija aplikacije je dostupna. 
            <span className="font-semibold text-foreground block mt-1 text-lg">
              Molimo zatvorite sve ostale tabove ove aplikacije kako bi se podaci ažurirali.
            </span>
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 py-4 px-6 bg-muted/50 rounded-xl">
          <MonitorOff className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm">
            Detektovano otvorenih tabova: <span className="font-mono font-bold text-lg">{tabCount}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground justify-center">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Automatsko osvežavanje čim zatvorite ostale tabove...</span>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => window.location.reload()}
          >
            Pokušaj ponovo ručno
          </Button>
        </div>
      </div>
    </div>
  );
}
