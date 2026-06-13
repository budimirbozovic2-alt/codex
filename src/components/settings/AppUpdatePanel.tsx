import { Download, RefreshCw, Rocket, AlertTriangle, CheckCircle2 } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppUpdater } from "@/hooks/useAppUpdater";

export const AppUpdatePanel = memo(function AppUpdatePanel() {
  const {
    supported,
    currentVersion,
    remoteVersion,
    status,
    progress,
    error,
    check,
    download,
    install,
  } = useAppUpdater();

  if (!supported) {
    return (
      <div className="glass-card rounded-xl p-5 space-y-2">
        <h3 className="text-sm font-semibold">Ažuriranje aplikacije</h3>
        <p className="text-xs text-muted-foreground">
          Automatska ažuriranja su dostupna samo u instaliranoj desktop verziji CODEX-a (ne u browseru niti u `npm run dev`).
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <Rocket className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold">Ažuriranje sa GitHub-a</h3>
          <p className="text-xs text-muted-foreground">
            Trenutna verzija: <span className="font-medium text-foreground/90">v{currentVersion}</span>
            {remoteVersion && remoteVersion !== currentVersion && (
              <> — dostupno: <span className="font-medium text-primary">v{remoteVersion}</span></>
            )}
          </p>
        </div>
      </div>

      {status === "downloading" && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">Preuzimanje… {progress}%</p>
        </div>
      )}

      {status === "not-available" && (
        <p className="text-xs text-success flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Koristite najnoviju verziju.
        </p>
      )}

      {status === "available" && (
        <p className="text-xs text-primary">
          Nova verzija je spremna za preuzimanje.
        </p>
      )}

      {status === "ready" && (
        <p className="text-xs text-success flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Ažuriranje preuzeto — restartujte aplikaciju da instalirate.
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => void check()}
          disabled={status === "checking" || status === "downloading"}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
          {status === "checking" ? "Provjeravam…" : "Provjeri ažuriranja"}
        </Button>

        {(status === "available") && (
          <Button size="sm" className="gap-2" onClick={() => void download()}>
            <Download className="h-3.5 w-3.5" />
            Preuzmi
          </Button>
        )}

        {status === "ready" && (
          <Button size="sm" className="gap-2" onClick={() => void install()}>
            <Rocket className="h-3.5 w-3.5" />
            Instaliraj i restartuj
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Ažuriranja se distribuiraju preko GitHub Releases. Aplikacija automatski provjerava novu verziju pri pokretanju.
      </p>
    </div>
  );
});
