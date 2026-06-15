import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Učenje",
    items: [{ to: "/settings/learning", label: "Algoritam", end: false }],
  },
  {
    label: "Aplikacija",
    items: [
      { to: "/settings/app/personalization", label: "Personalizacija", end: true },
      { to: "/settings/app/workflow", label: "Workflow", end: true },
    ],
  },
  {
    label: "Podaci",
    items: [{ to: "/settings/data", label: "Predmeti i sistem", end: false }],
  },
] as const;

export default function SettingsNavSidebar() {
  return (
    <aside className="w-[220px] shrink-0 py-6 pl-4 pr-2">
      <p className="px-3 mb-4 text-sm font-semibold text-foreground">Podešavanja</p>
      <nav className="space-y-5" aria-label="Podešavanja">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        "block px-3 py-1.5 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                      )
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
