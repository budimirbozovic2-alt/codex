import { ChevronRight } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { useMemo, memo } from "react";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { getParam } from "@/lib/url-params";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Početna tabla",
  "/learn": "Učenje",
  "/review": "Konsolidacija",
  "/create": "Kreiranje",
  "/edit": "Uređivanje",
  "/categories": "Kategorije",
  "/settings": "Podešavanja",
  "/settings/learning": "Algoritam",
  "/settings/app": "Aplikacija",
  "/settings/app/personalization": "Personalizacija",
  "/settings/app/workflow": "Workflow",
  "/settings/data": "Podaci i sistem",
  "/stats": "Statistika",
  "/planner": "Strateški planer",
  "/forum": "Forum",
};

const LAB_ROUTES = new Set(["/stats", "/planner"]);

// O2 fix: memo prevents re-renders from parent when categoryRecords haven't changed
export default memo(function Breadcrumbs() {
  const { pathname, search } = useLocation();
  const { categoryRecords } = useCategoryData();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const scopedCategoryId = getParam(searchParams, "category");

  const categoryMatch = pathname.match(/^\/category\/([^/]+)/);
  const categoryId = categoryMatch?.[1];

  const categoryName = useMemo(() => {
    if (!categoryId) return "";
    return categoryRecords.find(c => c.id === categoryId)?.name ?? "…";
  }, [categoryId, categoryRecords]);

  const scopedCategoryName = useMemo(() => {
    if (!scopedCategoryId) return "";
    return categoryRecords.find(c => c.id === scopedCategoryId)?.name ?? "…";
  }, [scopedCategoryId, categoryRecords]);

  if (pathname === "/") return null;

  const crumbs: { label: string; path: string | null }[] = [
    { label: "Početna tabla", path: "/" },
  ];

  if (categoryId) {
    crumbs.push({ label: categoryName, path: null });
  } else if (pathname.startsWith("/settings")) {
    crumbs.push({ label: "Podešavanja", path: "/settings/learning" });

    const appSubMatch = pathname.match(/^\/settings\/app(?:\/(personalization|workflow))?$/);
    if (appSubMatch) {
      crumbs.push({ label: "Aplikacija", path: "/settings/app/personalization" });
      const subKey = appSubMatch[1];
      if (subKey) {
        const subLabel = ROUTE_LABELS[`/settings/app/${subKey}`];
        if (subLabel) crumbs.push({ label: subLabel, path: null });
      }
    } else {
      const label = ROUTE_LABELS[pathname];
      if (label) crumbs.push({ label, path: null });
    }
  } else if (LAB_ROUTES.has(pathname)) {
    crumbs.push({ label: "Alati", path: null });
    const label = ROUTE_LABELS[pathname];
    if (label) crumbs.push({ label, path: null });
  } else {
    const label = ROUTE_LABELS[pathname];
    if (label) crumbs.push({ label, path: null });
    if ((pathname === "/review" || pathname === "/learn") && scopedCategoryName) {
      crumbs.push({ label: scopedCategoryName, path: null });
    }
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
});
