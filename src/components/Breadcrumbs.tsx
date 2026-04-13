import { ChevronRight } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { useMemo } from "react";
import { useCategoryData } from "@/contexts/AppContext";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Početna tabla",
  "/learn": "Učenje",
  "/review": "Konsolidacija",
  "/create": "Kreiranje",
  "/edit": "Uređivanje",
  "/categories": "Kategorije",
  "/settings": "Podešavanja",
  "/stats": "Statistika",
  
  "/metacognitive": "Dnevnik",
  "/mnemonic": "Mnemo radionica",
  "/planner": "Strateški planer",
  "/speed-reader": "Speed Reader",
  "/mind-map": "Mentalne mape",
  "/frequent-errors": "Česte greške",
  "/forum": "Forum",
};

const LAB_ROUTES = new Set(["/stats", "/metacognitive", "/mnemonic", "/planner", "/speed-reader", "/mind-map"]);

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const { categoryRecords } = useCategoryData();

  const categoryMatch = pathname.match(/^\/category\/([^/]+)/);
  const categoryId = categoryMatch?.[1];

  const categoryName = useMemo(() => {
    if (!categoryId) return "";
    return categoryRecords.find(c => c.id === categoryId)?.name ?? "…";
  }, [categoryId, categoryRecords]);

  if (pathname === "/") return null;

  const crumbs: { label: string; path: string | null }[] = [
    { label: "Početna tabla", path: "/" },
  ];

  if (categoryId) {
    crumbs.push({ label: categoryName, path: null });
  } else if (LAB_ROUTES.has(pathname)) {
    crumbs.push({ label: "Laboratorija", path: null });
    const label = ROUTE_LABELS[pathname];
    if (label) crumbs.push({ label, path: null });
  } else {
    const label = ROUTE_LABELS[pathname];
    if (label) crumbs.push({ label, path: null });
  }

  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {crumb.path ? (
            <Link to={crumb.path} className="hover:text-foreground transition-colors">{crumb.label}</Link>
          ) : (
            <span className="text-foreground font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
