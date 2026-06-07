import { 
  Database, Download, Settings2, ShieldCheck, AlertTriangle 
} from "lucide-react";
import React, { 
  memo, useCallback, useEffect, useState 
} from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ExportImportDialog from "@/components/ExportImportDialog";
import { 
  useBackupActions, useCardData 
} from "@/contexts/AppContext";
import { getLastBackupTime } from "@/lib/storage";

function formatAge(ts: number): { label: string; days: number } {
  if (!ts) return { label: "još nikada", days: Infinity };
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    const hours = Math.floor((Date.now() - ts) / (60 * 60 * 1000));
    return { 
      label: hours <= 0 ? "upravo sada" : `prije ${hours}h`, 
      days 
    };
  }
  if (days === 1) return { label: "prije 1 dan", days };
  return { label: `prije ${days} dana`, days };
}

export const BackupCard = memo(function BackupCard(): React.ReactElement {
  const { cards } = useCardData();
  const { 
    exportData, 
    exportTemplate, 
    importData 
  } = useBackupActions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState<number>(0);
  const [quickRunning, setQuickRunning] = useState(false);
  const [quickProgress, setQuickProgress] = useState(0);
  const [quickMsg, setQuickMsg] = useState("");

  const refreshLastBackup = useCallback(() => {
    getLastBackupTime().then(setLastBackup).catch(() => {});
  }, []);

  useEffect(() => { 
    refreshLastBackup(); 
  }, [refreshLastBackup]);

  const handleQuickBackup = useCallback(async () => {
    if (quickRunning) return;
    setQuickRunning(true);
    setQuickProgress(0);
    setQuickMsg("Priprema...");
    try {
      await exportData(true, (p, m) => { 
        setQuickProgress(p); 
        setQuickMsg(m); 
      });
      refreshLastBackup();
    } catch {
      // Greška je već obradjena unutar kuke
    } finally {
      setQuickRunning(false);
      setQuickProgress(0);
      setQuickMsg("");
    }
  }, [quickRunning, exportData, refreshLastBackup]);

  const age = formatAge(lastBackup);
  const stale = age.days >= 7;
  const never = !lastBackup;

  return (
    <div
      className="glass-card hover-lift rounded-xl p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div 
          className={
            `p-2.5 rounded-lg shrink-0 ` + 
            `${stale ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`
          }
        >
          {stale ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <ShieldCheck className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground">
            Backup &amp; vraćanje
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Posljednji backup:{" "}
            <span 
              className={
                stale ? "text-warning font-medium" : "text-foreground/80"
              }
            >
              {age.label}
            </span>
            {never && (
              <span className="text-warning"> — preporučujemo izvoz</span>
            )}
          </p>
        </div>
      </div>

      {quickRunning ? (
        <div className="space-y-2">
          <Progress value={quickProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            {quickMsg}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-2"
            onClick={handleQuickBackup}
            disabled={cards.length === 0}
            title={
              cards.length === 0 
                ? "Nema podataka za izvoz" 
                : "Brzi pun backup (ZIP)"
            }
          >
            <Download className="h-3.5 w-3.5" />
            Brzi backup
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => setDialogOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Više opcija
          </Button>
        </div>
      )}

      <ExportImportDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) refreshLastBackup();
        }}
        onExportTemplate={exportTemplate}
        onExportFull={async (compress, onProgress) => {
          await exportData(compress, onProgress);
          refreshLastBackup();
        }}
        onImport={async (file, strategy) => {
          await importData(file, strategy);
          refreshLastBackup();
        }}
        cardsCount={cards.length}
      />
    </div>
  );
});

export const BackupCardIcon = Database;