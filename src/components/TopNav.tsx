import { useLocation } from "react-router-dom";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { NavLink } from "@/components/NavLink";
import { useCardContext } from "@/contexts/AppContext";
import { default as Home } from "lucide-react/dist/esm/icons/home";
import { default as GraduationCap } from "lucide-react/dist/esm/icons/graduation-cap";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Map } from "lucide-react/dist/esm/icons/map";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as FolderOpen } from "lucide-react/dist/esm/icons/folder-open";
import { default as Moon } from "lucide-react/dist/esm/icons/moon";
import { default as Sun } from "lucide-react/dist/esm/icons/sun";
import { default as Menu } from "lucide-react/dist/esm/icons/menu";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as Focus } from "lucide-react/dist/esm/icons/focus";
import { default as SettingsIcon } from "lucide-react/dist/esm/icons/settings";
import { default as BarChart3 } from "lucide-react/dist/esm/icons/bar-chart-3";
import { default as FlaskConical } from "lucide-react/dist/esm/icons/flask-conical";
import { default as DatabaseIcon } from "lucide-react/dist/esm/icons/database";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { useState, useCallback, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

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

const LAB_ITEMS = [
  { path: "/stats", icon: BarChart3, label: "Statistika", desc: "Pregled napretka i analitika" },
  { path: "/knowledge-map", icon: Map, label: "Mapa znanja", desc: "Vizuelna mapa savladanosti" },
  { path: "/metacognitive", icon: BookOpen, label: "Dnevnik", desc: "Metakognitivne refleksije" },
  { path: "/mnemonic", icon: Brain, label: "Mnemo radionica", desc: "Tehnike pamćenja" },
  { path: "/planner", icon: Target, label: "Strateški planer", desc: "Planiranje učenja" },
  { path: "/speed-reader", icon: Zap, label: "Speed Reader", desc: "Brzo čitanje podkategorija" },
];

const LAB_PATHS = LAB_ITEMS.map(i => i.path);

export default function TopNav({ onToggleZen, zenActive, onOpenOnboarding }: Props) {
  const location = useLocation();
  const { stats } = useCardContext();
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains("dark"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const labRef = useRef<HTMLDivElement>(null);

  const toggleDark = useCallback(() => {
    const next = !dark;
    setDarkState(next);
    import("@/lib/app-settings").then(m => m.setDarkMode(next));
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
    setMobileOpen(false);
  }, [location.pathname]);

  const isLabActive = LAB_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));

  return (
    <nav className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
      {/* Desktop */}
      <div className="hidden md:flex items-center h-11 px-4 gap-1 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mr-4">
          <img src="/logo-icon.png" alt="Memoria" className="h-6 w-6 rounded-md" />
          <span className="text-base font-serif italic text-primary select-none tracking-tight">Memoria</span>
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
              onClick={() => setLabOpen(v => !v)}
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
          {onOpenOnboarding && (
            <button onClick={onOpenOnboarding} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" title="Vodič kroz aplikaciju">
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
        <div className="flex items-center gap-2">
          <img src="/logo-icon.png" alt="Memoria" className="h-6 w-6 rounded-md" />
          <span className="text-base font-serif italic text-primary select-none">Memoria</span>
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

          {/* Laboratorija group */}
          <div className="pt-1.5 pb-0.5">
            <span className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Laboratorija</span>
          </div>
          {LAB_ITEMS.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
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
    </nav>
  );
}
