import {
  Download, Settings2,
} from "lucide-react";
import React, {
  memo, useCallback, useEffect, useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ExportImportDialog from "@/components/ExportImportDialog";
import { useBackupActions } from "@/hooks/cards/useActions";
import { useCardCountAll } from "@/hooks/card/useCardsQuery";
import { getLastBackupTime } from "@/lib/backup/backup-metadata";
import { cn } from "@/lib/utils";

function formatAge(ts: number): { label: string; days: number } {
  if (!ts) return { label: "još nikada", days: Infinity };
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    const hours = Math.floor((Date.now() - ts) / (60 * 60 * 1000));
    return {
      label: hours <= 0 ? "upravo sada" : `prije ${hours}h`,
      days,
    };
  }
  if (days === 1) return { label: "prije 1 dan", days };
  return { label: `prije ${days} dana`, days };
}

interface BackupCardProps {
  variant?: "card" | "settings";
}

export const BackupCard = memo(function BackupCard({
  variant = "card",
}: BackupCardProps): React.ReactElement {
  const cardsCount = useCardCountAll();
  const {
    exportData,
    exportTemplate,
    importData,
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
  const isSettings = variant === "settings";

  const content = (
    <>
      {isSettings ? (
        <div className={cn("flex items-start gap-3", isSettings && "py-3.5")}>
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs text-muted-foreground")}>
              Posljednji backup:{" "}
              <span className={stale ? "text-warning font-medium" : "text-foreground/80"}>
                {age.label}
              </span>
              {never && (
                <span className="text-warning"> — preporučujemo izvoz</span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Posljednji backup:{" "}
          <span className={stale ? "text-warning font-medium" : "text-foreground/80"}>
            {age.label}
          </span>
          {never && (
            <span className="text-warning"> — preporučujemo izvoz</span>
          )}
        </p>
      )}

      {quickRunning ? (
        <div className={cn("space-y-2", isSettings && "pb-3.5")}>
          <Progress value={quickProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            {quickMsg}
          </p>
        </div>
      ) : (
        <div className={cn("flex flex-col gap-2", isSettings && "pb-3.5")}>
          <Button
            className="w-full gap-2"
            onClick={handleQuickBackup}
            disabled={cardsCount === 0}
            title={
              cardsCount === 0
                ? "Nema podataka za izvoz"
                : "Brzi pun backup (ZIP)"
            }
          >
            <Download className="h-4 w-4" />
            Brzi backup
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setDialogOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
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
        onImport={async (prepared, strategy, onProgress) => {
          await importData(prepared, strategy, onProgress);
          refreshLastBackup();
        }}
        cardsCount={cardsCount}
      />
    </>
  );

  if (isSettings) {
    return <div className="space-y-3">{content}</div>;
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Backup & vraćanje</h3>
      {content}
    </div>
  );
});
