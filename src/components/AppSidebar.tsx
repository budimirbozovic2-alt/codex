import { NavLink } from "@/components/NavLink";
import {
  Home, Settings as SettingsIcon, RotateCcw,
  BarChart3, BookOpen, Gauge, Zap, Map, Scale, Brain,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useCardData, useCategoryData } from "@/contexts/AppContext";

const STATIC_NAV = [
  { path: "/", icon: Home, label: "Početna tabla" },
];

const TOOLS_NAV = [
  { path: "/stats", icon: BarChart3, label: "Statistika" },
  { path: "/metacognitive", icon: BookOpen, label: "Dnevnik" },
  { path: "/mnemonics", icon: Brain, label: "Memorizacija" },
  { path: "/planner", icon: Gauge, label: "Strateški planer" },
  { path: "/speed-reader", icon: Zap, label: "Speed Reader" },
  { path: "/mind-map", icon: Map, label: "Mentalne mape" },
];


export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { stats } = useCardData();
  const { categoryRecords, categoryStats } = useCategoryData();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigacija</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Glavna navigacija">
            <SidebarMenu>
              {STATIC_NAV.map(({ path, icon: Icon, label }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton asChild tooltip={label}>
                    <NavLink
                      to={path}
                      end={path === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Predmeti</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Predmeti">
            <SidebarMenu>
              {categoryRecords.length === 0 && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Učitavanje predmeta…
                  </div>
                </SidebarMenuItem>
              )}

              {categoryRecords.map((cat) => {
                const st = categoryStats[cat.id];
                const due = st?.due ?? 0;

                return (
                  <SidebarMenuItem key={cat.id}>
                    <SidebarMenuButton asChild tooltip={cat.name}>
                      <NavLink
                        to={`/subject/${cat.id}`}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <Scale className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="truncate text-[13px]">{cat.name}</span>
                              {due > 0 && (
                                <Badge variant="destructive" className="ml-auto text-[9px] h-4 min-w-[16px] px-1 shrink-0">
                                  {due}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Alati</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Alati">
            <SidebarMenu>
              {TOOLS_NAV.map(({ path, icon: Icon, label }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton asChild tooltip={label}>
                    <NavLink
                      to={path}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Podešavanja">
                  <NavLink
                    to="/settings"
                    className="hover:bg-sidebar-accent/50"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <SettingsIcon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">Podešavanja</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
