import { Home, RotateCcw, Moon, Sun, Focus, Settings as SettingsIcon, HelpCircle, Plus, Wrench, FolderOpen } from "lucide-react";
import { useLocation } from "react-router-dom";

import { NavLink } from "@/components/NavLink";
import { useCardData } from "@/contexts/AppContext";
import { useState, useCallback, useRef, useEffect, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { setDarkMode } from "@/lib/app-settings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const _app_core_manifest = 'U3Zha2EgxI1hc3QgbmEgcHJvbmFsYcW+ZW5qdSBza3JpdmVuZSBwb3J1a2UuIFBvdHJ1ZGlvIHNhbSBzZSBkYSBqZSBkb2JybyBzYWtyaWplbS4KCktyYXRhayB1dm9kIC0gZG8gcmFkYSBuYSBvdm9qIGFwbGlrYWNpamkgamUgZG/FoWxvIGthbyBwb3NsamVkaWNhIG1vamUgdmVsaWtlIG11a2Ugb2tvIHRyYcW+ZW5qYSBwcm9ncmFtYSB6YSBwcmlwcmVtYW5qYSBwcmF2b3N1ZG5vZy4gTmFpbWUsIHRyYcW+aW8gc2FtIG5lxaF0byDFoXRvIGJpIG1vZ2xvIGRhIG1pIHBvbW9nbmUgb2tvIG1lbW9yaXphY2lqZSB2ZcSHaWggcGl0YW5qYSwgYWxpIG5pa2FrbyBuaXNhbSBtb2dhbyBkYSBwcm9uYcSRZW0gYXBsaWthY2lqdSBzYSBmbGXFoSBrYXJ0aWNhbWEga29qYSBudWRpIMWhaXJva2kgcHJpa2F6IGkgYmFyZW0gbWluaW11bSBmb3JtYXRpcmFuamEuIFN2ZSBqZSBpemdsZWRhbG8gdGFrbyBydcW+bm8gaSBqYWRubyAocG9nb3Rvdm8gQW5raSkuIFRha28gZGEgc2FtIG9kbHXEjWlvIGRhIHNlIG9wcm9iYW0gdSDigJ52aWJlIGtvZGlyYW5qdSIgaSBkYSBwb2t1xaFhbSBkYSBuYXByYXZpbSBhcGxpa2FjaWp1IHphIGZsZcWhIGthcnRpY2UgcG8gc3Zvam9qIG1qZXJpLiBBbGkgcG/FoXRvIGltYW0gcG9tYWxvIHByb2JsZW1hIHNhIHBlcmZla2Npb25pem1vbSwgcG9zbGUgZHVnaWggc2VzaWphIHXEjWVuamEgZG9yYWRhIG92ZSBhcGxpa2FjaWplIG1pIGplIGJpbGEgemFuaW1hY2lqYS4gS2FrbyBzYW0gcHJpamUgcHJpcHJlbWFuamEgcHJhdm9zdWRub2cgaXNwaXRhIGRldGFsam5vIHXEjWlvIG8gdcSNZW5qdSAobWV0YWtvZ25pdGl2bmEgbmF1a2EpIG5pamUgbWkgZmFsaWxvIGluc3BpcmFjaWplLiBOaSBtb2plIG5ha2xub3N0aSBrYSBwcm9rcmFzdHJpbmFjaWppIG5pc3UgcHVubyBwb21vZ2xlLiBLb3JhayBwbyBrb3JhayBkb8WhYW8gZG8gb3ZvZyBtb25zdHJ1bWEgc2EgMTAwMSBmdW5rY2lqb20uIElwYWsgemFkb3ZvbGphbiBzYW0ga2FrbyBqZSBwcm9ncmFtIGlzcGFvIGkgZGplbHVqZSBtaSBrYW8gZGEgYmkgbW9nYW8gZGEgYnVkZSBrb3Jpc3Rhbi4gSWFrbyB6YSBzYWQgZGplbHVqZSBkYSDEh2UgYml0aSBtYWxvIGtvbXBsaWtvdmFubyBkYSBnYSBwcm9zbGlqZWRpbSBuZWtvbSBvZCBrb2xlZ2EgKGplciBpcGFrIHRyZWJhIG1hbG8gcG96bmF2YW5qYSBDb21tYW5kIHByb21wdGEpLCBwb3RydWRpxId1IHNlIGRhIHNtaXNsaW0gbmVraSBuYcSNaW4gaSB1xI1pbmltIGdhIGRvc3R1cG5pbS4gQWtvIGlrbyBvdm8gxI1pdGEgLSB6bmHEjWkgZGEgc2FtIG5lxaF0byBzbWlzbGlvLgoKVGFrb8SRZSB6bmHEjWkgZGEgc2FtIHBvbG/FvmlvIHByYXZvc3VkbmkgaXNwaXQgKGplciB1IHN1cHJvdG5vbSBuZSBiaSBvdm8gbW9nYW8gb2QgYnJ1a2Ugbmlrb21lIHBva2F6YXRpKS4KClNhZCBrYW8gYnVkdcSHZW0ga29sZWdpL2tvbGVnaW5pY2ksIHBhciByaWplxI1pIHVwb3pvcmVuamEg4oCTIHBva3XFoWFqIGRhIG5lIGJ1ZGXFoSBrYW8gamEgaSBkYSBzZSB6YW1hamF2YcWhIHN2aW0gxaFhcmVuaW0gb3BjaWphbWEga29qZSBwcm9ncmFtIG51ZGkuIEZva3VzIGkgZGlzY2lwbGluYSBzdSBrbGp1xI0uCgpUbyBqZSB0byDFoXRvIHNlIHRpxI1lIHBhbWV0b3ZhbmphLCBvc3RhamUgbWkgc2FtbyBkYSB0aSBwb8W+ZWxpbSBzdnUgc3JlxId1IHUgcHJpcHJlbWkgcHJhdm9zdWRub2cgaXNwaXRhLiBEcsW+aSBzZSAtIG1vxb5lxaEgdGkgdG8uIFBhIHNlIGdsZWRhbW8KClNyZGHEjWFuIHBvemRyYXYgb2Qga29sZWdlLApCdWRpbWlyIEJvxb5vdmnEhw==';

interface Props {
  onOpenSearch?: () => void;
  onOpenDocxImport?: () => void;
  onToggleZen?: () => void;
  zenActive?: boolean;
  onOpenOnboarding?: () => void;
}

const PRIMARY_NAV = [
  { path: "/", icon: Home, label: "Dashboard" },
  { path: "/review", icon: RotateCcw, label: "Konsolidacija", badge: true },
];

const TOOLS_NAV = [
  { path: "/stats", label: "Statistika" },
  { path: "/metacognitive", label: "Dnevnik" },
  { path: "/mnemonic", label: "Mnemo radionica" },
  { path: "/planner", label: "Strateški planer" },
  { path: "/speed-reader", label: "Speed Reader" },
  { path: "/mind-map", label: "Mentalne mape" },
];

const TOOLS_PATHS = TOOLS_NAV.map(i => i.path);

export default function TopNav({ onToggleZen, zenActive, onOpenOnboarding }: Props) {
  const location = useLocation();
  const { stats } = useCardData();
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains("dark"));
  
  const [labOpen, setLabOpen] = useState(false);
  const labRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  const [mappingFlash, setMappingFlash] = useState(false);
  const mappingCountRef = useRef(0);

  const [versionOpen, setVersionOpen] = useState(false);
  const [_sysInfoOpen, _setSysInfoOpen] = useState(false);
  const [_sysPayload, _setSysPayload] = useState("");

  // Listen for mapping events (custom event from SourceReader)
  useEffect(() => {
    const handler = () => {
      mappingCountRef.current += 1;
      setMappingFlash(true);
      setTimeout(() => setMappingFlash(false), 1200);
    };
    window.addEventListener("codex-mapping-created", handler);
    return () => window.removeEventListener("codex-mapping-created", handler);
  }, []);

  const toggleDark = useCallback(() => {
    const next = !dark;
    setDarkState(next);
    setDarkMode(next);
  }, [dark]);

  // Close mega menu on click outside
  useEffect(() => {
    if (!labOpen) return;
    const handler = (e: MouseEvent) => {
      if (labRef.current && !labRef.current.contains(e.target as Node)) {
        setLabOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [labOpen]);

  // Close mega menu on route change
  useEffect(() => {
    setLabOpen(false);
  }, [location.pathname]);

  const isToolsActive = TOOLS_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));

  return (
    <nav className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
      {/* Desktop */}
      <div className="flex items-center h-11 px-4 gap-1 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5 mr-4 cursor-default" onDoubleClick={() => setVersionOpen(true)}>
          <img src={`${import.meta.env.BASE_URL}logo-icon.png`} alt="CODEX" className="h-6 w-6 rounded-full" />
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-primary select-none">CODEX</span>
        </div>

        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {PRIMARY_NAV.map(({ path, icon: Icon, label, badge }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              activeClassName="bg-primary/10 text-primary"
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{label}</span>
              {badge && stats.due > 0 && (
                <Badge variant="destructive" className="ml-0.5 text-[9px] h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {stats.due}
                </Badge>
              )}
            </NavLink>
          ))}

          {/* Alati dropdown */}
          <div ref={labRef} className="relative">
            <button
              onClick={() => startTransition(() => setLabOpen(v => !v))}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap hover:bg-secondary/60 ${
                isToolsActive || labOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wrench className="h-4 w-4 flex-shrink-0" />
              <span>Alati</span>
            </button>

            {labOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[200px] rounded-xl border bg-popover p-2 shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
                {TOOLS_NAV.map(({ path, label }) => {
                  const active = location.pathname === path;
                  return (
                    <Link
                      key={path}
                      to={path}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary/60 ${
                        active ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Kategorije link */}
          <NavLink
            to="/categories"
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            activeClassName="bg-primary/10 text-primary"
          >
            <FolderOpen className="h-4 w-4 flex-shrink-0" />
            <span>Kategorije</span>
          </NavLink>


          <NavLink
            to="/settings"
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            activeClassName="bg-primary/10 text-primary"
          >
            <SettingsIcon className="h-4 w-4 flex-shrink-0" />
            <span>Podešavanja</span>
          </NavLink>
        </div>

        <div className="flex items-center gap-0.5 ml-2">
          {/* Mapping badge */}
          {mappingFlash && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/15 text-success text-[10px] font-bold animate-in fade-in zoom-in-95 duration-300">
              <Plus className="h-3 w-3" />
              Mapirano
            </div>
          )}
          {onOpenOnboarding && (
            <button onClick={onOpenOnboarding} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" title="Vodič kroz aplikaciju" aria-label="Vodič kroz aplikaciju">
              <HelpCircle className="h-4 w-4" />
            </button>
          )}
          <button onClick={onToggleZen} className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${zenActive ? "text-primary bg-primary/10" : "text-muted-foreground"}`} title="Zen Mode" aria-label="Zen Mode">
            <Focus className="h-4 w-4" />
          </button>
          <button onClick={toggleDark} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" title="Tema" aria-label="Promijeni temu">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Dialog open={_sysInfoOpen} onOpenChange={_setSysInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-muted-foreground">Sistem Info</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap pr-4">
              {_sysPayload}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-foreground">System Info & Changelog</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Verzija</span>
              <span className="text-sm font-mono font-semibold text-foreground">v{__APP_VERSION__}</span>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Changelog</h4>
              <ScrollArea className="max-h-[40vh]">
                <ul className="space-y-2 pr-4 text-sm text-foreground/80">
                  <li className="flex gap-2"><span className="text-primary">•</span>Step 3 — Architectural refactoring & modularizacija</li>
                  <li className="flex gap-2"><span className="text-primary">•</span>Unified chronological sort (chapterPositionMap)</li>
                  <li className="flex gap-2"><span className="text-primary">•</span>DnD-kit portal fix za centrirani layout</li>
                  <li className="flex gap-2"><span className="text-primary">•</span>Auto-split: heading exclusion iz card body</li>
                  <li className="flex gap-2"><span className="text-primary">•</span>System audit & TypeScript hardening</li>
                </ul>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
