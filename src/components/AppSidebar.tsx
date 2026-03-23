import { useLocation } from "react-router-dom";
import { useCardContext } from "@/contexts/AppContext";
import { default as Home } from "lucide-react/dist/esm/icons/home";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { default as GraduationCap } from "lucide-react/dist/esm/icons/graduation-cap";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as FolderOpen } from "lucide-react/dist/esm/icons/folder-open";
import { default as Settings } from "lucide-react/dist/esm/icons/settings";
import { default as Moon } from "lucide-react/dist/esm/icons/moon";
import { default as Sun } from "lucide-react/dist/esm/icons/sun";
import { default as FlaskConical } from "lucide-react/dist/esm/icons/flask-conical";
import { default as DatabaseIcon } from "lucide-react/dist/esm/icons/database";
import { default as Network } from "lucide-react/dist/esm/icons/network";
import { BarChart3 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

const PRIMARY_ITEMS = [
  { path: "/", icon: Home, label: "Početna" },
  { path: "/learn", icon: GraduationCap, label: "Uči" },
  { path: "/review", icon: RotateCcw, label: "Ponavljaj", badge: true },
];

const LAB_ITEMS = [
  { path: "/stats", icon: BarChart3, label: "Statistika" },
  { path: "/metacognitive", icon: BookOpen, label: "Dnevnik" },
  { path: "/mnemonic", icon: Brain, label: "Mnemo radionica" },
  { path: "/planner", icon: Target, label: "Strateški planer" },
  { path: "/database", icon: DatabaseIcon, label: "Kartice" },
  { path: "/categories", icon: FolderOpen, label: "Kategorije" },
  { path: "/speed-reader", icon: Zap, label: "Speed Reader" },
  { path: "/mind-map", icon: Network, label: "Mentalne mape" },
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { stats } = useCardContext();
  const currentPath = location.pathname;

  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleDark = useCallback(() => {
    const next = !dark;
    setDarkState(next);
    import("@/lib/app-settings").then(m => m.setDarkMode(next));
  }, [dark]);

  const isActive = (path: string) => currentPath === path;

  const renderNavItem = (item: { path: string; icon: any; label: string; badge?: boolean }) => (
    <SidebarMenuItem key={item.path}>
      <SidebarMenuButton asChild isActive={isActive(item.path)}>
        <NavLink
          to={item.path}
          end={item.path === "/"}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          activeClassName="bg-primary/10 text-primary font-medium"
        >
          <item.icon className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{item.label}</span>}
          {!collapsed && item.badge && stats.due > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-[20px] flex items-center justify-center">
              {stats.due}
            </Badge>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        {/* Logo */}
        <div className="px-4 pb-2">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo-icon.png`} alt="Memoria" className="h-7 w-7 rounded-md" />
              <h1 className="text-lg font-serif italic tracking-tight text-primary">Memoria</h1>
            </div>
          )}
          {collapsed && (
            <div className="flex justify-center">
              <img src={new URL('/logo-icon.png', import.meta.url).href} alt="Memoria" className="h-7 w-7 rounded-md" />
            </div>
          )}
        </div>

        <SidebarSeparator />

        {/* Primary */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Učenje</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_ITEMS.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Laboratorija */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <FlaskConical className="h-3 w-3" />
              Laboratorija
            </SidebarGroupLabel>
          )}
          {collapsed && (
            <div className="flex justify-center py-1">
              <FlaskConical className="h-4 w-4 text-muted-foreground/60" />
            </div>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {LAB_ITEMS.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")}>
              <NavLink
                to="/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                activeClassName="bg-primary/10 text-primary font-medium"
              >
                <Settings className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>Podešavanja</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleDark}>
              <span className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground cursor-pointer">
                {dark ? <Sun className="h-4 w-4 flex-shrink-0" /> : <Moon className="h-4 w-4 flex-shrink-0" />}
                {!collapsed && <span>{dark ? "Svijetli režim" : "Tamni režim"}</span>}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
