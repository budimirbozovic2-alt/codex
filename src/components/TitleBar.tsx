import { Minus, Square, X, Copy } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useTitleBarContext } from "@/hooks/useUI";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Početna tabla",
  "/learn": "Učenje",
  "/review": "Konsolidacija",
  "/edit": "Uređivanje",
  "/categories": "Kategorije",
  "/settings": "Podešavanja",
  "/stats": "Statistika",
  "/planner": "Strateški planer",
};

function resolveRouteLabel(pathname: string, categoryName: string | null): string | null {
  if (pathname === "/") return null;
  const categoryMatch = pathname.match(/^\/category\/([^/]+)/);
  if (categoryMatch) return categoryName ?? "Kategorija";
  const subjectMatch = pathname.match(/^\/subject\/([^/]+)/);
  if (subjectMatch) return categoryName ?? "Predmet";
  for (const [prefix, label] of Object.entries(ROUTE_LABELS)) {
    if (prefix !== "/" && pathname.startsWith(prefix)) return label;
  }
  return null;
}

/**
 * Custom Electron title bar — replaces the system window frame.
 * Only renders window controls when Electron API is available.
 */
export default function TitleBar() {
  const api = window.electronAPI;
  const [maximized, setMaximized] = useState(false);
  const canControl = !!api;
  const { pathname } = useLocation();
  const { categoryRecords } = useCategoryData();
  const titleBarContext = useTitleBarContext();

  const categoryId = useMemo(() => {
    const match = pathname.match(/^\/(?:category|subject)\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const categoryName = useMemo(() => {
    if (!categoryId) return null;
    return categoryRecords.find(c => c.id === categoryId)?.name ?? null;
  }, [categoryId, categoryRecords]);

  const routeLabel = useMemo(
    () => resolveRouteLabel(pathname, categoryName),
    [pathname, categoryName],
  );

  const contextLine = titleBarContext ?? (routeLabel ? { label: routeLabel } : null);

  useEffect(() => {
    if (!api) return;
    api.windowIsMaximized().then(setMaximized);
    const unsub = api.onWindowMaximizedChanged(setMaximized);
    return unsub;
  }, [api]);

  const handleMinimize = useCallback(() => api?.windowMinimize(), [api]);
  const handleMaximize = useCallback(() => api?.windowMaximize(), [api]);
  const handleClose = useCallback(() => api?.windowClose(), [api]);

  return (
    <div
      className="flex items-center h-8 bg-background border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 pl-3 pr-4 min-w-0">
        <img
          src={`${import.meta.env.BASE_URL}app-logo.png`}
          alt="CODEX"
          className="h-4 w-4 rounded-full shrink-0"
          draggable={false}
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground shrink-0">
          CODEX
        </span>
        {contextLine && (
          <>
            <span className="text-muted-foreground/40 text-[10px] shrink-0">·</span>
            <span className="text-[11px] text-muted-foreground truncate max-w-[12rem]" title={contextLine.label}>
              {contextLine.label}
            </span>
            {contextLine.detail && (
              <>
                <span className="text-muted-foreground/40 text-[10px] shrink-0">·</span>
                <span
                  className="text-[11px] text-foreground/80 truncate max-w-[16rem]"
                  title={contextLine.detail}
                >
                  {contextLine.detail}
                </span>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          disabled={!canControl}
          className="h-full w-11 inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Minimiziraj"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          disabled={!canControl}
          className="h-full w-11 inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title={maximized ? "Vrati" : "Maksimiziraj"}
        >
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          onClick={handleClose}
          disabled={!canControl}
          className="h-full w-11 inline-flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Zatvori"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
