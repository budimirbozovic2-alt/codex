import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Download } from "lucide-react";

interface CrashEntry {
  timestamp: string;
  label: string;
  message: string;
  stack: string;
  componentStack: string;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Compact inline error for widgets/charts — doesn't take full height */
  compact?: boolean;
  /** Label shown in compact mode (e.g. "Grafikon aktivnosti") */
  label?: string;
  /** Called when user clicks "go home" — only in full mode */
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ""}]`, error, info.componentStack);
    try {
      const LOG_KEY = "memoria-crash-log";
      const MAX_ENTRIES = 50;
      const existing: CrashEntry[] = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      existing.push({
        timestamp: new Date().toISOString(),
        label: this.props.label || "unknown",
        message: error.message,
        stack: error.stack || "",
        componentStack: info.componentStack || "",
      });
      if (existing.length > MAX_ENTRIES) existing.splice(0, existing.length - MAX_ENTRIES);
      localStorage.setItem(LOG_KEY, JSON.stringify(existing));
    } catch (_) {}
    // IPC error logging (Electron only)
    try {
      window.electronAPI?.logError?.(`[${this.props.label || "unknown"}] ${error.message}\n${error.stack || ""}`);
    } catch (_) {}
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleEmergencyBackup = async () => {
    try {
      const { db } = await import("@/lib/db");
      const cards = await db.cards.toArray();
      const categories = await db.categories.toArray();
      const sources = await db.sources.toArray();
      const reviewLog = await db.reviewLog.toArray();
      const settings = await db.settings.toArray();

      const backup = {
        type: "emergency-backup",
        timestamp: new Date().toISOString(),
        cards,
        categories: categories.map(c => c.name),
        sources,
        reviewLog,
        settings,
      };

      const json = JSON.stringify(backup);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `memoria-emergency-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[EmergencyBackup] Failed:", e);
      alert("Backup nije uspio. Pokušajte ponovo.");
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    // Compact mode — inline card for widgets/charts
    if (this.props.compact) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {this.props.label || "Komponenta"} — greška
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {this.state.error?.message || "Neočekivana greška pri renderovanju"}
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Pokušaj ponovo
          </button>
        </div>
      );
    }

    // Full mode — page-level error with emergency backup
    return (
      <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-serif">Nešto je pošlo po zlu</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {this.state.error?.message || "Neočekivana greška"}
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={this.handleEmergencyBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-warning text-warning-foreground text-sm hover:opacity-90 transition-opacity"
          >
            <Download className="h-3.5 w-3.5" />
            Sačuvaj backup
          </button>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Pokušaj ponovo
          </button>
          {this.props.onNavigateHome && (
            <button
              onClick={this.props.onNavigateHome}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              Početna
            </button>
          )}
        </div>
        <details className="mt-2 text-xs text-muted-foreground max-w-md w-full">
          <summary className="cursor-pointer hover:text-foreground transition-colors">Tehnički detalji</summary>
          <pre className="mt-2 p-3 rounded-lg bg-secondary text-[11px] overflow-auto max-h-[150px] whitespace-pre-wrap break-words">
            {this.state.error?.stack || this.state.error?.message}
          </pre>
        </details>
      </div>
    );
  }
}
