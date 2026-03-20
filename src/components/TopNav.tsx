import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useCardContext } from "@/contexts/AppContext";
import { BarChart3 } from "lucide-react";
import { default as Home } from "lucide-react/dist/esm/icons/home";
import { default as GraduationCap } from "lucide-react/dist/esm/icons/graduation-cap";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as Database } from "lucide-react/dist/esm/icons/database";
import { default as Moon } from "lucide-react/dist/esm/icons/moon";
import { default as Sun } from "lucide-react/dist/esm/icons/sun";
import { default as Menu } from "lucide-react/dist/esm/icons/menu";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as Settings } from "lucide-react/dist/esm/icons/settings";
import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { path: "/", icon: Home, label: "Dashboard" },
  { path: "/learn", icon: GraduationCap, label: "Učenje" },
  { path: "/review", icon: RotateCcw, label: "Konsolidacija", badge: true },
  { path: "/stats", icon: BarChart3, label: "Statistika" },
  { path: "/metacognitive", icon: BookOpen, label: "Dnevnik" },
  { path: "/mnemonic", icon: Brain, label: "Mnemo radionica" },
  { path: "/planner", icon: Target, label: "Strateški planer" },
  { path: "/database", icon: Database, label: "Baza podataka" },
  { path: "/settings", icon: Settings, label: "Podešavanja" },
];

export default function TopNav() {
  const location = useLocation();
  const { stats } = useCardContext();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleDark = useCallback(() => {
    document.documentElement.classList.toggle("dark");
    setDark(d => !d);
  }, []);

  return (
    <nav className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
      {/* Desktop */}
      <div className="hidden md:flex items-center h-11 px-4 gap-1 max-w-7xl mx-auto">
        <span className="text-base font-serif italic text-primary mr-4 select-none tracking-tight">Memoria</span>

        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {NAV_ITEMS.map(({ path, icon: Icon, label, badge }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              activeClassName="bg-primary/10 text-primary"
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{label}</span>
              {badge && stats.due > 0 && (
                <Badge variant="destructive" className="ml-0.5 text-[9px] h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {stats.due}
                </Badge>
              )}
            </NavLink>
          ))}
        </div>

        <button onClick={toggleDark} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground ml-2" title="Tema">
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex items-center h-11 px-3 justify-between">
        <span className="text-base font-serif italic text-primary select-none">Memoria</span>
        <div className="flex items-center gap-1">
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
          {NAV_ITEMS.map(({ path, icon: Icon, label, badge }) => (
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
        </div>
      )}
    </nav>
  );
}
