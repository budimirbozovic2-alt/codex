import { useLocation } from "react-router-dom";

import { NavLink } from "@/components/NavLink";
import { useCardContext } from "@/contexts/AppContext";



















import { useState, useCallback, useRef, useEffect, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Zap, Home, GraduationCap, RotateCcw, BookOpen, Map, Brain, Network, Target, Moon, Sun, Menu, X, Focus, Settings as SettingsIcon, BarChart3, FlaskConical, Database as DatabaseIcon, HelpCircle, Plus } from "lucide-react";
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
  { path: "/learn", icon: GraduationCap, label: "Učenje" },
  { path: "/review", icon: RotateCcw, label: "Konsolidacija", badge: true },
];

const LAB_ANALYTICS = [
  { path: "/stats", icon: BarChart3, label: "Statistika", desc: "Pregled napretka i analitika" },
  { path: "/knowledge-map", icon: Map, label: "Mapa znanja", desc: "Vizuelna mapa savladanosti" },
  { path: "/metacognitive", icon: BookOpen, label: "Dnevnik", desc: "Metakognitivne refleksije" },
];

const LAB_TOOLS = [
  { path: "/mnemonic", icon: Brain, label: "Mnemo radionica", desc: "Tehnike pamćenja" },
  { path: "/planner", icon: Target, label: "Strateški planer", desc: "Planiranje učenja" },
  { path: "/speed-reader", icon: Zap, label: "Speed Reader", desc: "Brzo čitanje podkategorija" },
  { path: "/mind-map", icon: Network, label: "Mentalne mape", desc: "Vizuelizacija hijerarhija i postupaka" },
];

const LAB_ITEMS = [...LAB_ANALYTICS, ...LAB_TOOLS];
const LAB_PATHS = LAB_ITEMS.map(i => i.path);

export default function TopNav({ onToggleZen, zenActive, onOpenOnboarding }: Props) {
  const location = useLocation();
  const { stats } = useCardContext();
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains("dark"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const labRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  const [mappingFlash, setMappingFlash] = useState(false);
  const mappingCountRef = useRef(0);

  const [versionOpen, setVersionOpen] = useState(false);
  const [_sysInfoOpen, _setSysInfoOpen] = useState(false);
  const [_sysPayload, _setSysPayload] = useState("");
  const _seqRef = useRef<{ phase: number; timer: ReturnType<typeof setTimeout> | null }>({ phase: 0, timer: null });

  const _resetSeq = useCallback(() => {
    if (_seqRef.current.timer) clearTimeout(_seqRef.current.timer);
    _seqRef.current = { phase: 0, timer: null };
  }, []);

  const _handleBrandClick = useCallback(() => {
    _resetSeq();
    _seqRef.current.phase = 1;
    _seqRef.current.timer = setTimeout(_resetSeq, 10000);
  }, [_resetSeq]);

  const _handleThemeSeq = useCallback((nextDark: boolean) => {
    const p = _seqRef.current.phase;
    if (p === 1 && !nextDark) { return; }
    if (p === 1 && nextDark) { _seqRef.current.phase = 2; return; }
    if (p === 2 && !nextDark) { _seqRef.current.phase = 3; return; }
    if (p === 3 && nextDark) {
      _resetSeq();
      try {
        _setSysPayload(decodeURIComponent(escape(atob(_app_core_manifest))));
        _setSysInfoOpen(true);
      } catch { /* noop */ }
      return;
    }
    _resetSeq();
  }, [_resetSeq]);

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
    _handleThemeSeq(next);
  }, [dark, _handleThemeSeq]);

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
    setMobileOpen(false);
  }, [location.pathname]);

  const isLabActive = LAB_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));

  return (
    <nav className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
      {/* Desktop */}
      <div className="hidden md:flex items-center h-11 px-4 gap-1 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5 mr-4 cursor-default" onClick={_handleBrandClick} onDoubleClick={() => setVersionOpen(true)}>
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

          {/* Laboratorija mega menu trigger */}
          <div ref={labRef} className="relative">
            <button
              onClick={() => startTransition(() => setLabOpen(v => !v))}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap hover:bg-secondary/60 ${
                isLabActive || labOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FlaskConical className="h-4 w-4 flex-shrink-0" />
              <span>Laboratorija</span>
            </button>

            {/* Mega menu panel */}
            {labOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[380px] rounded-xl border bg-popover p-4 shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-1">
                  {LAB_ITEMS.map(({ path, icon: Icon, label, desc }) => {
                    const active = location.pathname === path;
                    return (
                      <Link
                        key={path}
                        to={path}
                        className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-secondary/60 group ${
                          active ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className={`mt-0.5 rounded-md p-1.5 transition-colors ${
                          active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        }`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className={`font-medium leading-tight ${active ? "text-primary" : "text-foreground"}`}>
                            {label}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {desc}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <NavLink
            to="/database"
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            activeClassName="bg-primary/10 text-primary"
          >
            <DatabaseIcon className="h-4 w-4 flex-shrink-0" />
            <span>Baza podataka</span>
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
          <button onClick={onToggleZen} className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${zenActive ? "text-primary bg-primary/10" : "text-muted-foreground"}`} title="Zen Mode">
            <Focus className="h-4 w-4" />
          </button>
          <button onClick={toggleDark} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" title="Tema">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex items-center h-11 px-3 justify-between">
        <div className="flex items-center gap-2 cursor-default" onClick={_handleBrandClick} onDoubleClick={() => setVersionOpen(true)}>
          <img src={`${import.meta.env.BASE_URL}logo-icon.png`} alt="CODEX" className="h-6 w-6 rounded-full" />
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-primary select-none">CODEX</span>
        </div>
        <div className="flex items-center gap-1">
          {onOpenOnboarding && (
            <button onClick={onOpenOnboarding} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" title="Vodič">
              <HelpCircle className="h-4 w-4" />
            </button>
          )}
          <button onClick={onToggleZen} className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${zenActive ? "text-primary bg-primary/10" : "text-muted-foreground"}`} title="Zen Mode">
            <Focus className="h-4 w-4" />
          </button>
          <button onClick={toggleDark} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => setMobileOpen(v => !v)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground">
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t bg-background px-3 py-2 space-y-0.5">
          {PRIMARY_NAV.map(({ path, icon: Icon, label, badge }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              activeClassName="bg-primary/10 text-primary font-medium"
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{label}</span>
              {badge && stats.due > 0 && (
                <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-[20px] px-1">
                  {stats.due}
                </Badge>
              )}
            </NavLink>
          ))}

          {/* Analitika group */}
          <div className="pt-1.5 pb-0.5">
            <span className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Analitika</span>
          </div>
          {LAB_ANALYTICS.map(({ path, icon: Icon, label }) => (
            <NavLink key={path} to={path}
              className="flex items-center gap-2.5 px-3 py-2 pl-6 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              activeClassName="bg-primary/10 text-primary font-medium"
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* Alati group */}
          <div className="pt-1.5 pb-0.5">
            <span className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Alati</span>
          </div>
          {LAB_TOOLS.map(({ path, icon: Icon, label }) => (
            <NavLink key={path} to={path}
              className="flex items-center gap-2.5 px-3 py-2 pl-6 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              activeClassName="bg-primary/10 text-primary font-medium"
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}

          <NavLink
            to="/database"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            activeClassName="bg-primary/10 text-primary font-medium"
            onClick={() => setMobileOpen(false)}
          >
            <DatabaseIcon className="h-4 w-4 flex-shrink-0" />
            <span>Baza podataka</span>
          </NavLink>

          <NavLink
            to="/settings"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            activeClassName="bg-primary/10 text-primary font-medium"
            onClick={() => setMobileOpen(false)}
          >
            <SettingsIcon className="h-4 w-4 flex-shrink-0" />
            <span>Podešavanja</span>
          </NavLink>
        </div>
      )}
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
