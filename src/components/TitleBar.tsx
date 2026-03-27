import { useState, useEffect, useCallback } from "react";
import Minus from "lucide-react/dist/esm/icons/minus";
import Square from "lucide-react/dist/esm/icons/square";
import X from "lucide-react/dist/esm/icons/x";
import Copy from "lucide-react/dist/esm/icons/copy";
/**
 * Custom Electron title bar — replaces the system window frame.
 * Only renders in Electron (window.electronAPI exists).
 * Follows the app's dark/light theme via CSS variables.
 */
export default function TitleBar() {
  const api = window.electronAPI;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.windowIsMaximized().then(setMaximized);
    const unsub = api.onWindowMaximizedChanged(setMaximized);
    return unsub;
  }, [api]);

  const handleMinimize = useCallback(() => api?.windowMinimize(), [api]);
  const handleMaximize = useCallback(() => api?.windowMaximize(), [api]);
  const handleClose = useCallback(() => api?.windowClose(), [api]);

  if (!api) return null;

  return (
    <div className="flex items-center h-8 bg-background border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 pl-3 pr-4">
        <img
          src={`${import.meta.env.BASE_URL}logo-icon.png`}
          alt="CODEX"
          className="h-4 w-4 rounded-full"
          draggable={false}
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          CODEX
        </span>
      </div>

      {/* Spacer — draggable */}
      <div className="flex-1" />

      {/* Window controls */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="h-full w-11 inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Minimiziraj"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-11 inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={maximized ? "Vrati" : "Maksimiziraj"}
        >
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          onClick={handleClose}
          className="h-full w-11 inline-flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="Zatvori"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
