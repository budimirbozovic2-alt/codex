import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import SettingsFormFooter from "@/components/settings/SettingsFormFooter";

interface Props {
  title: string;
  description: string;
  backTo?: string;
  backLabel?: string;
  subNav?: ReactNode;
  children: ReactNode;
  showFooter?: boolean;
}

export default function SettingsSectionLayout({
  title,
  description,
  backTo = "/settings",
  backLabel = "Sva podešavanja",
  subNav,
  children,
  showFooter = true,
}: Props) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to={backTo}
          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          aria-label={backLabel}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h2 className="imperial-title truncate">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {subNav}

      {children}

      {showFooter && <SettingsFormFooter />}
      <div className="pb-8" />
    </div>
  );
}
