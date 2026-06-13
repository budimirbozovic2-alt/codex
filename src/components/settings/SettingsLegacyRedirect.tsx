import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LEGACY_TAB_TO_SECTION } from "@/components/settings/settings-tab-legacy";

/** Redirects legacy `/settings?tab=…` (and bare `?category=`) to section routes. */
export default function SettingsLegacyRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== "/settings") return;

    const tab = searchParams.get("tab");
    const category = searchParams.get("category");

    if (tab) {
      const target = LEGACY_TAB_TO_SECTION[tab];
      if (target) {
        const qs = category ? `?category=${encodeURIComponent(category)}` : "";
        navigate(`${target}${qs}`, { replace: true });
      }
      return;
    }

    if (category) {
      navigate(`/settings/learning?category=${encodeURIComponent(category)}`, { replace: true });
    }
  }, [pathname, searchParams, navigate]);

  return null;
}
