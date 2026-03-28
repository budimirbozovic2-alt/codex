import { useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { NavLink } from "@/components/NavLink";
import {
  Home, Landmark, Settings as SettingsIcon, RotateCcw,
  BarChart3, BookOpen, Gauge, Zap, Map, Scale,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { useCardContext } from "@/contexts/AppContext";

const STATIC_NAV = [
  { path: "/", icon: Home, label: "Dashboard" },
  { path: "/review", icon: RotateCcw, label: "Konsolidacija", badge: true },
  { path: "/forum", icon: Landmark, label: "Forum" },
  { path: "/settings", icon: SettingsIcon, label: "Podešavanja" },
];

const TOOLS_NAV = [
  { path: "/stats", icon: BarChart3, label: "Statistika" },
  { path: "/metacognitive", icon: BookOpen, label: "Dnevnik" },
  { path: "/planner", icon: Gauge, label: "Strateški planer" },
  { path: "/speed-reader", icon: Zap, label: "Speed Reader" },
  { path: "/mind-map", icon: Map, label: "Mentalne mape" },
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { stats } = useCardContext();
  const [categories, setCategories] = useState<CategoryRecord[]>([]);

  useEffect(() => {
    idbLoadCategories().then(setCategories).catch(() => {});
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Static navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigacija</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {STATIC_NAV.map(({ path, icon: Icon, label, badge }) => (
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
                      {!collapsed && badge && stats.due > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[9px] h-4 min-w-[16px] px-1">
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

        {/* Categories */}
        <SidebarGroup>
          <SidebarGroupLabel>Predmeti</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {categories.map((cat) => {
                const catPath = `/category/${cat.id}`;
                const isActive = location.pathname.startsWith(catPath);
                return (
                  <SidebarMenuItem key={cat.id}>
                    <SidebarMenuButton asChild tooltip={cat.name}>
                      <NavLink
                        to={catPath}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        {cat.color ? (
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                        ) : (
                          <Scale className="h-4 w-4 shrink-0" />
                        )}
                        {!collapsed && (
                          <span className="truncate text-[13px]">{cat.name}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>Alati</SidebarGroupLabel>
          <SidebarGroupContent>
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
