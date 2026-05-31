import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { PanelLeft } from "lucide-react";
import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";

// ─── Context ────────────────────────────────────────────

type SidebarState = "expanded" | "collapsed";

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────

const SIDEBAR_COOKIE_KEY = "sidebar:state";
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";

interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function SidebarProvider({ children, defaultOpen = true }: SidebarProviderProps) {
  const [open, setOpenState] = React.useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COOKIE_KEY);
      return stored ? stored === "true" : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    try { localStorage.setItem(SIDEBAR_COOKIE_KEY, String(value)); } catch { /* noop */ }
  }, []);

  const toggleSidebar = React.useCallback(() => setOpen(!open), [open, setOpen]);

  // Keyboard shortcut: Ctrl+B
  useGlobalHotkey(
    e => (e.ctrlKey || e.metaKey) && e.key === "b",
    e => { e.preventDefault(); toggleSidebar(); },
    [toggleSidebar],
  );

  const state: SidebarState = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo(
    () => ({ state, open, setOpen, toggleSidebar }),
    [state, open, setOpen, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className="flex min-h-screen w-full"
        style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON } as React.CSSProperties}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// ─── Sidebar ────────────────────────────────────────────

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "icon" | "none";
}

export function Sidebar({ className, collapsible = "icon", children, ...props }: SidebarProps) {
  const { state } = useSidebar();

  return (
    <aside
      data-state={state}
      data-collapsible={collapsible}
      className={cn(
        "group/sidebar sticky top-0 h-screen flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out overflow-hidden shrink-0",
        state === "expanded" ? "w-[var(--sidebar-width)]" : "w-[var(--sidebar-width-icon)]",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

// ─── Sub-components ─────────────────────────────────────

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex-1 overflow-y-auto overflow-x-hidden py-2", className)} {...props} />
  );
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 py-1", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { state } = useSidebar();
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/50 transition-opacity",
        state === "collapsed" && "opacity-0",
        className
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-0.5", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("space-y-0.5", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("", className)} {...props} />;
}

interface SidebarMenuButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}

export function SidebarMenuButton({
  className,
  asChild = false,
  isActive = false,
  tooltip,
  ...props
}: SidebarMenuButtonProps) {
  const { state } = useSidebar();
  const Comp = asChild ? Slot : "div";

  const button = (
    <Comp
      data-active={isActive || undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors w-full cursor-pointer",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "data-[active]:bg-sidebar-accent data-[active]:text-sidebar-primary data-[active]:font-medium",
        state === "collapsed" && "justify-center px-0",
        className
      )}
      {...props}
    />
  );

  if (tooltip && state === "collapsed") {
    return (
      <div className="relative group/tooltip">
        {button}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs shadow-md border opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {tooltip}
        </div>
      </div>
    );
  }

  return button;
}

// ─── Trigger ────────────────────────────────────────────

interface SidebarTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function SidebarTrigger({ className, ...props }: SidebarTriggerProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors",
        className
      )}
      title="Toggle sidebar (Ctrl+B)"
      aria-label="Toggle sidebar"
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}
