import { useLocation } from "react-router-dom";
import { useAppContext } from "@/contexts/AppContext";
import {
  Home, GraduationCap, RotateCcw, Brain, BarChart3, Target,
  BookOpen, FolderOpen, Settings, Moon, Sun, Map, AlertTriangle,
} from "lucide-react";
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

const TOOLS_ITEMS = [
  { path: "/mnemonic", icon: Brain, label: "Memo radionica" },
  { path: "/cards", icon: BookOpen, label: "Kartice" },
  { path: "/categories", icon: FolderOpen, label: "Kategorije" },
  { path: "/frequent-errors", icon: AlertTriangle, label: "Česte greške" },
];

const ANALYTICS_ITEMS = [
  { path: "/stats", icon: BarChart3, label: "Statistike" },
  { path: "/planner", icon: Target, label: "Planer" },
  { path: "/knowledge-map", icon: Map, label: "Mapa znanja" },
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { stats } = useAppContext();
  const currentPath = location.pathname;

  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleDark = useCallback(() => {
    document.documentElement.classList.toggle("dark");
    setDark(d => !d);
  }, []);

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        {/* Logo */}
        <div className="px-4 pb-2">
          {!collapsed && (
            <h1 className="text-lg font-serif italic tracking-tight text-primary">Memoria</h1>
          )}
          {collapsed && (
            <span className="text-lg font-serif italic text-primary block text-center">M</span>
          )}
        </div>

        <SidebarSeparator />

        {/* Primary: Learning flow */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Učenje</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_ITEMS.map(item => (
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
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Tools */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Alati</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {TOOLS_ITEMS.map(item => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild isActive={isActive(item.path)}>
                    <NavLink
                      to={item.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Analytics */}
        <SidebarGroup defaultOpen>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Analitika</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {ANALYTICS_ITEMS.map(item => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild isActive={isActive(item.path)}>
                    <NavLink
                      to={item.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: Settings + Dark mode */}
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
